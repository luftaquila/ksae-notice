import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedUser, seedSubscription, seedSetting, EXPIRED, UNEXPIRED, type TestDb } from '../helpers';
import { users, subscriptions, settings } from '@/lib/db/schema';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';

let db: TestDb;
let capturedConfig: any;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('next-auth', () => ({
  default: (config: any) => {
    capturedConfig = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));

vi.mock('next-auth/providers/google', () => ({
  default: () => ({ id: 'google' }),
}));

await import('@/lib/auth');
const signInCallback = capturedConfig.callbacks.signIn;

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
    seedSetting(db, 'registrationOpen', 'true');
    seedSetting(db, 'maxSubscribers', '2');
  });

  it('rejects a profile without sub or email', async () => {
    expect(await signInCallback({ profile: { email: 'a@test.com' } })).toBe(false);
    expect(await signInCallback({ profile: { sub: 'g1' } })).toBe(false);
    expect(db.select().from(users).all().length).toBe(0);
  });

  // Categories are free, so sign-up hands out all six. The period is the paid
  // half and stays null until a payment settles.
  it('creates every category active but no subscription period', async () => {
    expect(await signInCallback({ profile: googleProfile() })).toBe(true);

    const user = db.select().from(users).where(eq(users.googleId, 'google-new')).get();
    expect(user).toBeDefined();
    const subs = subsOf(user!.id);
    expect(subs.length).toBe(SUBSCRIPTION_CATEGORIES.length);
    expect(subs.every((s) => s.isActive === 1)).toBe(true);
    expect(user!.subscriptionExpiresAt).toBeNull();
  });

  // The limit counts paid periods, and a fresh sign-up has none — so it can no
  // longer push the count anywhere, and there is nothing left to gate here.
  it('takes no subscriber slot even when the limit is already reached', async () => {
    fillSlots(2);

    expect(await signInCallback({ profile: googleProfile() })).toBe(true);

    const user = db.select().from(users).where(eq(users.googleId, 'google-new')).get()!;
    expect(user.subscriptionExpiresAt).toBeNull();

    const paidUpUsers = db
      .select()
      .from(users)
      .all()
      .filter((u) => u.subscriptionExpiresAt && u.subscriptionExpiresAt >= new Date().toISOString());
    expect(paidUpUsers.length).toBe(2);
  });

  it('still signs up while registration is closed, just without a period', async () => {
    db.update(settings).set({ value: 'false' }).where(eq(settings.key, 'registrationOpen')).run();

    expect(await signInCallback({ profile: googleProfile() })).toBe(true);

    const user = db.select().from(users).where(eq(users.googleId, 'google-new')).get()!;
    expect(subsOf(user.id).length).toBe(SUBSCRIPTION_CATEGORIES.length);
    expect(user.subscriptionExpiresAt).toBeNull();
  });
});

describe('signIn callback - returning user', () => {
  beforeEach(() => {
    db = createTestDb();
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

  // Re-registering restores what they left behind, no more and no less: the
  // period is bought, so it is neither confiscated nor handed out again.
  it('reactivates categories and keeps a paid period that has not run out', async () => {
    const id = seedDeletedUser(UNEXPIRED);

    expect(await signInCallback({ profile: googleProfile({ sub: 'google-back', email: 'back@test.com' }) })).toBe(true);

    const user = db.select().from(users).where(eq(users.id, id)).get()!;
    expect(user.deletedAt).toBeNull();
    expect(subsOf(id).every((s) => s.isActive === 1)).toBe(true);
    expect(user.subscriptionExpiresAt).toBe(UNEXPIRED);
  });

  it('does not hand a lapsed returning user a fresh period', async () => {
    const id = seedDeletedUser(EXPIRED);

    expect(await signInCallback({ profile: googleProfile({ sub: 'google-back', email: 'back@test.com' }) })).toBe(true);

    const user = db.select().from(users).where(eq(users.id, id)).get()!;
    expect(user.deletedAt).toBeNull();
    expect(subsOf(id).every((s) => s.isActive === 1)).toBe(true);
    expect(user.subscriptionExpiresAt).toBe(EXPIRED);
  });

  it('reactivates a returning user even when the limit is reached', async () => {
    const id = seedDeletedUser(null);
    fillSlots(2);

    expect(await signInCallback({ profile: googleProfile({ sub: 'google-back', email: 'back@test.com' }) })).toBe(true);

    const user = db.select().from(users).where(eq(users.id, id)).get()!;
    expect(user.deletedAt).toBeNull();
    expect(subsOf(id).every((s) => s.isActive === 1)).toBe(true);
    expect(user.subscriptionExpiresAt).toBeNull();
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
