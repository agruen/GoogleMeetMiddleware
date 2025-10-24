import type { Response, Request } from 'express';

type Subscriber = {
  res: Response;
  heartbeat: NodeJS.Timeout;
};

const channels = new Map<string, Set<Subscriber>>();

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function subscribe(req: Request, res: Response, channel: string) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Hint for nginx to not buffer SSE
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sub: Subscriber = {
    res,
    heartbeat: setInterval(() => {
      // comment ping to keep connection alive
      res.write(`: ping ${Date.now()}\n\n`);
    }, 25000),
  };

  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel)!.add(sub);
  console.log(`[SSE] New subscriber to channel: ${channel}, total: ${channels.get(channel)!.size}`);

  req.on('close', () => {
    clearInterval(sub.heartbeat);
    channels.get(channel)?.delete(sub);
    console.log(`[SSE] Subscriber disconnected from: ${channel}, remaining: ${channels.get(channel)?.size || 0}`);
  });
}

export function broadcast(channel: string, event: string, data: unknown) {
  const subs = channels.get(channel);
  console.log(`[SSE] Broadcasting ${event} to channel: ${channel}, subscribers: ${subs?.size || 0}`);
  if (!subs) {
    console.log(`[SSE] No subscribers for channel: ${channel}`);
    return;
  }
  for (const sub of subs) {
    try {
      console.log(`[SSE] Sending ${event} event to subscriber`);
      writeSse(sub.res, event, data);
      // Close after sending an active event
      if (event === 'active') {
        clearInterval(sub.heartbeat);
        sub.res.end();
      }
    } catch (err) {
      // best-effort cleanup
      console.log(`[SSE] Error sending to subscriber:`, err);
      clearInterval(sub.heartbeat);
      sub.res.end();
      subs.delete(sub);
    }
  }
  if (event === 'active') channels.delete(channel);
}

