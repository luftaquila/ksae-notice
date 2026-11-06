import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb, seedSetting, type MockSession, type TestDb } from '../helpers';
import { eq } from 'drizzle-orm';
import { settings } from '@/lib/db/schema';

let db: TestDb;
let mockAdminSession: MockSession = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  requireAdmin: () => mockAdminSession,
}));

const { GET, PUT } = await import('@/app/api/admin/settings/route');

function putReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/admin/settings', () => {
  beforeEach(() => {
    db = createTestDb();
    mockAdminSession = null;
  });

  it('returns 403 when not admin', async () => {
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns all settings as key-value map', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', isAdmin: true } };
    seedSetting(db, 'maxSubscribers', '100');
    seedSetting(db, 'registrationOpen', 'true');

    const res = await GET();
    const data = await res.json();
    expect(data.maxSubscribers).toBe('100');
    expect(data.registrationOpen).toBe('true');
  });
});

describe('PUT /api/admin/settings', () => {
  beforeEach(() => {
    db = createTestDb();
    mockAdminSession = null;
  });

  it('returns 403 when not admin', async () => {
    const res = await PUT(putReq({ maxSubscribers: 200 }));
    expect(res.status).toBe(403);
  });

  it('updates allowed settings', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', isAdmin: true } };
    const res = await PUT(putReq({ maxSubscribers: 200, registrationOpen: false }));
    const data = await res.json();
    expect(data.ok).toBe(true);

    const max = db.select().from(settings).where(eq(settings.key, 'maxSubscribers')).get();
    expect(max!.value).toBe('200');
    const reg = db.select().from(settings).where(eq(settings.key, 'registrationOpen')).get();
    expect(reg!.value).toBe('false');
  });

  it('accepts the unlimited-subscribers switch and the renewal month', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', isAdmin: true } };
    await PUT(putReq({ unlimitedSubscribers: 'true', renewalOpenMonth: '11' }));

    expect(db.select().from(settings).where(eq(settings.key, 'unlimitedSubscribers')).get()!.value).toBe('true');
    expect(db.select().from(settings).where(eq(settings.key, 'renewalOpenMonth')).get()!.value).toBe('11');
  });

  it('accepts the Brevo reserve and the update-alert switch', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', isAdmin: true } };
    await PUT(putReq({ brevoReserve: '50', notifyPostUpdates: 'false' }));

    expect(db.select().from(settings).where(eq(settings.key, 'brevoReserve')).get()!.value).toBe('50');
    expect(db.select().from(settings).where(eq(settings.key, 'notifyPostUpdates')).get()!.value).toBe('false');
  });

  // 범위 밖 값이 저장되면 화면과 서버가 다른 값으로 읽는다. 저장할 때 서버의 해석으로 맞춘다.
  it('stores the values the server would read back', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', isAdmin: true } };
    const stored = (key: string) => db.select().from(settings).where(eq(settings.key, key)).get()!.value;

    await PUT(putReq({ renewalOpenMonth: '13', brevoReserve: '-5', unlimitedSubscribers: 'yes', notifyPostUpdates: 'nope' }));
    expect(stored('renewalOpenMonth')).toBe('12');
    expect(stored('brevoReserve')).toBe('30');
    expect(stored('unlimitedSubscribers')).toBe('false');
    expect(stored('notifyPostUpdates')).toBe('true');

    await PUT(putReq({ renewalOpenMonth: '1', brevoReserve: '', unlimitedSubscribers: true, notifyPostUpdates: false }));
    expect(stored('renewalOpenMonth')).toBe('12');
    expect(stored('brevoReserve')).toBe('30');
    expect(stored('unlimitedSubscribers')).toBe('true');
    expect(stored('notifyPostUpdates')).toBe('false');
  });

  it('ignores disallowed keys', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', isAdmin: true } };
    const res = await PUT(putReq({ dangerousKey: 'evil', maxSubscribers: 10 }));
    expect(res.status).toBe(200);

    const danger = db.select().from(settings).where(eq(settings.key, 'dangerousKey')).get();
    expect(danger).toBeUndefined();
    const max = db.select().from(settings).where(eq(settings.key, 'maxSubscribers')).get();
    expect(max!.value).toBe('10');
  });

  it('upserts existing settings (insert then update)', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', isAdmin: true } };
    seedSetting(db, 'maxSubscribers', '50');

    await PUT(putReq({ maxSubscribers: 999 }));
    const max = db.select().from(settings).where(eq(settings.key, 'maxSubscribers')).get();
    expect(max!.value).toBe('999');
  });
});
