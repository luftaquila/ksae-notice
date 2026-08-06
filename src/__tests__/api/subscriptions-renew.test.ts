import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedSubscription, seedSetting, EXPIRED, type TestDb } from '../helpers';
import { eq, and } from 'drizzle-orm';
import { subscriptions } from '@/lib/db/schema';

let db: TestDb;
let mockSessionValue: any = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  auth: () => mockSessionValue,
}));

const { POST } = await import('@/app/api/subscriptions/renew/route');

describe('POST /api/subscriptions/renew', () => {
  beforeEach(() => {
    db = createTestDb();
    mockSessionValue = null;
  });

  it('returns 401 when not authenticated', async () => {
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('renews active subscriptions to next year end', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z', { expiresAt: '2025-12-31T23:59:59.000Z' });
    seedSubscription(db, userId, 'rule', { isActive: 0, expiresAt: '2025-12-31T23:59:59.000Z' });

    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const res = await POST();
    const data = await res.json();
    expect(data.ok).toBe(true);

    const subs = db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all();
    const activeSub = subs.find(s => s.category === 'notice_Z')!;
    const inactiveSub = subs.find(s => s.category === 'rule')!;

    const expectedYear = new Date().getFullYear() + 1;
    expect(activeSub.expiresAt).toContain(`${expectedYear}-12-31`);
    expect(activeSub.renewedAt).not.toBeNull();
    // Inactive sub should NOT be renewed
    expect(inactiveSub.expiresAt).toBe('2025-12-31T23:59:59.000Z');
    expect(inactiveSub.renewedAt).toBeNull();
  });

  it('returns ok even when user has no subscriptions', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await POST();
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

describe('POST /api/subscriptions/renew - subscriber limit', () => {
  beforeEach(() => {
    db = createTestDb();
    mockSessionValue = null;
    seedSetting(db, 'registrationOpen', 'true');
    seedSetting(db, 'maxSubscribers', '1');
  });

  it('blocks a lapsed subscriber from reclaiming a slot someone else took', async () => {
    const taker = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, taker, 'notice_Z');
    const lapsed = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    seedSubscription(db, lapsed, 'notice_Z', { expiresAt: EXPIRED });

    mockSessionValue = { user: { id: lapsed, email: 'b@test.com' } };
    const res = await POST();
    expect(res.status).toBe(403);

    const sub = db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, lapsed), eq(subscriptions.category, 'notice_Z')))
      .get();
    expect(sub!.expiresAt).toBe(EXPIRED);
  });

  it('lets a lapsed subscriber renew while a slot is free', async () => {
    const lapsed = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    seedSubscription(db, lapsed, 'notice_Z', { expiresAt: EXPIRED });

    mockSessionValue = { user: { id: lapsed, email: 'b@test.com' } };
    const res = await POST();
    expect(res.status).toBe(200);

    const sub = db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, lapsed), eq(subscriptions.category, 'notice_Z')))
      .get();
    expect(sub!.expiresAt).toContain(`${new Date().getFullYear() + 1}-12-31`);
  });

  it('lets a current subscriber renew even when the limit is reached', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');

    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const res = await POST();
    expect(res.status).toBe(200);
  });
});
