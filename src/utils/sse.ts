import type { Response, Request } from 'express';

type Subscriber = {
  res: Response;
  heartbeat: NodeJS.Timeout;
};

const channels = new Map<string, Set<Subscriber>>();

const HEARTBEAT_INTERVAL_MS = 25_000;
// Reconnection delay hint for the browser's EventSource
const RETRY_HINT = 'retry: 3000\n\n';

function sseHeaders(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  // Hint for nginx to not buffer SSE
  res.setHeader('X-Accel-Buffering', 'no');
}

// A dead client must never take the process down with it: swallow write
// failures and report them to the caller instead.
function safeWrite(res: Response, chunk: string): boolean {
  if (res.destroyed || res.writableEnded) return false;
  try {
    res.write(chunk);
    return true;
  } catch {
    return false;
  }
}

function writeSse(res: Response, event: string, data: unknown): boolean {
  return safeWrite(res, `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Send a single event on a fresh SSE response and close it. Used when the
 * answer is already known at connect time (meeting active, terminal error).
 */
export function sendEventAndClose(res: Response, event: string, data: unknown) {
  if (!res.headersSent) {
    sseHeaders(res);
    res.flushHeaders?.();
    safeWrite(res, RETRY_HINT);
  }
  writeSse(res, event, data);
  try {
    res.end();
  } catch {
    // already gone
  }
}

export function subscribe(req: Request, res: Response, channel: string) {
  sseHeaders(res);
  res.flushHeaders?.();
  safeWrite(res, RETRY_HINT);

  const sub: Subscriber = {
    res,
    heartbeat: setInterval(() => {
      // comment ping to keep the connection alive through proxies
      if (!safeWrite(res, `: ping ${Date.now()}\n\n`)) remove(channel, sub);
    }, HEARTBEAT_INTERVAL_MS),
  };
  // Heartbeats must not keep the process alive on their own (they'd block
  // clean shutdown and test teardown); the HTTP server holds the process.
  sub.heartbeat.unref?.();

  let subs = channels.get(channel);
  if (!subs) {
    subs = new Set();
    channels.set(channel, subs);
  }
  subs.add(sub);
  console.log(`[SSE] +1 subscriber on ${channel} (${subs.size} total)`);

  // Socket errors surface as 'error' events; without a listener they become
  // uncaught exceptions and crash the server for everyone else.
  res.on('error', () => {});
  req.on('close', () => remove(channel, sub));
}

function remove(channel: string, sub: Subscriber) {
  clearInterval(sub.heartbeat);
  const subs = channels.get(channel);
  if (!subs || !subs.delete(sub)) return;
  if (subs.size === 0) channels.delete(channel);
  console.log(`[SSE] -1 subscriber on ${channel} (${subs.size} left)`);
}

export function broadcast(channel: string, event: string, data: unknown) {
  const subs = channels.get(channel);
  if (!subs || subs.size === 0) return;
  console.log(`[SSE] Broadcasting "${event}" to ${subs.size} subscriber(s) on ${channel}`);
  for (const sub of [...subs]) {
    writeSse(sub.res, event, data);
    if (event === 'active') {
      // The waiter is being redirected; their stream is done.
      remove(channel, sub);
      try {
        sub.res.end();
      } catch {
        // already gone
      }
    }
  }
}

export function channelsWithSubscribers(): string[] {
  return [...channels.keys()];
}

/**
 * End every open stream (graceful shutdown). Clients auto-reconnect once the
 * server is back, instead of hanging on a half-dead TCP connection.
 */
export function closeAllSubscribers() {
  for (const [channel, subs] of channels) {
    for (const sub of [...subs]) {
      remove(channel, sub);
      try {
        sub.res.end();
      } catch {
        // already gone
      }
    }
  }
}
