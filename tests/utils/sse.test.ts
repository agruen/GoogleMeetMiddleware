import type { Request, Response } from 'express';
import {
  subscribe,
  broadcast,
  sendEventAndClose,
  channelsWithSubscribers,
  closeAllSubscribers,
} from '../../src/utils/sse';
import { FakeReq, FakeRes } from '../helpers/fake-sse';

function connect(channel: string) {
  const req = new FakeReq();
  const res = new FakeRes();
  subscribe(req as unknown as Request, res as unknown as Response, channel);
  return { req, res };
}

afterEach(() => {
  closeAllSubscribers();
});

describe('sse', () => {
  test('subscribe sets SSE headers and a retry hint', () => {
    const { res } = connect('wait:headers');
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.body).toContain('retry: 3000');
  });

  test('broadcast("active") delivers the event, ends streams, and clears the channel', () => {
    const a = connect('wait:john');
    const b = connect('wait:john');
    broadcast('wait:john', 'active', { meetUrl: 'https://meet.google.com/x' });

    for (const { res } of [a, b]) {
      expect(res.body).toContain('event: active');
      expect(res.body).toContain('"meetUrl":"https://meet.google.com/x"');
      expect(res.writableEnded).toBe(true);
    }
    expect(channelsWithSubscribers()).not.toContain('wait:john');
  });

  test('a dead subscriber cannot break the broadcast for others', () => {
    const dead = connect('wait:mixed');
    const alive = connect('wait:mixed');
    dead.res.failWrites = true;

    expect(() =>
      broadcast('wait:mixed', 'active', { meetUrl: 'https://meet.google.com/y' })
    ).not.toThrow();
    expect(alive.res.body).toContain('event: active');
    expect(alive.res.writableEnded).toBe(true);
  });

  test('client disconnect removes the subscriber', () => {
    const { req } = connect('wait:leaver');
    expect(channelsWithSubscribers()).toContain('wait:leaver');
    req.emit('close');
    expect(channelsWithSubscribers()).not.toContain('wait:leaver');
  });

  test('heartbeat stops after the response ends instead of crashing', () => {
    jest.useFakeTimers();
    try {
      const { res } = connect('wait:sleeper');
      jest.advanceTimersByTime(26_000);
      expect(res.body).toContain(': ping');

      // Simulate the socket dying without a close event.
      res.writableEnded = true;
      expect(() => jest.advanceTimersByTime(60_000)).not.toThrow();
      expect(channelsWithSubscribers()).not.toContain('wait:sleeper');
    } finally {
      jest.useRealTimers();
    }
  });

  test('sendEventAndClose emits a single event on a fresh response', () => {
    const res = new FakeRes();
    sendEventAndClose(res as unknown as Response, 'active', { meetUrl: 'https://meet.google.com/z' });
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.body).toContain('event: active');
    expect(res.writableEnded).toBe(true);
  });
});
