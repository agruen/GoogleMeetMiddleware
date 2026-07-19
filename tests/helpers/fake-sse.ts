import { EventEmitter } from 'node:events';

/** Minimal stand-ins for Express req/res, good enough for the SSE utility. */

export class FakeRes extends EventEmitter {
  chunks: string[] = [];
  headers: Record<string, string> = {};
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  failWrites = false;

  setHeader(key: string, value: string) {
    this.headers[key.toLowerCase()] = value;
  }
  flushHeaders() {
    this.headersSent = true;
  }
  write(chunk: string): boolean {
    if (this.failWrites) throw new Error('boom: socket gone');
    if (this.writableEnded) throw new Error('write after end');
    this.headersSent = true;
    this.chunks.push(String(chunk));
    return true;
  }
  end() {
    this.writableEnded = true;
  }
  get body(): string {
    return this.chunks.join('');
  }
}

export class FakeReq extends EventEmitter {}
