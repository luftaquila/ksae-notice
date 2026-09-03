import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { subscriptions } from '@/lib/db/schema';
import { createTestDb, seedUser, seedSubscription, type TestDb } from '../helpers';

// 0007 은 데이터만 만지는 1회성 마이그레이션이다. 스키마가 아니라 규칙을 시험한다:
// 살아 있고 무언가 켜 둔 계정만 result/form 을 받는다.
const MIGRATION = readFileSync(
  join(__dirname, '..', '..', '..', 'drizzle', '0007_enable_result_form_categories.sql'),
  'utf8',
);

function runMigration(db: TestDb) {
  // drizzle 의 migrator 와 같은 방식 — statement-breakpoint 로 나눠 한 문장씩 실행한다.
  for (const statement of MIGRATION.split('--> statement-breakpoint')) {
    db.run(sql.raw(statement));
  }
}

function categoriesOf(db: TestDb, userId: number) {
  return db
    .select({ category: subscriptions.category, isActive: subscriptions.isActive })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .all()
    .sort((a, b) => a.category.localeCompare(b.category));
}

let db: TestDb;

describe('0007_enable_result_form_categories', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('turns result and form on for an account that has any category on', () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    seedSubscription(db, userId, 'rule', { isActive: 0 });

    runMigration(db);

    expect(categoriesOf(db, userId)).toEqual([
      { category: 'form', isActive: 1 },
      { category: 'notice_Z', isActive: 1 },
      { category: 'result', isActive: 1 },
      { category: 'rule', isActive: 0 },
    ]);
  });

  it('leaves an account alone when every category is off', () => {
    const userId = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    seedSubscription(db, userId, 'notice_Z', { isActive: 0 });
    seedSubscription(db, userId, 'rule', { isActive: 0 });

    runMigration(db);

    expect(categoriesOf(db, userId).map((s) => s.category)).toEqual(['notice_Z', 'rule']);
  });

  it('leaves an account alone when it has no categories at all', () => {
    const userId = seedUser(db, { googleId: 'g3', email: 'c@test.com' });

    runMigration(db);

    expect(categoriesOf(db, userId)).toEqual([]);
  });

  it('skips withdrawn accounts', () => {
    const userId = seedUser(db, { googleId: 'g4', email: 'd@test.com', deletedAt: '2026-01-01T00:00:00.000Z' });
    seedSubscription(db, userId, 'notice_Z');

    runMigration(db);

    expect(categoriesOf(db, userId).map((s) => s.category)).toEqual(['notice_Z']);
  });

  it('does not duplicate or flip a row that already exists', () => {
    const userId = seedUser(db, { googleId: 'g5', email: 'e@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    seedSubscription(db, userId, 'result', { isActive: 0 });

    runMigration(db);
    runMigration(db);

    expect(categoriesOf(db, userId)).toEqual([
      { category: 'form', isActive: 1 },
      { category: 'notice_Z', isActive: 1 },
      { category: 'result', isActive: 0 },
    ]);
  });
});
