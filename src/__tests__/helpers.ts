import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { vi } from 'vitest';

// ── In-memory DB ──────────────────────────────────────────────
export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Create tables
  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      avatar TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE TABLE subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      category TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      renewed_at TEXT
    );
    CREATE UNIQUE INDEX subscriptions_user_category_idx ON subscriptions(user_id, category);
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_type TEXT NOT NULL,
      post_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT,
      date TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL,
      crawled_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX posts_board_number_idx ON posts(board_type, post_number);
    CREATE INDEX posts_date_idx ON posts(date);
    CREATE TABLE email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      post_id INTEGER,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX email_logs_status_sent_at_idx ON email_logs(status, sent_at);
    CREATE INDEX email_logs_user_id_idx ON email_logs(user_id);
    CREATE TABLE crawl_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_type TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      new_posts_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL
    );
    CREATE INDEX crawl_logs_status_started_at_idx ON crawl_logs(status, started_at);
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });
  return db;
}

export type TestDb = ReturnType<typeof createTestDb>;

// ── Mock session helper ───────────────────────────────────────
export function mockSession(userId: number, email: string, isAdmin = false) {
  return {
    user: { id: userId, email, name: 'Test User', isAdmin },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

// ── Seed helpers ──────────────────────────────────────────────
export function seedUser(db: TestDb, overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  const result = db.insert(schema.users).values({
    googleId: `google-${Date.now()}-${Math.random()}`,
    email: `user-${Date.now()}@test.com`,
    name: 'Test User',
    ...overrides,
  }).run();
  return Number(result.lastInsertRowid);
}

export function seedPost(db: TestDb, overrides: Partial<typeof schema.posts.$inferInsert> = {}) {
  const result = db.insert(schema.posts).values({
    boardType: 'notice',
    postNumber: Math.floor(Math.random() * 100000),
    title: 'Test Post',
    category: '공통',
    date: '2025-01-15',
    url: 'https://example.com/post',
    ...overrides,
  }).run();
  return Number(result.lastInsertRowid);
}

export function seedSubscription(db: TestDb, userId: number, category: string, overrides: Partial<typeof schema.subscriptions.$inferInsert> = {}) {
  const result = db.insert(schema.subscriptions).values({
    userId,
    category,
    isActive: 1,
    expiresAt: '2026-12-31T23:59:59.000Z',
    ...overrides,
  }).run();
  return Number(result.lastInsertRowid);
}

export function seedSetting(db: TestDb, key: string, value: string) {
  db.insert(schema.settings).values({ key, value }).run();
}

export function seedCrawlLog(db: TestDb, overrides: Partial<typeof schema.crawlLogs.$inferInsert> = {}) {
  const result = db.insert(schema.crawlLogs).values({
    boardType: 'notice',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    newPostsCount: 0,
    status: 'completed',
    ...overrides,
  }).run();
  return Number(result.lastInsertRowid);
}

export function seedEmailLog(db: TestDb, userId: number, overrides: Partial<typeof schema.emailLogs.$inferInsert> = {}) {
  const result = db.insert(schema.emailLogs).values({
    userId,
    type: 'notification',
    status: 'sent',
    ...overrides,
  }).run();
  return Number(result.lastInsertRowid);
}

// ── Shared upsertSubscription mock implementation ─────────────
export function createUpsertSubscriptionMock(getTestDb: () => TestDb) {
  return (userId: number, category: string) => {
    const testDb = getTestDb();
    const existing = testDb.select().from(schema.subscriptions)
      .where(
        require('drizzle-orm').and(
          require('drizzle-orm').eq(schema.subscriptions.userId, userId),
          require('drizzle-orm').eq(schema.subscriptions.category, category),
        ),
      )
      .get();
    const endOfYear = `${new Date().getFullYear()}-12-31T23:59:59.000Z`;
    if (existing) {
      testDb.update(schema.subscriptions)
        .set({ isActive: 1, expiresAt: endOfYear, renewedAt: new Date().toISOString() })
        .where(require('drizzle-orm').eq(schema.subscriptions.id, existing.id))
        .run();
    } else {
      testDb.insert(schema.subscriptions)
        .values({ userId, category, isActive: 1, expiresAt: endOfYear })
        .run();
    }
  };
}
