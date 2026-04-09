import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedSetting, type TestDb } from '../helpers';
import { eq } from 'drizzle-orm';
import { settings } from '@/lib/db/schema';

let db: TestDb;
let mockAdminSession: any = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  requireAdmin: () => mockAdminSession,
}));

const { GET, PUT } = await import('@/app/api/admin/settings/route');

function putReq(body: any) {
  return new Request('http://localhost/api/admin/settings', {
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
    const res = await PUT(putReq({ maxSubscribers: 200 }) as any);
    expect(res.status).toBe(403);
  });

  it('updates allowed settings', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', isAdmin: true } };
    const res = await PUT(putReq({ maxSubscribers: 200, registrationOpen: false }) as any);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const max = db.select().from(settings).where(eq(settings.key, 'maxSubscribers')).get();
    expect(max!.value).toBe('200');
    const reg = db.select().from(settings).where(eq(settings.key, 'registrationOpen')).get();
    expect(reg!.value).toBe('false');
  });

  it('ignores disallowed keys', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', isAdmin: true } };
    const res = await PUT(putReq({ dangerousKey: 'evil', maxSubscribers: 10 }) as any);
    expect(res.status).toBe(200);

    const danger = db.select().from(settings).where(eq(settings.key, 'dangerousKey')).get();
    expect(danger).toBeUndefined();
    const max = db.select().from(settings).where(eq(settings.key, 'maxSubscribers')).get();
    expect(max!.value).toBe('10');
  });

  it('upserts existing settings (insert then update)', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', isAdmin: true } };
    seedSetting(db, 'maxSubscribers', '50');

    await PUT(putReq({ maxSubscribers: 999 }) as any);
    const max = db.select().from(settings).where(eq(settings.key, 'maxSubscribers')).get();
    expect(max!.value).toBe('999');
  });
});
