import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedSubscription, seedSetting, createUpsertSubscriptionMock, EXPIRED, type TestDb } from '../helpers';
import { eq, and } from 'drizzle-orm';
import { users, subscriptions, settings } from '@/lib/db/schema';

let db: TestDb;
let mockSessionValue: any = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  auth: () => mockSessionValue,
}));

vi.mock('@/lib/subscription/upsert', () => ({
  upsertSubscription: (...args: any[]) => createUpsertSubscriptionMock(() => db)(...args),
}));

const { GET, POST, DELETE } = await import('@/app/api/subscriptions/route');

function jsonReq(body: any) {
  return new Request('http://localhost/api/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(body: any) {
  return new Request('http://localhost/api/subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/subscriptions', () => {
  beforeEach(() => {
    db = createTestDb();
    mockSessionValue = null;
  });

  it('returns 401 when not authenticated', async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns user subscriptions', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    seedSubscription(db, userId, 'rule');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await GET();
    const data = await res.json();
    expect(data.subscriptions.length).toBe(2);
  });
});

describe('POST /api/subscriptions', () => {
  beforeEach(() => {
    db = createTestDb();
    mockSessionValue = null;
    seedSetting(db, 'registrationOpen', 'true');
    seedSetting(db, 'maxSubscribers', '50');
  });

  it('returns 401 when not authenticated', async () => {
    const res = await POST(jsonReq({ category: 'notice_Z' }) as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid category', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const res = await POST(jsonReq({ category: 'invalid' }) as any);
    expect(res.status).toBe(400);
  });

  // The subscriber limit and the registration switch guard the paid period, so
  // they now live in POST /api/payments/orders. A category on its own costs
  // nothing and must stay reachable to everyone, paid up or not.
  it('lets an unpaid user pick categories while registration is closed', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    db.update(settings)
      .set({ value: 'false' })
      .where(eq(settings.key, 'registrationOpen'))
      .run();

    const res = await POST(jsonReq({ category: 'notice_Z' }) as any);
    expect(res.status).toBe(200);
  });

  it('lets a lapsed user pick categories when every slot is taken', async () => {
    db.update(settings)
      .set({ value: '1' })
      .where(eq(settings.key, 'maxSubscribers'))
      .run();
    const taker = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, taker, 'notice_Z');
    const lapsed = seedUser(db, { googleId: 'g2', email: 'b@test.com', subscriptionExpiresAt: EXPIRED });
    mockSessionValue = { user: { id: lapsed, email: 'b@test.com' } };

    const res = await POST(jsonReq({ category: 'notice_A' }) as any);
    expect(res.status).toBe(200);
  });

  it('does not grant a subscription period', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    await POST(jsonReq({ category: 'notice_Z' }) as any);

    const account = db.select().from(users).where(eq(users.id, userId)).get()!;
    expect(account.subscriptionExpiresAt).toBeNull();
  });

  it('creates subscription successfully', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await POST(jsonReq({ category: 'notice_Z' }) as any);
    expect(res.status).toBe(200);

    const subs = db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all();
    expect(subs.length).toBe(1);
    expect(subs[0].category).toBe('notice_Z');
    expect(subs[0].isActive).toBe(1);
  });
});

describe('DELETE /api/subscriptions', () => {
  beforeEach(() => {
    db = createTestDb();
    mockSessionValue = null;
  });

  it('returns 401 when not authenticated', async () => {
    const res = await DELETE(deleteReq({ category: 'notice_Z' }) as any);
    expect(res.status).toBe(401);
  });

  it('deactivates subscription', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await DELETE(deleteReq({ category: 'notice_Z' }) as any);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const sub = db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, 'notice_Z')))
      .get();
    expect(sub!.isActive).toBe(0);
  });

  it('returns ok even for non-existent subscription', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await DELETE(deleteReq({ category: 'notice_Z' }) as any);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

describe('POST /api/subscriptions - edge cases', () => {
  beforeEach(() => {
    db = createTestDb();
    mockSessionValue = null;
    seedSetting(db, 'registrationOpen', 'true');
    seedSetting(db, 'maxSubscribers', '50');
  });

  it('resubscribes to a previously deactivated category', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z', { isActive: 0 });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await POST(jsonReq({ category: 'notice_Z' }) as any);
    expect(res.status).toBe(200);

    const sub = db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, 'notice_Z')))
      .get();
    expect(sub!.isActive).toBe(1);
  });

  it('returns 400 when category is missing from body', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const res = await POST(jsonReq({}) as any);
    expect(res.status).toBe(400);
  });

  it('reports the current price so the dashboard can label the pay button', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSetting(db, 'subscriptionPrice', '3000');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const data = await (await GET()).json();
    expect(data.price).toBe(3000);
  });
});
