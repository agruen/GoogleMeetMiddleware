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
  insertUser(u: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User {
    const now = dayjs().toISOString();
    const info = conn
      .prepare(
        `INSERT INTO users(googleId, email, firstName, lastName, slug, refreshTokenEnc, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(u.googleId, u.email, u.firstName, u.lastName ?? null, u.slug, u.refreshTokenEnc, now, now);
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
  createMeet(userId: number, meetUrl: string, expiresAt: string): Meet {
    const now = dayjs().toISOString();
    const info = conn
      .prepare('INSERT INTO meets(userId, meetUrl, expiresAt, createdAt) VALUES (?, ?, ?, ?)')
      .run(userId, meetUrl, expiresAt, now);
    return { id: Number(info.lastInsertRowid), userId, meetUrl, expiresAt, createdAt: now };
  },

  // Waiting sessions (best-effort; not critical path)
  upsertWaitingSession(slug: string, ip?: string, ua?: string) {
    const now = dayjs().toISOString();
    conn
      .prepare(
        'INSERT INTO waiting_sessions(slug, ip, ua, createdAt, lastSeenAt) VALUES (?, ?, ?, ?, ?)'
      )
      .run(slug, ip ?? null, ua ?? null, now, now);
  },
};
