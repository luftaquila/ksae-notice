import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb, seedUser, seedAlertPreference, seedEmailLog, UNEXPIRED, type MockSession, type TestDb } from '../helpers';
import { eq, and } from 'drizzle-orm';
import { users, alertPreferences } from '@/lib/db/schema';
import { ALERT_CATEGORIES } from '@/lib/constants';

let db: TestDb;
let mockAdminSession: MockSession = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  requireAdmin: () => mockAdminSession,
}));

const { GET, PATCH } = await import('@/app/api/admin/users/route');

function patchReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/users', {
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

  it('returns users with alert settings and email counts', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedUser(db, { googleId: 'g2', email: 'b@test.com', deletedAt: '2025-01-01' });
    seedAlertPreference(db, u1, 'notice_Z');
    seedEmailLog(db, u1);
    seedEmailLog(db, u1);

    const res = await GET();
    const data = await res.json();
    expect(data.users.length).toBe(2);

    // Active users sorted before deleted
    expect(data.users[0].deletedAt).toBeNull();
    expect(data.users[1].deletedAt).not.toBeNull();

    const user1 = data.users.find((u: { email: string }) => u.email === 'a@test.com');
    expect(user1.alerts.length).toBe(1);
    expect(user1.alertsPausedAt).toBeNull();
    expect(user1.emailsSent).toBe(2);
  });
});

describe('PATCH /api/admin/users', () => {
  beforeEach(() => {
    db = createTestDb();
    mockAdminSession = null;
  });

  it('returns 403 when not admin', async () => {
    const res = await PATCH(patchReq({ userId: 1, action: 'disable_all_alerts' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when userId or action missing', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const res = await PATCH(patchReq({ userId: 1 }));
    expect(res.status).toBe(400);
  });

  it('switches every alert off', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, userId, 'notice_Z');
    seedAlertPreference(db, userId, 'rule');

    const res = await PATCH(patchReq({ userId, action: 'disable_all_alerts' }));
    expect((await res.json()).ok).toBe(true);

    const subs = db.select().from(alertPreferences).where(eq(alertPreferences.userId, userId)).all();
    expect(subs.every(s => s.isActive === 0)).toBe(true);
  });

  it('deletes user (soft delete + alerts off)', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, userId, 'notice_Z');

    const res = await PATCH(patchReq({ userId, action: 'delete' }));
    expect((await res.json()).ok).toBe(true);

    const user = db.select().from(users).where(eq(users.id, userId)).get();
    expect(user!.deletedAt).not.toBeNull();
    const subs = db.select().from(alertPreferences).where(eq(alertPreferences.userId, userId)).all();
    expect(subs.every(s => s.isActive === 0)).toBe(true);
  });

  it('switches a category on for a user', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });

    const res = await PATCH(patchReq({ userId, action: 'enable_alert', category: 'notice_Z' }));
    expect((await res.json()).ok).toBe(true);

    const sub = db.select().from(alertPreferences)
      .where(and(eq(alertPreferences.userId, userId), eq(alertPreferences.category, 'notice_Z')))
      .get();
    expect(sub).toBeDefined();
    expect(sub!.isActive).toBe(1);
  });

  it('returns 400 for an invalid enable_alert category', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const res = await PATCH(patchReq({ userId, action: 'enable_alert', category: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('switches a category off for a user', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, userId, 'notice_Z');

    const res = await PATCH(patchReq({ userId, action: 'disable_alert', category: 'notice_Z' }));
    expect((await res.json()).ok).toBe(true);

    const sub = db.select().from(alertPreferences)
      .where(and(eq(alertPreferences.userId, userId), eq(alertPreferences.category, 'notice_Z')))
      .get();
    expect(sub!.isActive).toBe(0);
  });

  it('switches every category on for a user', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });

    const res = await PATCH(patchReq({ userId, action: 'enable_all_alerts' }));
    expect((await res.json()).ok).toBe(true);

    const subs = db.select().from(alertPreferences).where(eq(alertPreferences.userId, userId)).all();
    expect(subs.length).toBe(ALERT_CATEGORIES.length);
    expect(subs.every(s => s.isActive === 1)).toBe(true);
  });

  it('returns 400 for unknown action', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const res = await PATCH(patchReq({ userId, action: 'explode' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 (unknown action) when enable_alert has no category', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const res = await PATCH(patchReq({ userId, action: 'enable_alert' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 (unknown action) when disable_alert has no category', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const res = await PATCH(patchReq({ userId, action: 'disable_alert' }));
    expect(res.status).toBe(400);
  });

  it('revives a switched-off row via enable_alert', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, userId, 'notice_Z', { isActive: 0 });

    const res = await PATCH(patchReq({ userId, action: 'enable_alert', category: 'notice_Z' }));
    expect((await res.json()).ok).toBe(true);

    const sub = db.select().from(alertPreferences)
      .where(and(eq(alertPreferences.userId, userId), eq(alertPreferences.category, 'notice_Z')))
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
    const user = data.users.find((u: { email: string }) => u.email === 'a@test.com');
    expect(user.emailsSent).toBe(2);
  });
});

// 관리자 삭제도 사용자 탈퇴와 같은 규칙을 따른다. 기간을 남겨두면 재로그인으로 부활한다.
describe('PATCH /api/admin/users - delete forfeits the period', () => {
  beforeEach(() => {
    db = createTestDb();
    mockAdminSession = { user: { id: 1, isAdmin: true } };
  });

  it('clears the subscription period and the alert pause along with the account', async () => {
    const userId = seedUser(db, {
      googleId: 'g9',
      email: 'gone@test.com',
      subscriptionExpiresAt: UNEXPIRED,
      alertsPausedAt: '2026-01-01T00:00:00.000Z',
    });
    seedAlertPreference(db, userId, 'notice_Z');

    await PATCH(patchReq({ userId, action: 'delete' }));

    const user = db.select().from(users).where(eq(users.id, userId)).get()!;
    expect(user.deletedAt).not.toBeNull();
    expect(user.subscriptionExpiresAt).toBeNull();
    expect(user.alertsPausedAt).toBeNull();
  });
});
