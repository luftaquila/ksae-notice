import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedSubscription, seedSetting, EXPIRED, type TestDb } from '../helpers';
import { eq } from 'drizzle-orm';
import { users, settings } from '@/lib/db/schema';

let db: TestDb;
let mockSessionValue: any = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  auth: () => mockSessionValue,
}));

const { POST } = await import('@/app/api/subscriptions/renew/route');

function accountOf(userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get()!;
}

describe('POST /api/subscriptions/renew', () => {
  beforeEach(() => {
    db = createTestDb();
    mockSessionValue = null;
  });

  it('returns 401 when not authenticated', async () => {
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('renews the account period to next year end', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    seedSubscription(db, userId, 'rule', { isActive: 0 });

    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const res = await POST();
    expect((await res.json()).ok).toBe(true);

    const account = accountOf(userId);
    expect(account.subscriptionExpiresAt).toContain(`${new Date().getFullYear() + 1}-12-31`);
    expect(account.subscriptionRenewedAt).not.toBeNull();
  });

  it('does not renew an account holding no active category', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: EXPIRED });
    seedSubscription(db, userId, 'notice_Z', { isActive: 0 });

    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const res = await POST();
    expect((await res.json()).ok).toBe(true);

    const account = accountOf(userId);
    expect(account.subscriptionExpiresAt).toBe(EXPIRED);
    expect(account.subscriptionRenewedAt).toBeNull();
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
    const lapsed = seedUser(db, { googleId: 'g2', email: 'b@test.com', subscriptionExpiresAt: EXPIRED });
    seedSubscription(db, lapsed, 'notice_Z');

    mockSessionValue = { user: { id: lapsed, email: 'b@test.com' } };
    const res = await POST();
    expect(res.status).toBe(403);

    expect(accountOf(lapsed).subscriptionExpiresAt).toBe(EXPIRED);
  });

  it('lets a lapsed subscriber renew while a slot is free', async () => {
    const lapsed = seedUser(db, { googleId: 'g2', email: 'b@test.com', subscriptionExpiresAt: EXPIRED });
    seedSubscription(db, lapsed, 'notice_Z');

    mockSessionValue = { user: { id: lapsed, email: 'b@test.com' } };
    const res = await POST();
    expect(res.status).toBe(200);

    expect(accountOf(lapsed).subscriptionExpiresAt).toContain(`${new Date().getFullYear() + 1}-12-31`);
  });

  it('tells a lapsed subscriber the real reason when registration is closed', async () => {
    db.update(settings).set({ value: 'false' }).where(eq(settings.key, 'registrationOpen')).run();
    db.update(settings).set({ value: '50' }).where(eq(settings.key, 'maxSubscribers')).run();
    const lapsed = seedUser(db, { googleId: 'g2', email: 'b@test.com', subscriptionExpiresAt: EXPIRED });
    seedSubscription(db, lapsed, 'notice_Z');

    mockSessionValue = { user: { id: lapsed, email: 'b@test.com' } };
    const res = await POST();
    expect(res.status).toBe(403);
    // Slots are free — the limit message would be wrong here
    expect((await res.json()).error).toBe('현재 신규 구독이 중단되었습니다.');
  });

  it('lets a current subscriber renew even when the limit is reached', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');

    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const res = await POST();
    expect(res.status).toBe(200);
  });
});
