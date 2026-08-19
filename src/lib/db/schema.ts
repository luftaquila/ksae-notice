import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  googleId: text('google_id').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatar: text('avatar'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  deletedAt: text('deleted_at'),
  // The subscription period is an account-level fact: every path that sets it
  // covers all of the user's categories at once. NULL means no period at all.
  subscriptionExpiresAt: text('subscription_expires_at'),
  subscriptionRenewedAt: text('subscription_renewed_at'),
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
    index('posts_date_idx').on(table.date),
  ],
);

export const emailLogs = sqliteTable('email_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  postId: integer('post_id'),
  batchId: text('batch_id'),
  type: text('type').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  sentAt: text('sent_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('email_logs_status_sent_at_idx').on(table.status, table.sentAt),
  index('email_logs_user_id_idx').on(table.userId),
]);

export const crawlLogs = sqliteTable('crawl_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  boardType: text('board_type').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  newPostsCount: integer('new_posts_count').notNull().default(0),
  status: text('status').notNull(),
}, (table) => [
  index('crawl_logs_status_started_at_idx').on(table.status, table.startedAt),
]);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// 결제 주문 원장. 금액은 서버만 계산하고, 지급·회수는 status 조건부 UPDATE의
// changes 로 한 번만 통과시킨다 — returnUrl 과 웹훅이 같은 승인 건을 동시에
// 들고 들어와도 기간이 두 번 늘어나지 않는다 (lib/payment/orders.ts).
export const payments = sqliteTable(
  'payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: text('order_id').notNull().unique(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    // 탈퇴는 soft delete 라 users 행은 남지만, 영수증은 결제 시점의 주소로 읽혀야 한다.
    userEmail: text('user_email').notNull(),
    // 주문 시점에 안내한 연도. 실제로 늘어난 기간은 grantedTo 가 사실이다.
    targetYear: integer('target_year').notNull(),
    amount: integer('amount').notNull(),
    goodsName: text('goods_name').notNull(),
    status: text('status').notNull().default('pending'),
    method: text('method'),
    tid: text('tid'),
    // 지급 직전/직후 만료일. 취소할 때 정확히 되돌리기 위한 값이다.
    grantedFrom: text('granted_from'),
    grantedTo: text('granted_to'),
    failReason: text('fail_reason'),
    cancelReason: text('cancel_reason'),
    approvedAt: text('approved_at'),
    cancelledAt: text('cancelled_at'),
    // 대사와 장애 분석용 원문.
    rawAuth: text('raw_auth'),
    rawApprove: text('raw_approve'),
    rawCancel: text('raw_cancel'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index('payments_user_created_idx').on(table.userId, table.createdAt),
    index('payments_status_created_idx').on(table.status, table.createdAt),
  ],
);
