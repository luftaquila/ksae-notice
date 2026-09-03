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

const { PENDING_SIGNUP_COOKIE, sealPendingSignup } = await import('@/lib/signup/pending');
const { POST: consent } = await import('@/app/api/auth/signup-consent/route');
const { POST: cancel } = await import('@/app/api/auth/signup-cancel/route');

const PENDING = { googleId: 'google-1', email: 'a@test.com', name: '홍길동', avatar: null };

// 세션 쿠키 이름은 프로토콜에 따라 갈리므로 테스트는 http 로 고정한다.
function consentRequest() {
  return new Request('http://localhost/api/auth/signup-consent', {
    method: 'POST',
    headers: { 'x-forwarded-proto': 'http' },
  });
}

async function sessionUserId() {
  const token = jar.get('authjs.session-token');
  if (!token) return null;
  const payload = await decode({ token, secret: 'test-auth-secret', salt: 'authjs.session-token' });
  return payload?.userId ?? null;
}

beforeEach(() => {
  db = createTestDb();
  jar = new Map();
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
  vi.stubEnv('AUTH_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function pend(overrides: Partial<typeof PENDING> = {}) {
  jar.set(PENDING_SIGNUP_COOKIE, sealPendingSignup({ ...PENDING, ...overrides }));
}

describe('POST /api/auth/signup-consent', () => {
  it('creates the account with every category and no period', async () => {
    pend();

    const res = await consent(consentRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: '/dashboard' });

    const user = db.select().from(users).where(eq(users.googleId, 'google-1')).get()!;
    expect(user.email).toBe('a@test.com');
    expect(user.name).toBe('홍길동');
    // 카테고리는 무료, 기간은 결제만이 준다.
    expect(user.subscriptionExpiresAt).toBeNull();
    expect(user.privacyConsentAt).not.toBeNull();
    expect(user.privacyConsentVersion).toBe(PRIVACY_CONSENT_VERSION);

    const subs = db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).all();
    expect(subs.length).toBe(SUBSCRIPTION_CATEGORIES.length);
    expect(subs.every((s) => s.isActive === 1)).toBe(true);

    // 쿠키는 한 번 쓰고 버린다.
    expect(jar.has(PENDING_SIGNUP_COOKIE)).toBe(false);

    // Google 로 다시 다녀오지 않는다 — 세션은 여기서 바로 생긴다.
    expect(await sessionUserId()).toBe(user.id);
  });

  it('refuses without a pending seal', async () => {
    const res = await consent(consentRequest());

    expect(res.status).toBe(400);
    expect(db.select().from(users).all().length).toBe(0);
    expect(jar.size).toBe(0);
  });

  it('refuses a forged seal', async () => {
    jar.set(PENDING_SIGNUP_COOKIE, 'forged.signature');

    expect((await consent(consentRequest())).status).toBe(400);
    expect(db.select().from(users).all().length).toBe(0);
    expect(jar.has('authjs.session-token')).toBe(false);
  });

  // 버튼이 두 번 눌리거나 그사이 다른 경로로 계정이 생긴 경우. 카테고리를 다시
  // 깔면 사용자가 끈 것을 되살리게 된다.
  it('records consent without touching an account that already exists', async () => {
    const userId = seedUser(db, { googleId: 'google-1', email: 'a@test.com', subscriptionExpiresAt: null });
    pend();

    expect((await consent(consentRequest())).status).toBe(200);

    const user = db.select().from(users).where(eq(users.id, userId)).get()!;
    expect(user.privacyConsentVersion).toBe(PRIVACY_CONSENT_VERSION);
    expect(db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all().length).toBe(0);
    expect(db.select().from(users).all().length).toBe(1);
    expect(await sessionUserId()).toBe(userId);
  });

  // 탈퇴한 계정의 재가입. 새 동의를 기록하고 되살리되, 기간은 절대 주지 않는다 —
  // 탈퇴는 기간을 포기하는 것이라고 /policy 가 말한다.
  it('revives a withdrawn account with a fresh consent and no period', async () => {
    const userId = seedUser(db, {
      googleId: 'google-1',
      email: 'a@test.com',
      name: 'Old Name',
      deletedAt: '2026-01-01T00:00:00.000Z',
      subscriptionExpiresAt: UNEXPIRED,
      privacyConsentAt: '2020-01-01T00:00:00.000Z',
      privacyConsentVersion: 'old',
    });
    seedSubscription(db, userId, 'notice_Z', { isActive: 0 });
    pend();

    const res = await consent(consentRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: '/dashboard' });

    const user = db.select().from(users).where(eq(users.id, userId)).get()!;
    expect(user.deletedAt).toBeNull();
    expect(user.name).toBe('홍길동');
    expect(user.subscriptionExpiresAt).toBeNull();
    // 예전 동의가 아니라 지금 받은 동의가 기록돼야 한다.
    expect(user.privacyConsentAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect(user.privacyConsentVersion).toBe(PRIVACY_CONSENT_VERSION);

    // 새 가입처럼 카테고리는 전부 켜진다 — 빠져 있던 것은 채운다.
    const subs = db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all();
    expect(subs.length).toBe(SUBSCRIPTION_CATEGORIES.length);
    expect(subs.every((s) => s.isActive === 1)).toBe(true);

    // 같은 행을 되살린다. 새 행을 만들지 않는다.
    expect(db.select().from(users).all().length).toBe(1);
    expect(jar.has(PENDING_SIGNUP_COOKIE)).toBe(false);
    expect(await sessionUserId()).toBe(userId);
  });

  it('does not overwrite a consent already on record', async () => {
    const userId = seedUser(db, {
      googleId: 'google-1',
      email: 'a@test.com',
      privacyConsentAt: '2020-01-01T00:00:00.000Z',
      privacyConsentVersion: 'old',
    });
    pend();

    await consent(consentRequest());

    const user = db.select().from(users).where(eq(users.id, userId)).get()!;
    expect(user.privacyConsentAt).toBe('2020-01-01T00:00:00.000Z');
    expect(user.privacyConsentVersion).toBe('old');
  });
});

describe('POST /api/auth/signup-cancel', () => {
  it('drops the seal and creates nothing', async () => {
    pend();

    expect((await cancel()).status).toBe(200);
    expect(jar.has(PENDING_SIGNUP_COOKIE)).toBe(false);
    expect(db.select().from(users).all().length).toBe(0);
    expect(jar.size).toBe(0);
  });
});
