import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedUser, type TestDb } from '../helpers';
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

beforeEach(() => {
  db = createTestDb();
  jar = new Map();
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
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

    const res = await consent();
    expect(res.status).toBe(200);

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
  });

  it('refuses without a pending seal', async () => {
    const res = await consent();

    expect(res.status).toBe(400);
    expect(db.select().from(users).all().length).toBe(0);
  });

  it('refuses a forged seal', async () => {
    jar.set(PENDING_SIGNUP_COOKIE, 'forged.signature');

    expect((await consent()).status).toBe(400);
    expect(db.select().from(users).all().length).toBe(0);
  });

  // 버튼이 두 번 눌리거나 그사이 다른 경로로 계정이 생긴 경우. 카테고리를 다시
  // 깔면 사용자가 끈 것을 되살리게 된다.
  it('records consent without touching an account that already exists', async () => {
    const userId = seedUser(db, { googleId: 'google-1', email: 'a@test.com', subscriptionExpiresAt: null });
    pend();

    expect((await consent()).status).toBe(200);

    const user = db.select().from(users).where(eq(users.id, userId)).get()!;
    expect(user.privacyConsentVersion).toBe(PRIVACY_CONSENT_VERSION);
    expect(db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all().length).toBe(0);
    expect(db.select().from(users).all().length).toBe(1);
  });

  it('does not overwrite a consent already on record', async () => {
    const userId = seedUser(db, {
      googleId: 'google-1',
      email: 'a@test.com',
      privacyConsentAt: '2020-01-01T00:00:00.000Z',
      privacyConsentVersion: 'old',
    });
    pend();

    await consent();

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
  });
});
