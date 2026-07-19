import type { Request, Response } from 'express';
import dayjs from 'dayjs';

jest.mock('../../src/adapters/google-meet/index', () => ({
  createMeetWithRefreshToken: jest.fn(),
  spaceHasActiveConference: jest.fn(),
}));

import { db, type User } from '../../src/utils/db';
import {
  ensureActiveMeetForHost,
  resolveJoinableMeet,
  sweepWaitingRooms,
  waitChannel,
} from '../../src/services/meetings';
import { subscribe, channelsWithSubscribers } from '../../src/utils/sse';
import {
  createMeetWithRefreshToken,
  spaceHasActiveConference,
} from '../../src/adapters/google-meet/index';
import { FakeReq, FakeRes } from '../helpers/fake-sse';

const mockCreate = createMeetWithRefreshToken as jest.MockedFunction<
  typeof createMeetWithRefreshToken
>;
const mockLive = spaceHasActiveConference as jest.MockedFunction<typeof spaceHasActiveConference>;

let seq = 0;
function makeUser(): User {
  seq++;
  const unique = `${process.pid}-${seq}-${Date.now()}`;
  return db.insertUser({
    googleId: `google-${unique}`,
    email: `user-${unique}@example.com`,
    firstName: 'Test',
    lastName: null,
    slug: `testuser-${unique}`,
    refreshTokenEnc: 'enc-token',
  });
}

