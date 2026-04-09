import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  googleId: text('google_id').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatar: text('avatar'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  deletedAt: text('deleted_at'),
});

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    category: text('category').notNull(),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    expiresAt: text('expires_at').notNull(),
    renewedAt: text('renewed_at'),
  },
  (table) => [
    uniqueIndex('subscriptions_user_category_idx').on(table.userId, table.category),
  ],
);

export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    boardType: text('board_type').notNull(),
    postNumber: integer('post_number').notNull(),
    title: text('title').notNull(),
    category: text('category'),
    date: text('date').notNull(),
    isPinned: integer('is_pinned').notNull().default(0),
    url: text('url').notNull(),
    crawledAt: text('crawled_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('posts_board_number_idx').on(table.boardType, table.postNumber),
  ],
);

export const emailLogs = sqliteTable('email_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  postId: integer('post_id'),
  type: text('type').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  sentAt: text('sent_at').notNull().default(sql`(datetime('now'))`),
});

export const crawlLogs = sqliteTable('crawl_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  boardType: text('board_type').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  newPostsCount: integer('new_posts_count').notNull().default(0),
  status: text('status').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
