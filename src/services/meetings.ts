import dayjs from 'dayjs';
import { db, type Meet, type User } from '../utils/db.js';
import { config } from '../utils/env.js';
import {
  createMeetWithRefreshToken,
  spaceHasActiveConference,
} from '../adapters/google-meet/index.js';
import { broadcast, channelsWithSubscribers } from '../utils/sse.js';

export function waitChannel(slug: string): string {
  return `wait:${slug}`;
}

function meetAgeMs(meet: Meet): number {
  return Date.now() - Date.parse(meet.createdAt);
}

export function isWithinGraceWindow(meet: Meet): boolean {
  return meetAgeMs(meet) <= config.meetWindowMs();
}

// Liveness answers are cached briefly so a page load, the status poller and
// the sweeper don't each hit the Meet API for the same user.
const LIVENESS_TTL_MS = 15_000;
const livenessCache = new Map<number, { checkedAt: number; live: boolean }>();
const livenessInFlight = new Map<number, Promise<boolean>>();

async function isConferenceLive(user: User, meet: Meet & { spaceName: string }): Promise<boolean> {
  const cached = livenessCache.get(user.id);
  if (cached && Date.now() - cached.checkedAt < LIVENESS_TTL_MS) return cached.live;

  const inFlight = livenessInFlight.get(user.id);
  if (inFlight) return inFlight;

  const check = (async () => {
    try {
      const live = await spaceHasActiveConference(user.refreshTokenEnc, meet.spaceName);
      livenessCache.set(user.id, { checkedAt: Date.now(), live });
      return live;
    } catch (err) {
      // Unknown state: treat as not live (visitors keep waiting rather than
      // being sent into a possibly-ended call), but cache the answer so an
      // API outage doesn't turn into a request stampede.
      console.warn(
        `[Meet] Liveness check failed for ${user.slug}:`,
        err instanceof Error ? err.message : err
      );
      livenessCache.set(user.id, { checkedAt: Date.now(), live: false });
      return false;
    } finally {
      livenessInFlight.delete(user.id);
    }
  })();
  livenessInFlight.set(user.id, check);
  return check;
}

/**
 * The meeting a visitor should be sent to right now, or null if they should
 * wait. A meeting is joinable while it is inside the grace window (the host
 * just created it) and, after that, for as long as its conference is actually
 * live on Google's side.
 */
export async function resolveJoinableMeet(user: User): Promise<Meet | null> {
  const meet = db.getActiveMeet(user.id);
  if (!meet) return null;
  if (isWithinGraceWindow(meet)) return meet;
  // Rows from before the spaceName migration can't be liveness-checked;
  // treat them like the old fixed-window behavior.
  if (!meet.spaceName) return null;
  const live = await isConferenceLive(user, meet as Meet & { spaceName: string });
  return live ? meet : null;
}

// Single-flight per host: two concurrent visits (double click, laptop+phone)
// must never mint two different meetings and strand waiters in the wrong one.
const createInFlight = new Map<number, Promise<Meet>>();

/**
 * Return the meeting the host should be in, creating one if none is joinable.
 * Creation notifies every waiting visitor on this host's channel.
 */
export async function ensureActiveMeetForHost(user: User): Promise<Meet> {
  const existing = createInFlight.get(user.id);
  if (existing) return existing;

  const flight = (async () => {
    const joinable = await resolveJoinableMeet(user);
    if (joinable) {
      console.log(`[Meet] Host ${user.slug} joining existing meeting: ${joinable.meetUrl}`);
      return joinable;
    }
    console.log(`[Meet] Host ${user.slug} creating new meeting`);
    const created = await createMeetWithRefreshToken(user.refreshTokenEnc);
    const expiresAt = dayjs().add(config.meetMaxAgeMs(), 'millisecond').toISOString();
    const meet = db.createMeet(user.id, created.meetUrl, expiresAt, created.spaceName);
    // A stale "not live" verdict for the previous meeting must not mask this one.
    livenessCache.delete(user.id);
    db.prune();
    console.log(`[Meet] Meeting created: ${meet.meetUrl}`);
    broadcast(waitChannel(user.slug), 'active', { meetUrl: meet.meetUrl });
    return meet;
  })();

  createInFlight.set(user.id, flight);
  try {
    return await flight;
  } finally {
    createInFlight.delete(user.id);
  }
}

/**
 * Periodic safety net for everyone parked on a waiting page: if their host's
 * meeting has become joinable (e.g. the conference went live after the grace
 * window, or a broadcast was missed), redirect them now.
 */
export async function sweepWaitingRooms(): Promise<void> {
  for (const channel of channelsWithSubscribers()) {
    if (!channel.startsWith('wait:')) continue;
    const slug = channel.slice('wait:'.length);
    const user = db.findUserBySlug(slug);
    if (!user) continue;
    try {
      const meet = await resolveJoinableMeet(user);
      if (meet) {
        console.log(`[Meet] Sweep: meeting for ${slug} is joinable, notifying waiters`);
        broadcast(channel, 'active', { meetUrl: meet.meetUrl });
      }
    } catch (err) {
      console.error(`[Meet] Sweep failed for ${slug}:`, err);
    }
  }
}

const SWEEP_INTERVAL_MS = 20_000;
let sweepTimer: NodeJS.Timeout | null = null;
let sweepRunning = false;

export function startWaitingRoomSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    if (sweepRunning) return;
    sweepRunning = true;
    void sweepWaitingRooms().finally(() => {
      sweepRunning = false;
    });
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
}

export function stopWaitingRoomSweeper(): void {
  if (!sweepTimer) return;
  clearInterval(sweepTimer);
  sweepTimer = null;
}
