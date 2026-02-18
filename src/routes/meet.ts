import { Router } from 'express';
import dayjs from 'dayjs';
import { db } from '../utils/db.js';
import { config } from '../utils/env.js';
import { createMeetWithRefreshToken } from '../adapters/google-meet/index.js';
import { subscribe, broadcast } from '../utils/sse.js';
import { isValidSlug } from '../utils/slug.js';

const router = Router();

router.get('/api/wait/:slug/stream', (req, res) => {
  const { slug } = req.params;

  // Validate slug format
  if (!isValidSlug(slug)) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write('event: error\n');
    res.write('data: {"message":"invalid-slug"}\n\n');
    return res.end();
  }

  const user = db.findUserBySlug(slug);
  if (!user) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write('event: error\n');
    res.write('data: {"message":"not-found"}\n\n');
    return res.end();
  }
  const active = db.getActiveMeet(user.id);
  if (active) {
    // immediate notify if already active
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(`event: active\n`);
    res.write(`data: ${JSON.stringify({ meetUrl: active.meetUrl })}\n\n`);
    return res.end();
  }
  db.upsertWaitingSession(slug, req.ip, req.headers['user-agent']);
  subscribe(req, res, `wait:${slug}`);
});

router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  // Validate slug format
  if (!isValidSlug(slug)) {
    return res.status(400).send('Invalid slug format');
  }

  const user = db.findUserBySlug(slug);
  if (!user) return res.status(404).send('User not found');

  const isHost = req.session.user && req.session.user.id === user.id;
  const active = db.getActiveMeet(user.id);

  if (isHost) {
    // Host: create if not active
    if (!active) {
      try {
        console.log(`[Meet] Host ${user.slug} creating new meeting`);
        const meetUrl = await createMeetWithRefreshToken(user.refreshTokenEnc);
        const expiresAt = dayjs().add(config.meetWindowMs(), 'millisecond').toISOString();
        db.createMeet(user.id, meetUrl, expiresAt);
        console.log(`[Meet] Meeting created: ${meetUrl}`);
        // notify waiters via SSE
        console.log(`[Meet] Broadcasting to channel: wait:${slug}`);
        broadcast(`wait:${slug}`, 'active', { meetUrl });
        return res.redirect(meetUrl);
      } catch (err) {
        console.error(err);
        return res.status(502).send('Failed to create Google Meet');
      }
    }
    console.log(`[Meet] Host ${user.slug} joining existing meeting: ${active.meetUrl}`);
    return res.redirect(active.meetUrl);
  }

  // External visitor: if active, redirect; otherwise show waiting room
  if (active) return res.redirect(active.meetUrl);
  db.upsertWaitingSession(slug, req.ip, req.headers['user-agent']);
  return res.render('waiting', { slug });
});

export default router;
