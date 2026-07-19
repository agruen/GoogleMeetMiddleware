import Database from 'better-sqlite3';
import dayjs from 'dayjs';

export type User = {
  id: number;
  googleId: string;
  email: string;
  firstName: string;
  lastName?: string | null;
  slug: string;
  refreshTokenEnc: string; // encrypted
  createdAt: string;
  updatedAt: string;
};

export type Meet = {
  id: number;
  userId: number;
  meetUrl: string;
  spaceName: string | null; // Meet API resource name ("spaces/{space}")
  expiresAt: string; // ISO
  createdAt: string;
};

import { env } from './env.js';

function openDb() {
  const dbFile = env('DB_FILE', 'app.sqlite');
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  return db;
}

const conn = openDb();

export const db = {
  init() {
    conn.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        googleId TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        firstName TEXT NOT NULL,
        lastName TEXT,
        slug TEXT UNIQUE NOT NULL,
        refreshTokenEnc TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `).run();

    conn.prepare(`
      CREATE TABLE IF NOT EXISTS meets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        meetUrl TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id)
      )
    `).run();

    conn.prepare(`
      CREATE INDEX IF NOT EXISTS idx_meets_userid_expires ON meets(userId, expiresAt)
    `).run();

    conn.prepare(`
      CREATE TABLE IF NOT EXISTS waiting_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        ip TEXT,
        ua TEXT,
        createdAt TEXT NOT NULL,
        lastSeenAt TEXT NOT NULL
      )
    `).run();

    // Migration: meets.spaceName (added for conference liveness checks)
    const meetColumns = conn.prepare('PRAGMA table_info(meets)').all() as { name: string }[];
    if (!meetColumns.some((c) => c.name === 'spaceName')) {
      conn.prepare('ALTER TABLE meets ADD COLUMN spaceName TEXT').run();
    }
  },

  // Users
  findUserByGoogleId(googleId: string): User | undefined {
    return conn.prepare('SELECT * FROM users WHERE googleId = ?').get(googleId) as User | undefined;
  },
  findUserBySlug(slug: string): User | undefined {
    return conn.prepare('SELECT * FROM users WHERE slug = ?').get(slug) as User | undefined;
  },
  findUserByEmail(email: string): User | undefined {
    return conn.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
  },
  countUsers(): number {
    const row = conn.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count;
  },
  getAllUsers(): User[] {
    return conn.prepare('SELECT * FROM users ORDER BY id ASC').all() as User[];
  },
  // The one-and-only account in single-user mode
  getFirstUser(): User | undefined {
    return conn.prepare('SELECT * FROM users ORDER BY id ASC LIMIT 1').get() as User | undefined;
  },
  insertUser(u: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User {
    const now = dayjs().toISOString();
    const info = conn
      .prepare(
        `INSERT INTO users(googleId, email, firstName, lastName, slug, refreshTokenEnc,
           createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        u.googleId,
        u.email,
        u.firstName,
        u.lastName ?? null,
        u.slug,
        u.refreshTokenEnc,
        now,
        now
      );
    return { ...u, id: Number(info.lastInsertRowid), createdAt: now, updatedAt: now };
  },
  updateUserRefreshToken(id: number, refreshTokenEnc: string) {
    const now = dayjs().toISOString();
    conn.prepare('UPDATE users SET refreshTokenEnc = ?, updatedAt = ? WHERE id = ?').run(
      refreshTokenEnc,
      now,
      id
    );
  },
  updateUserSlug(id: number, slug: string) {
    const now = dayjs().toISOString();
    conn.prepare('UPDATE users SET slug = ?, updatedAt = ? WHERE id = ?').run(slug, now, id);
  },

  // Meets
  getActiveMeet(userId: number): Meet | undefined {
    const now = dayjs().toISOString();
    return conn
      .prepare('SELECT * FROM meets WHERE userId = ? AND expiresAt > ? ORDER BY id DESC LIMIT 1')
      .get(userId, now) as Meet | undefined;
  },
  createMeet(
    userId: number,
    meetUrl: string,
    expiresAt: string,
    spaceName: string | null = null
  ): Meet {
    const now = dayjs().toISOString();
    const info = conn
      .prepare(
        'INSERT INTO meets(userId, meetUrl, spaceName, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)'
      )
      .run(userId, meetUrl, spaceName, expiresAt, now);
    return {
      id: Number(info.lastInsertRowid),
      userId,
      meetUrl,
      spaceName,
      expiresAt,
      createdAt: now,
    };
  },

  // Waiting sessions (best-effort; not critical path)
  addWaitingSession(slug: string, ip?: string, ua?: string) {
    const now = dayjs().toISOString();
    conn
      .prepare(
        'INSERT INTO waiting_sessions(slug, ip, ua, createdAt, lastSeenAt) VALUES (?, ?, ?, ?, ?)'
      )
      .run(slug, ip ?? null, ua ?? null, now, now);
  },

  // Housekeeping: drop meeting records long past their window and old
  // waiting-session telemetry so the tables don't grow without bound.
  prune() {
    const meetCutoff = dayjs().subtract(7, 'day').toISOString();
    conn.prepare('DELETE FROM meets WHERE expiresAt < ?').run(meetCutoff);
    conn.prepare('DELETE FROM waiting_sessions WHERE lastSeenAt < ?').run(meetCutoff);
  },

  close() {
    conn.close();
  },
};
