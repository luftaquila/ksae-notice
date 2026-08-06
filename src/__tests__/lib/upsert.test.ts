import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { createTestDb, seedUser, seedSubscription, EXPIRED, UNEXPIRED, type TestDb } from '../helpers';
import { users, subscriptions } from '@/lib/db/schema';
import { getEndOfYear } from '@/lib/constants';

let db: TestDb;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

const { upsertSubscription } = await import('@/lib/subscription/upsert');

function categoryOf(userId: number, category: string) {
  return db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, category)))
    .get();
}

function periodOf(userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get()!.subscriptionExpiresAt;
}

describe('upsertSubscription', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('reactivates a category the user already has a row for', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const rowId = seedSubscription(db, id, 'notice_Z', { isActive: 0 });

    upsertSubscription(id, 'notice_Z');

    const row = categoryOf(id, 'notice_Z')!;
    expect(row.id).toBe(rowId);
    expect(row.isActive).toBe(1);
  });

  it('inserts a category the user never had', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com' });

    upsertSubscription(id, 'rule');

    expect(categoryOf(id, 'rule')!.isActive).toBe(1);
  });

  it('starts a period for an account that has none', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });

    upsertSubscription(id, 'notice_Z');

    expect(periodOf(id)).toBe(getEndOfYear());
  });

  it('extends a lapsed period to the end of this year', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: EXPIRED });

    upsertSubscription(id, 'notice_Z');

    expect(periodOf(id)).toBe(getEndOfYear());
  });

  // The reason the period lives on the account: switching a category on used to
  // write this year end onto that one row, leaving it a year behind the others
  // for anyone who had already renewed.
  it('does not shorten a period that already runs past this year', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: UNEXPIRED });
    seedSubscription(db, id, 'notice_Z');

    upsertSubscription(id, 'notice_A');

    expect(periodOf(id)).toBe(UNEXPIRED);
    // and the newly added category runs to exactly the same date as the rest
    expect(categoryOf(id, 'notice_A')!.isActive).toBe(1);
  });
});
