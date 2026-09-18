import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { createTestDb, seedUser, seedAlertPreference, seedSetting, EXPIRED, type MockSession, type TestDb } from '../helpers';
import { users, alertPreferences, settings } from '@/lib/db/schema';
import { ALERT_CATEGORIES } from '@/lib/constants';

let db: TestDb;
let mockSessionValue: MockSession = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  auth: () => mockSessionValue,
}));

const { GET, POST, DELETE } = await import('@/app/api/alerts/route');
const { POST: enableAll } = await import('@/app/api/alerts/all/route');
const { POST: pause, DELETE: resume } = await import('@/app/api/alerts/pause/route');
// 구 경로는 같은 핸들러를 넘겨준다.
const legacy = await import('@/app/api/subscriptions/route');

function jsonReq(method: 'POST' | 'DELETE', body: unknown) {
  return new NextRequest('http://localhost/api/alerts', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function categoryOf(userId: number, category: string) {
  return db.select().from(alertPreferences)
    .where(and(eq(alertPreferences.userId, userId), eq(alertPreferences.category, category)))
    .get();
}

function account(userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get()!;
}

beforeEach(() => {
  db = createTestDb();
  mockSessionValue = null;
  seedSetting(db, 'registrationOpen', 'true');
  seedSetting(db, 'maxSubscribers', '50');
});

describe('GET /api/alerts', () => {
  it('returns 401 when not authenticated', async () => {
    expect((await GET()).status).toBe(401);
  });

  it('returns my alert settings beside the subscription facts the dashboard draws', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', alertsPausedAt: '2026-01-01T00:00:00.000Z' });
    seedAlertPreference(db, userId, 'notice_Z');
    seedAlertPreference(db, userId, 'rule', { isActive: 0 });
    seedSetting(db, 'subscriptionPrice', '3000');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const data = await (await GET()).json();

    expect(data.alerts).toHaveLength(2);
    expect(data.paused).toBe(true);
    expect(data.expiresAt).toBe(account(userId).subscriptionExpiresAt);
    expect(data.price).toBe(3000);
    expect(data.free).toBe(false);
  });
});

describe('POST / DELETE /api/alerts', () => {
  it('returns 401 when not authenticated', async () => {
    expect((await POST(jsonReq('POST', { category: 'notice_Z' }))).status).toBe(401);
    expect((await DELETE(jsonReq('DELETE', { category: 'notice_Z' }))).status).toBe(401);
  });

  it('returns 400 for an unknown or missing category', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    expect((await POST(jsonReq('POST', { category: 'invalid' }))).status).toBe(400);
    expect((await POST(jsonReq('POST', {}))).status).toBe(400);
    expect((await DELETE(jsonReq('DELETE', { category: 'invalid' }))).status).toBe(400);
  });

  it('switches a category on, reviving a switched-off row', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, userId, 'notice_Z', { isActive: 0 });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    expect((await POST(jsonReq('POST', { category: 'notice_Z' }))).status).toBe(200);
    expect(categoryOf(userId, 'notice_Z')!.isActive).toBe(1);
  });

  it('switches a category off but keeps the row, and is fine with no row at all', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, userId, 'notice_Z');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    expect((await DELETE(jsonReq('DELETE', { category: 'notice_Z' }))).status).toBe(200);
    expect(categoryOf(userId, 'notice_Z')!.isActive).toBe(0);
    expect((await DELETE(jsonReq('DELETE', { category: 'rule' }))).status).toBe(200);
  });

  // 알림 설정은 무료고 좌석과 무관하다. 정원이 꽉 찼든 접수가 닫혔든, 기간이 없든
  // 지났든 켜고 끌 수 있어야 한다. 좌석을 지키는 검사는 POST /api/payments/orders 에 있다.
  it('is open to everyone, paid up or not, whatever the capacity says', async () => {
    db.update(settings).set({ value: 'false' }).where(eq(settings.key, 'registrationOpen')).run();
    db.update(settings).set({ value: '1' }).where(eq(settings.key, 'maxSubscribers')).run();
    seedUser(db, { googleId: 'g0', email: 'taker@test.com' });
    const lapsed = seedUser(db, { googleId: 'g2', email: 'b@test.com', subscriptionExpiresAt: EXPIRED });
    mockSessionValue = { user: { id: lapsed, email: 'b@test.com' } };

    expect((await POST(jsonReq('POST', { category: 'notice_A' }))).status).toBe(200);
  });

  // 여기서 기간이 생기면 누구나 토글 한 번으로 결제를 우회한다.
  it('never grants a subscription period', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    await POST(jsonReq('POST', { category: 'notice_Z' }));
    await enableAll();

    expect(account(userId).subscriptionExpiresAt).toBeNull();
  });
});

describe('POST /api/alerts/all', () => {
  it('returns 401 when not authenticated', async () => {
    expect((await enableAll()).status).toBe(401);
  });

  // 행이 없는 카테고리(나중에 추가된 게시판)도 채우고, 꺼 둔 것도 되살린다.
  it('turns every category on in one round trip', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, userId, 'notice_Z', { isActive: 0 });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    expect((await enableAll()).status).toBe(200);

    const on = db.select().from(alertPreferences)
      .where(and(eq(alertPreferences.userId, userId), eq(alertPreferences.isActive, 1)))
      .all().map((r) => r.category).sort();
    expect(on).toEqual([...ALERT_CATEGORIES].map((c) => c.id).sort());
  });
});

// 일시중지는 설정도 좌석도 그대로 두고 배달만 멈춘다.
describe('/api/alerts/pause', () => {
  it('returns 401 when not authenticated', async () => {
    expect((await pause()).status).toBe(401);
    expect((await resume()).status).toBe(401);
  });

  it('pauses and resumes without touching categories or the period', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, userId, 'notice_Z');
    const before = account(userId).subscriptionExpiresAt;
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    expect((await pause()).status).toBe(200);
    expect(account(userId).alertsPausedAt).not.toBeNull();
    expect((await (await GET()).json()).paused).toBe(true);

    expect((await resume()).status).toBe(200);
    expect(account(userId).alertsPausedAt).toBeNull();
    expect(account(userId).subscriptionExpiresAt).toBe(before);
    expect(categoryOf(userId, 'notice_Z')!.isActive).toBe(1);
  });
});

describe('legacy /api/subscriptions', () => {
  it('serves the same handlers as /api/alerts', () => {
    expect(legacy.GET).toBe(GET);
    expect(legacy.POST).toBe(POST);
    expect(legacy.DELETE).toBe(DELETE);
  });
});