function insertMeet(userId: number, spaceName: string | null = 'spaces/testspace123') {
  const expiresAt = dayjs().add(8, 'hour').toISOString();
  return db.createMeet(userId, 'https://meet.google.com/abc-defg-hij', expiresAt, spaceName);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Shrink the grace window to 1ms so a just-inserted meeting counts as
// "post-grace" after a tiny sleep.
function usePostGraceWindow() {
  process.env.MEET_WINDOW_MS = '1';
}

beforeAll(() => {
  db.init();
});

afterAll(() => {
  db.close();
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.MEET_WINDOW_MS = '300000';
  process.env.MEET_MAX_AGE_MS = '28800000';
});

describe('resolveJoinableMeet', () => {
  test('no meeting → null', async () => {
    const user = makeUser();
    await expect(resolveJoinableMeet(user)).resolves.toBeNull();
  });

  test('within grace window → joinable without a liveness check', async () => {
    const user = makeUser();
    const meet = insertMeet(user.id);
    const resolved = await resolveJoinableMeet(user);
    expect(resolved?.meetUrl).toBe(meet.meetUrl);
    expect(mockLive).not.toHaveBeenCalled();
  });

  test('post-grace with live conference → joinable', async () => {
    const user = makeUser();
    const meet = insertMeet(user.id);
    usePostGraceWindow();
    await sleep(10);
    mockLive.mockResolvedValue(true);
    const resolved = await resolveJoinableMeet(user);
    expect(resolved?.meetUrl).toBe(meet.meetUrl);
    expect(mockLive).toHaveBeenCalledWith(user.refreshTokenEnc, 'spaces/testspace123');
  });

  test('post-grace with no live conference → null', async () => {
    const user = makeUser();
    insertMeet(user.id);
    usePostGraceWindow();
    await sleep(10);
    mockLive.mockResolvedValue(false);
    await expect(resolveJoinableMeet(user)).resolves.toBeNull();
  });

  test('post-grace when the liveness check fails → null (visitor keeps waiting)', async () => {
    const user = makeUser();
    insertMeet(user.id);
    usePostGraceWindow();
    await sleep(10);
    mockLive.mockRejectedValue(new Error('api down'));
    await expect(resolveJoinableMeet(user)).resolves.toBeNull();
  });

  test('post-grace legacy row without spaceName → null', async () => {
    const user = makeUser();
    insertMeet(user.id, null);
    usePostGraceWindow();
    await sleep(10);
    await expect(resolveJoinableMeet(user)).resolves.toBeNull();
    expect(mockLive).not.toHaveBeenCalled();
  });

  test('liveness answers are cached briefly', async () => {
    const user = makeUser();
    insertMeet(user.id);
    usePostGraceWindow();
    await sleep(10);
    mockLive.mockResolvedValue(true);
    await resolveJoinableMeet(user);
    await resolveJoinableMeet(user);
    await resolveJoinableMeet(user);
    expect(mockLive).toHaveBeenCalledTimes(1);
  });
});

describe('ensureActiveMeetForHost', () => {
  test('creates a meeting, stores the space name, and notifies waiters', async () => {
    const user = makeUser();
    mockCreate.mockResolvedValue({
      meetUrl: 'https://meet.google.com/new-link-one',
      spaceName: 'spaces/newspace1',
    });

    const req = new FakeReq();
    const res = new FakeRes();
    subscribe(req as unknown as Request, res as unknown as Response, waitChannel(user.slug));

    const meet = await ensureActiveMeetForHost(user);
    expect(meet.meetUrl).toBe('https://meet.google.com/new-link-one');
    expect(meet.spaceName).toBe('spaces/newspace1');
    expect(db.getActiveMeet(user.id)?.meetUrl).toBe(meet.meetUrl);

    // The waiter got the redirect event and their stream was closed.
    expect(res.body).toContain('event: active');
    expect(res.body).toContain('https://meet.google.com/new-link-one');
    expect(res.writableEnded).toBe(true);
    expect(channelsWithSubscribers()).not.toContain(waitChannel(user.slug));
  });

  test('concurrent host requests share one creation (no duplicate meetings)', async () => {
    const user = makeUser();
    mockCreate.mockImplementation(async () => {
      await sleep(30);
      return { meetUrl: 'https://meet.google.com/single-flight', spaceName: 'spaces/sf' };
    });

    const [a, b] = await Promise.all([
      ensureActiveMeetForHost(user),
      ensureActiveMeetForHost(user),
    ]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(a.meetUrl).toBe('https://meet.google.com/single-flight');
    expect(b.meetUrl).toBe(a.meetUrl);
  });

  test('host rejoins a post-grace meeting whose conference is still live', async () => {
    const user = makeUser();
    const meet = insertMeet(user.id);
    usePostGraceWindow();
    await sleep(10);
    mockLive.mockResolvedValue(true);

    const resolved = await ensureActiveMeetForHost(user);
    expect(resolved.meetUrl).toBe(meet.meetUrl);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('host gets a fresh meeting when the old conference has ended', async () => {
    const user = makeUser();
    insertMeet(user.id);
    usePostGraceWindow();
    await sleep(10);
    mockLive.mockResolvedValue(false);
    mockCreate.mockResolvedValue({
      meetUrl: 'https://meet.google.com/fresh-link',
      spaceName: 'spaces/fresh',
    });

    const resolved = await ensureActiveMeetForHost(user);
    expect(resolved.meetUrl).toBe('https://meet.google.com/fresh-link');
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // The new meeting is now the joinable one (fresh grace window, and the
    // stale "not live" cache entry must have been dropped).
    process.env.MEET_WINDOW_MS = '300000';
    const joinable = await resolveJoinableMeet(user);
    expect(joinable?.meetUrl).toBe('https://meet.google.com/fresh-link');
  });

  test('a failed creation is not cached; the next attempt retries', async () => {
    const user = makeUser();
    mockCreate.mockRejectedValueOnce(new Error('quota'));
    await expect(ensureActiveMeetForHost(user)).rejects.toThrow('quota');

    mockCreate.mockResolvedValue({
      meetUrl: 'https://meet.google.com/retry-ok',
      spaceName: 'spaces/retry',
    });
    const meet = await ensureActiveMeetForHost(user);
    expect(meet.meetUrl).toBe('https://meet.google.com/retry-ok');
  });
});

describe('sweepWaitingRooms', () => {
  test('redirects waiters once their meeting is joinable', async () => {
    const user = makeUser();
    const req = new FakeReq();
    const res = new FakeRes();
    subscribe(req as unknown as Request, res as unknown as Response, waitChannel(user.slug));

    // Nothing joinable yet: sweep is a no-op.
    await sweepWaitingRooms();
    expect(res.body).not.toContain('event: active');

    const meet = insertMeet(user.id);
    await sweepWaitingRooms();
    expect(res.body).toContain('event: active');
    expect(res.body).toContain(meet.meetUrl);
    expect(res.writableEnded).toBe(true);
  });

  test('ignores channels whose user no longer exists', async () => {
    const req = new FakeReq();
    const res = new FakeRes();
    subscribe(req as unknown as Request, res as unknown as Response, waitChannel('ghost-user-xyz'));
    await expect(sweepWaitingRooms()).resolves.toBeUndefined();
    expect(res.body).not.toContain('event: active');
    (req as FakeReq).emit('close');
  });
});
