import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedSubscription, seedSetting, createUpsertSubscriptionMock, type TestDb } from '../helpers';
import { eq, and } from 'drizzle-orm';
import { subscriptions, settings } from '@/lib/db/schema';

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

  it('returns 403 when registration is closed', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    db.update(settings)
      .set({ value: 'false' })
      .where(eq(settings.key, 'registrationOpen'))
      .run();
    const res = await POST(jsonReq({ category: 'notice_Z' }) as any);
    expect(res.status).toBe(403);
  });

  it('returns 403 when max subscribers reached for new user', async () => {
    db.update(settings)
      .set({ value: '1' })
      .where(eq(settings.key, 'maxSubscribers'))
      .run();
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, u1, 'notice_Z');
    const u2 = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    mockSessionValue = { user: { id: u2, email: 'b@test.com' } };

    const res = await POST(jsonReq({ category: 'notice_Z' }) as any);
    expect(res.status).toBe(403);
  });

  it('allows existing subscriber to add categories even at limit', async () => {
    db.update(settings)
      .set({ value: '1' })
      .where(eq(settings.key, 'maxSubscribers'))
      .run();
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await POST(jsonReq({ category: 'notice_A' }) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
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

  it('blocks existing subscribers from adding categories when registration is closed', async () => {
    db.update(settings)
      .set({ value: 'false' })
      .where(eq(settings.key, 'registrationOpen'))
      .run();
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    // Even existing subscribers get 403 — registrationOpen check runs before existing-subscriber bypass
    const res = await POST(jsonReq({ category: 'notice_A' }) as any);
    expect(res.status).toBe(403);
  });
});
