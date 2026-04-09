import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedSubscription, seedEmailLog, createUpsertSubscriptionMock, type TestDb } from '../helpers';
import { eq, and } from 'drizzle-orm';
import { users, subscriptions } from '@/lib/db/schema';

let db: TestDb;
let mockAdminSession: any = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  requireAdmin: () => mockAdminSession,
}));

vi.mock('@/lib/subscription/upsert', () => ({
  upsertSubscription: (...args: any[]) => createUpsertSubscriptionMock(() => db)(...args),
}));

const { GET, PATCH } = await import('@/app/api/admin/users/route');

function patchReq(body: any) {
  return new Request('http://localhost/api/admin/users', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    db = createTestDb();
    mockAdminSession = null;
  });

  it('returns 403 when not admin', async () => {
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns users with subscriptions and email counts', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const u2 = seedUser(db, { googleId: 'g2', email: 'b@test.com', deletedAt: '2025-01-01' });
    seedSubscription(db, u1, 'notice_Z');
    seedEmailLog(db, u1);
    seedEmailLog(db, u1);

    const res = await GET();
    const data = await res.json();
    expect(data.users.length).toBe(2);

    // Active users sorted before deleted
    expect(data.users[0].deletedAt).toBeNull();
    expect(data.users[1].deletedAt).not.toBeNull();

    const user1 = data.users.find((u: any) => u.email === 'a@test.com');
    expect(user1.subscriptions.length).toBe(1);
    expect(user1.emailsSent).toBe(2);
  });
});

describe('PATCH /api/admin/users', () => {
  beforeEach(() => {
    db = createTestDb();
    mockAdminSession = null;
  });

  it('returns 403 when not admin', async () => {
    const res = await PATCH(patchReq({ userId: 1, action: 'deactivate' }) as any);
    expect(res.status).toBe(403);
  });

  it('returns 400 when userId or action missing', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const res = await PATCH(patchReq({ userId: 1 }) as any);
    expect(res.status).toBe(400);
  });

  it('deactivates all subscriptions', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    seedSubscription(db, userId, 'rule');

    const res = await PATCH(patchReq({ userId, action: 'deactivate' }) as any);
    expect((await res.json()).ok).toBe(true);

    const subs = db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all();
    expect(subs.every(s => s.isActive === 0)).toBe(true);
  });

  it('deletes user (soft delete + deactivate subs)', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');

    const res = await PATCH(patchReq({ userId, action: 'delete' }) as any);
    expect((await res.json()).ok).toBe(true);

    const user = db.select().from(users).where(eq(users.id, userId)).get();
    expect(user!.deletedAt).not.toBeNull();
    const subs = db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all();
    expect(subs.every(s => s.isActive === 0)).toBe(true);
  });

  it('subscribes user to a category', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });

    const res = await PATCH(patchReq({ userId, action: 'subscribe', category: 'notice_Z' }) as any);
    expect((await res.json()).ok).toBe(true);

    const sub = db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, 'notice_Z')))
      .get();
    expect(sub).toBeDefined();
    expect(sub!.isActive).toBe(1);
  });

  it('returns 400 for invalid subscribe category', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const res = await PATCH(patchReq({ userId, action: 'subscribe', category: 'invalid' }) as any);
    expect(res.status).toBe(400);
  });

  it('unsubscribes user from a category', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');

    const res = await PATCH(patchReq({ userId, action: 'unsubscribe', category: 'notice_Z' }) as any);
    expect((await res.json()).ok).toBe(true);

    const sub = db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, 'notice_Z')))
      .get();
    expect(sub!.isActive).toBe(0);
  });

  it('subscribes user to all categories', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });

    const res = await PATCH(patchReq({ userId, action: 'subscribe_all' }) as any);
    expect((await res.json()).ok).toBe(true);

    const subs = db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all();
    expect(subs.length).toBe(6); // 5 notice + 1 rule
    expect(subs.every(s => s.isActive === 1)).toBe(true);
  });

  it('returns 400 for unknown action', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const res = await PATCH(patchReq({ userId, action: 'explode' }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 (unknown action) when subscribe has no category', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const res = await PATCH(patchReq({ userId, action: 'subscribe' }) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 (unknown action) when unsubscribe has no category', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const res = await PATCH(patchReq({ userId, action: 'unsubscribe' }) as any);
    expect(res.status).toBe(400);
  });

  it('reactivates previously deactivated subscription via subscribe', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z', { isActive: 0 });

    const res = await PATCH(patchReq({ userId, action: 'subscribe', category: 'notice_Z' }) as any);
    expect((await res.json()).ok).toBe(true);

    const sub = db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, 'notice_Z')))
      .get();
    expect(sub!.isActive).toBe(1);
  });

  it('GET counts only sent emails, not failed', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedEmailLog(db, userId, { status: 'sent' });
    seedEmailLog(db, userId, { status: 'sent' });
    seedEmailLog(db, userId, { status: 'failed', error: 'timeout' });

    const res = await GET();
    const data = await res.json();
    const user = data.users.find((u: any) => u.email === 'a@test.com');
    expect(user.emailsSent).toBe(2);
  });
});
