import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb, seedUser, seedSubscription, seedSetting, createUpsertSubscriptionMock, EXPIRED, type MockSession, type TestDb } from '../helpers';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';
import { eq, and } from 'drizzle-orm';
import { users, subscriptions, settings } from '@/lib/db/schema';

let db: TestDb;
let mockSessionValue: MockSession = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  auth: () => mockSessionValue,
}));

vi.mock('@/lib/subscription/upsert', () => ({
  upsertSubscription: (userId: number, category: string) => createUpsertSubscriptionMock(() => db)(userId, category),
}));

const { GET, POST, DELETE } = await import('@/app/api/subscriptions/route');
const { POST: subscribeAll, DELETE: unsubscribeAll } = await import('@/app/api/subscriptions/all/route');

function jsonReq(body: unknown) {
  return new NextRequest('http://localhost/api/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(body: unknown) {
  return new NextRequest('http://localhost/api/subscriptions', {
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
    const res = await POST(jsonReq({ category: 'notice_Z' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid category', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const res = await POST(jsonReq({ category: 'invalid' }));
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

    const res = await POST(jsonReq({ category: 'notice_Z' }));
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

    const res = await POST(jsonReq({ category: 'notice_A' }));
    expect(res.status).toBe(200);
  });

  it('does not grant a subscription period', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    await POST(jsonReq({ category: 'notice_Z' }));

    const account = db.select().from(users).where(eq(users.id, userId)).get()!;
    expect(account.subscriptionExpiresAt).toBeNull();
  });

  it('creates subscription successfully', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await POST(jsonReq({ category: 'notice_Z' }));
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
    const res = await DELETE(deleteReq({ category: 'notice_Z' }));
    expect(res.status).toBe(401);
  });

  it('deactivates subscription', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await DELETE(deleteReq({ category: 'notice_Z' }));
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

    const res = await DELETE(deleteReq({ category: 'notice_Z' }));
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

    const res = await POST(jsonReq({ category: 'notice_Z' }));
    expect(res.status).toBe(200);

    const sub = db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, 'notice_Z')))
      .get();
    expect(sub!.isActive).toBe(1);
  });

  it('returns 400 when category is missing from body', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const res = await POST(jsonReq({}));
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

// 대시보드의 "전체 켜기 / 전체 끄기". 왕복 한 번으로 끝나야 하고, 기간은 건드리지 않는다.
describe('/api/subscriptions/all', () => {
  beforeEach(() => {
    db = createTestDb();
    mockSessionValue = null;
  });

  function activeCategories(userId: number) {
    return db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.isActive, 1)))
      .all()
      .map((s) => s.category)
      .sort();
  }

  it('returns 401 when not authenticated', async () => {
    expect((await subscribeAll()).status).toBe(401);
    expect((await unsubscribeAll()).status).toBe(401);
  });

  // 행이 없는 카테고리(나중에 추가된 게시판)도 채우고, 꺼 둔 것도 되살린다.
  it('turns every category on, filling missing rows and reviving switched-off ones', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: EXPIRED });
    seedSubscription(db, userId, 'notice_Z', { isActive: 0 });
    seedSubscription(db, userId, 'rule');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await subscribeAll();

    expect(res.status).toBe(200);
    expect(activeCategories(userId)).toEqual([...SUBSCRIPTION_CATEGORIES].map((c) => c.id).sort());
    // 카테고리는 무료다. 기간은 결제만이 준다.
    expect(db.select().from(users).where(eq(users.id, userId)).get()!.subscriptionExpiresAt).toBe(EXPIRED);
  });

  it('turns every category off but keeps the rows', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    for (const cat of SUBSCRIPTION_CATEGORIES) seedSubscription(db, userId, cat.id);
    const other = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    seedSubscription(db, other, 'notice_Z');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await unsubscribeAll();

    expect(res.status).toBe(200);
    expect(activeCategories(userId)).toEqual([]);
    expect(db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all()).toHaveLength(SUBSCRIPTION_CATEGORIES.length);
    // 남의 것은 그대로다.
    expect(activeCategories(other)).toEqual(['notice_Z']);
  });
});
