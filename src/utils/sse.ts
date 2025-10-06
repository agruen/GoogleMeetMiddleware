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

  req.on('close', () => {
    clearInterval(sub.heartbeat);
    channels.get(channel)?.delete(sub);
  });
}

export function broadcast(channel: string, event: string, data: unknown) {
  const subs = channels.get(channel);
  if (!subs) return;
  for (const sub of subs) {
    try {
      writeSse(sub.res, event, data);
      // Close after sending an active event
      if (event === 'active') {
        clearInterval(sub.heartbeat);
        sub.res.end();
      }
    } catch {
      // best-effort cleanup
      clearInterval(sub.heartbeat);
      sub.res.end();
      subs.delete(sub);
    }
  }
  if (event === 'active') channels.delete(channel);
}

