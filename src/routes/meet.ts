import { Router, type Request, type Response } from 'express';
import { db, type User } from '../utils/db.js';
import { config } from '../utils/env.js';
import { subscribe, broadcast, sendEventAndClose } from '../utils/sse.js';
import { isValidSlug } from '../utils/slug.js';
import {
  ensureActiveMeetForHost,
  isWithinGraceWindow,
  resolveJoinableMeet,
  waitChannel,
} from '../services/meetings.js';

const router = Router();

function noStore(res: Response) {
  // Redirect targets and wait-state answers must never be served from a cache:
  // a stale meetUrl sends a visitor into the wrong (ended) call.
  res.setHeader('Cache-Control', 'no-store');
}

function singleUser(): User | undefined {
  return config.singleUserMode() ? db.getFirstUser() : undefined;
}

async function handleWaitStream(req: Request, res: Response, user: User) {
  const channel = waitChannel(user.slug);
  const meet = await resolveJoinableMeet(user);
  if (meet) {
    return sendEventAndClose(res, 'active', { meetUrl: meet.meetUrl });
  }
  db.addWaitingSession(user.slug, req.ip, req.headers['user-agent']);
  subscribe(req, res, channel);
  // The liveness check above awaited; a meeting created in that gap would have
  // been broadcast before we subscribed. Catch it with a synchronous re-check.
  const fresh = db.getActiveMeet(user.id);
  if (fresh && isWithinGraceWindow(fresh)) {
    broadcast(channel, 'active', { meetUrl: fresh.meetUrl });
  }
}

async function handleWaitStatus(res: Response, user: User) {
  const meet = await resolveJoinableMeet(user);
  if (meet) return res.json({ status: 'active', meetUrl: meet.meetUrl });
  return res.json({ status: 'waiting' });
}

// --- Single-user mode endpoints (root URL waiting room) ---

router.get('/api/wait/stream', async (req, res) => {
  const user = singleUser();
  if (!user) {
    if (!config.singleUserMode()) return res.status(404).send('Not found');
    return sendEventAndClose(res, 'error', { message: 'no-user', terminal: true });
  }
  try {
    await handleWaitStream(req, res, user);
  } catch (err) {
    console.error('[SSE] Stream failed (single-user):', err);
    sendEventAndClose(res, 'error', { message: 'server-error', terminal: false });
  }
});

router.get('/api/wait/status', async (_req, res) => {
  noStore(res);
  const user = singleUser();
  if (!user) return res.status(404).json({ status: 'not-found' });
  try {
    await handleWaitStatus(res, user);
  } catch (err) {
    console.error('[Meet] Status failed (single-user):', err);
    res.status(500).json({ status: 'error' });
  }
});

// --- Per-slug endpoints ---

router.get('/api/wait/:slug/stream', async (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) {
    return sendEventAndClose(res, 'error', { message: 'invalid-slug', terminal: true });
  }
  const user = db.findUserBySlug(slug);
  if (!user) {
    return sendEventAndClose(res, 'error', { message: 'not-found', terminal: true });
  }
  try {
    await handleWaitStream(req, res, user);
  } catch (err) {
    console.error(`[SSE] Stream failed for ${slug}:`, err);
    sendEventAndClose(res, 'error', { message: 'server-error', terminal: false });
  }
});

router.get('/api/wait/:slug/status', async (req, res) => {
  noStore(res);
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(404).json({ status: 'not-found' });
  const user = db.findUserBySlug(slug);
  if (!user) return res.status(404).json({ status: 'not-found' });
  try {
    await handleWaitStatus(res, user);
  } catch (err) {
    console.error(`[Meet] Status failed for ${slug}:`, err);
    res.status(500).json({ status: 'error' });
  }
});

// --- Personal meeting URL ---

router.get('/:slug', async (req, res) => {
  noStore(res);
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(404).send('Not found');

  const user = db.findUserBySlug(slug);
  if (!user) return res.status(404).send('User not found');

  const isHost = req.session.user?.id === user.id;

  if (isHost) {
    try {
      const meet = await ensureActiveMeetForHost(user);
      return res.redirect(meet.meetUrl);
    } catch (err) {
      console.error(`[Meet] Failed to create meeting for ${slug}:`, err);
      return res.status(502).send('Failed to create Google Meet');
    }
  }

  try {
    const meet = await resolveJoinableMeet(user);
    if (meet) return res.redirect(meet.meetUrl);
    db.addWaitingSession(user.slug, req.ip, req.headers['user-agent']);
    return res.render('waiting', { slug, singleUserMode: false });
  } catch (err) {
    console.error(`[Meet] Visitor flow failed for ${slug}:`, err);
    return res.status(500).send('Something went wrong');
  }
});

export default router;
