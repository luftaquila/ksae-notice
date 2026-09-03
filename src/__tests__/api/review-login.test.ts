import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { decode } from 'next-auth/jwt';
import { createTestDb, seedUser, seedSubscription, UNEXPIRED, type TestDb } from '../helpers';
import { users, subscriptions } from '@/lib/db/schema';
import { PRIVACY_CONSENT_VERSION, SUBSCRIPTION_CATEGORIES } from '@/lib/constants';

let db: TestDb;
let jar: Map<string, string>;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));

const { POST } = await import('@/app/api/review-login/route');
const { REVIEW_GOOGLE_ID, REVIEW_EMAIL, resetReviewAttempts } = await import('@/lib/review');

function login(body: unknown) {
  return POST(new Request('http://localhost/api/review-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'http' },
    body: JSON.stringify(body),
  }));
}

const GOOD = { loginId: 'reviewer', password: 'correct horse battery staple' };

beforeEach(() => {
  db = createTestDb();
  jar = new Map();
  resetReviewAttempts();
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
  vi.stubEnv('AUTH_URL', '');
  vi.stubEnv('REVIEW_LOGIN_ID', GOOD.loginId);
  vi.stubEnv('REVIEW_LOGIN_PASSWORD', GOOD.password);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function sessionUserId() {
  const token = jar.get('authjs.session-token');
  if (!token) return null;
  const payload = await decode({ token, secret: 'test-auth-secret', salt: 'authjs.session-token' });
  return payload?.userId ?? null;
}

describe('POST /api/review-login', () => {
  // 자격증명이 없으면 이 경로는 없는 것처럼 동작해야 한다.
  it('does not exist without credentials in the environment', async () => {
    vi.stubEnv('REVIEW_LOGIN_ID', '');

    expect((await login(GOOD)).status).toBe(404);
    expect(db.select().from(users).all().length).toBe(0);
  });

  it('rejects a wrong password and a wrong id alike', async () => {
    expect((await login({ ...GOOD, password: 'nope' })).status).toBe(401);
    expect((await login({ ...GOOD, loginId: 'nope' })).status).toBe(401);
    expect((await login({})).status).toBe(401);
    expect((await login(null)).status).toBe(401);

    expect(db.select().from(users).all().length).toBe(0);
    expect(jar.size).toBe(0);
  });

  it('creates the review account once and signs it in', async () => {
    const res = await login(GOOD);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: '/dashboard' });

    const user = db.select().from(users).where(eq(users.googleId, REVIEW_GOOGLE_ID)).get()!;
    expect(user.email).toBe(REVIEW_EMAIL);
    // 동의 화면을 거치지 않는 유일한 계정. 기간은 결제만이 준다.
    expect(user.privacyConsentVersion).toBe(PRIVACY_CONSENT_VERSION);
    expect(user.subscriptionExpiresAt).toBeNull();

    const subs = db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).all();
    expect(subs.length).toBe(SUBSCRIPTION_CATEGORIES.length);
    expect(subs.every((s) => s.isActive === 1)).toBe(true);

    expect(await sessionUserId()).toBe(user.id);

    // 두 번째 로그인은 같은 행을 쓴다.
    await login(GOOD);
    expect(db.select().from(users).all().length).toBe(1);
  });

  // 심사 계정이라도 탈퇴는 기간을 포기하는 것이다 — signIn 콜백과 같은 규칙.
  it('revives a withdrawn review account without its period', async () => {
    const userId = seedUser(db, {
      googleId: REVIEW_GOOGLE_ID,
      email: REVIEW_EMAIL,
      deletedAt: '2026-01-01T00:00:00.000Z',
      subscriptionExpiresAt: UNEXPIRED,
    });
    seedSubscription(db, userId, 'notice_Z', { isActive: 0 });

    expect((await login(GOOD)).status).toBe(200);

    const user = db.select().from(users).where(eq(users.id, userId)).get()!;
    expect(user.deletedAt).toBeNull();
    expect(user.subscriptionExpiresAt).toBeNull();
    expect(db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get()!.isActive).toBe(1);
    expect(await sessionUserId()).toBe(userId);
  });

  it('stops answering after ten attempts in a row', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await login({ ...GOOD, password: 'nope' })).status).toBe(401);
    }

    // 맞는 자격증명이라도 한도를 넘으면 받지 않는다.
    expect((await login(GOOD)).status).toBe(429);
    expect(jar.size).toBe(0);
  });
});
