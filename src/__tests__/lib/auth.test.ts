import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextAuthConfig } from 'next-auth';
import { eq } from 'drizzle-orm';
import { createTestDb, seedUser, seedSubscription, seedSetting, UNEXPIRED, type TestDb } from '../helpers';
import { users, subscriptions, settings } from '@/lib/db/schema';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';

let db: TestDb;
// 모킹된 NextAuth() 가 `await import('@/lib/auth')` 중에 채운다.
let capturedConfig!: NextAuthConfig;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('next-auth', () => ({
  default: (config: NextAuthConfig) => {
    capturedConfig = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));

vi.mock('next-auth/providers/google', () => ({
  default: () => ({ id: 'google' }),
}));

let jar: Map<string, string>;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));

await import('@/lib/auth');
const { PENDING_SIGNUP_COOKIE, unsealPendingSignup } = await import('@/lib/signup/pending');
// 콜백은 profile 만 읽는다. Auth.js 가 넘기는 user/account 는 여기서 만들지 않으므로
// 시험용 시그니처로 좁힌다.
const signInCallback = capturedConfig.callbacks!.signIn! as unknown as
  (params: { profile: Record<string, unknown> }) => Promise<boolean | string>;

function googleProfile(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'google-new',
    email: 'new@test.com',
    name: 'New User',
    picture: 'https://example.com/a.png',
    ...overrides,
  };
}

function subsOf(userId: number) {
  return db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all();
}

// Fills the given number of subscriber slots with unrelated paid-up users.
function fillSlots(count: number) {
  for (let i = 0; i < count; i++) {
    const id = seedUser(db, { googleId: `filler-${i}`, email: `filler-${i}@test.com` });
    seedSubscription(db, id, 'notice_Z');
  }
}

describe('signIn callback - new user', () => {
  beforeEach(() => {
    db = createTestDb();
    jar = new Map();
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
    seedSetting(db, 'registrationOpen', 'true');
    seedSetting(db, 'maxSubscribers', '2');
  });

  it('rejects a profile without sub or email', async () => {
    expect(await signInCallback({ profile: { email: 'a@test.com' } })).toBe(false);
    expect(await signInCallback({ profile: { sub: 'g1' } })).toBe(false);
    expect(db.select().from(users).all().length).toBe(0);
  });

  // 계정은 동의를 받은 뒤에 만든다. 여기서 행을 적으면 동의 화면이 의미가 없다.
  it('writes nothing and sends the profile to the consent screen', async () => {
    expect(await signInCallback({ profile: googleProfile() })).toBe('/signup/consent');

    expect(db.select().from(users).all().length).toBe(0);
    expect(db.select().from(subscriptions).all().length).toBe(0);

    // 프로필은 봉인한 쿠키로만 넘어간다.
    expect(unsealPendingSignup(jar.get(PENDING_SIGNUP_COOKIE))).toEqual({
      googleId: 'google-new',
      email: 'new@test.com',
      name: 'New User',
      avatar: 'https://example.com/a.png',
    });
  });

  it('sends them to consent even when every subscriber slot is taken', async () => {
    fillSlots(2);

    expect(await signInCallback({ profile: googleProfile() })).toBe('/signup/consent');
    expect(db.select().from(users).where(eq(users.googleId, 'google-new')).get()).toBeUndefined();
  });

  it('sends them to consent while registration is closed too', async () => {
    db.update(settings).set({ value: 'false' }).where(eq(settings.key, 'registrationOpen')).run();

    expect(await signInCallback({ profile: googleProfile() })).toBe('/signup/consent');
    expect(db.select().from(users).all().length).toBe(0);
  });
});

describe('signIn callback - returning user', () => {
  beforeEach(() => {
    db = createTestDb();
    jar = new Map();
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
    seedSetting(db, 'registrationOpen', 'true');
    seedSetting(db, 'maxSubscribers', '2');
  });

  function seedDeletedUser(expiresAt: string | null) {
    const id = seedUser(db, {
      googleId: 'google-back',
      email: 'back@test.com',
      deletedAt: '2026-01-01T00:00:00.000Z',
      subscriptionExpiresAt: expiresAt,
    });
    for (const cat of SUBSCRIPTION_CATEGORIES) {
      seedSubscription(db, id, cat.id, { isActive: 0 });
    }
    return id;
  }

  // 방침의 보유 기간은 "탈퇴 시까지"다. 그 동의는 끝났으니 재가입은 동의 화면부터
  // 다시 시작한다. 행은 동의 라우트가 되살리고, 여기서는 아무것도 적지 않는다.
  it('sends a withdrawn account back through consent without touching the row', async () => {
    const id = seedDeletedUser(UNEXPIRED);

    expect(await signInCallback({
      profile: googleProfile({ sub: 'google-back', email: 'back@test.com', name: 'Back Again' }),
    })).toBe('/signup/consent');

    const user = db.select().from(users).where(eq(users.id, id)).get()!;
    expect(user.deletedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(user.subscriptionExpiresAt).toBe(UNEXPIRED);
    expect(subsOf(id).every((s) => s.isActive === 0)).toBe(true);

    expect(unsealPendingSignup(jar.get(PENDING_SIGNUP_COOKIE))).toEqual({
      googleId: 'google-back',
      email: 'back@test.com',
      name: 'Back Again',
      avatar: 'https://example.com/a.png',
    });
  });

  it('does so even when the limit is reached', async () => {
    const id = seedDeletedUser(null);
    fillSlots(2);

    expect(await signInCallback({ profile: googleProfile({ sub: 'google-back', email: 'back@test.com' }) })).toBe('/signup/consent');
    expect(db.select().from(users).where(eq(users.id, id)).get()!.deletedAt).not.toBeNull();
  });

  it('only refreshes the profile for an active user, even past the limit', async () => {
    const id = seedUser(db, { googleId: 'google-old', email: 'old@test.com', name: 'Old Name' });
    seedSubscription(db, id, 'notice_Z');
    fillSlots(2);

    expect(await signInCallback({
      profile: googleProfile({ sub: 'google-old', email: 'old@test.com', name: 'Renamed' }),
    })).toBe(true);

    const user = db.select().from(users).where(eq(users.id, id)).get();
    expect(user!.name).toBe('Renamed');
    expect(subsOf(id).length).toBe(1);
    expect(subsOf(id)[0].isActive).toBe(1);
  });

  // The period is what a returning user paid for; refreshing a profile must not
  // reach it. This is the writer that used to be allowed to move it backwards.
  it('leaves the period alone when an existing user simply logs in', async () => {
    const id = seedUser(db, { googleId: 'google-old', email: 'old@test.com', subscriptionExpiresAt: UNEXPIRED });
    seedSubscription(db, id, 'notice_Z');

    await signInCallback({ profile: googleProfile({ sub: 'google-old', email: 'old@test.com' }) });

    expect(db.select().from(users).where(eq(users.id, id)).get()!.subscriptionExpiresAt).toBe(UNEXPIRED);
  });
});
