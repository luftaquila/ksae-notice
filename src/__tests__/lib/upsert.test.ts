import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { createTestDb, seedUser, seedSubscription, EXPIRED, UNEXPIRED, type TestDb } from '../helpers';
import { users, subscriptions } from '@/lib/db/schema';

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

  // Turning a category on is the free half of the product. If it also started a
  // period, anyone could flip a toggle instead of paying.
  it('does not start a period for an account that has none', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });

    upsertSubscription(id, 'notice_Z');

    expect(periodOf(id)).toBeNull();
  });

  it('does not revive a lapsed period', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: EXPIRED });

    upsertSubscription(id, 'notice_Z');

    expect(periodOf(id)).toBe(EXPIRED);
  });

  it('leaves a paid period exactly where it is', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: UNEXPIRED });
    seedSubscription(db, id, 'notice_Z');

    upsertSubscription(id, 'notice_A');

    expect(periodOf(id)).toBe(UNEXPIRED);
    expect(categoryOf(id, 'notice_A')!.isActive).toBe(1);
  });
});
