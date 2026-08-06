import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedUser, seedSubscription, seedSetting, type TestDb } from '../helpers';
import { users, subscriptions, settings } from '@/lib/db/schema';
import { SUBSCRIPTION_CATEGORIES, getEndOfYear } from '@/lib/constants';

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

// Fills the given number of subscriber slots with unrelated active users.
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

  it('subscribes all categories when there is room', async () => {
    fillSlots(1);

    expect(await signInCallback({ profile: googleProfile() })).toBe(true);

    const user = db.select().from(users).where(eq(users.googleId, 'google-new')).get();
    expect(user).toBeDefined();
    const subs = subsOf(user!.id);
    expect(subs.length).toBe(SUBSCRIPTION_CATEGORIES.length);
    expect(subs.every((s) => s.isActive === 1)).toBe(true);
    expect(user!.subscriptionExpiresAt).toBe(getEndOfYear());
  });

  it('creates the user with every subscription inactive when the limit is reached', async () => {
    fillSlots(2);

    expect(await signInCallback({ profile: googleProfile() })).toBe(true);

    const user = db.select().from(users).where(eq(users.googleId, 'google-new')).get();
    expect(user).toBeDefined();
    const subs = subsOf(user!.id);
    expect(subs.length).toBe(SUBSCRIPTION_CATEGORIES.length);
    expect(subs.every((s) => s.isActive === 0)).toBe(true);
    // No subscription means no period either
    expect(user!.subscriptionExpiresAt).toBeNull();
  });

  it('does not let a sign-up push the active subscriber count past the limit', async () => {
    fillSlots(2);

    await signInCallback({ profile: googleProfile() });

    const activeUsers = new Set(
      db.select().from(subscriptions).where(eq(subscriptions.isActive, 1)).all().map((s) => s.userId),
    );
    expect(activeUsers.size).toBe(2);
  });

  it('creates the user with every subscription inactive when registration is closed', async () => {
    db.update(settings).set({ value: 'false' }).where(eq(settings.key, 'registrationOpen')).run();

    expect(await signInCallback({ profile: googleProfile() })).toBe(true);

    const user = db.select().from(users).where(eq(users.googleId, 'google-new')).get();
    const subs = subsOf(user!.id);
    expect(subs.length).toBe(SUBSCRIPTION_CATEGORIES.length);
    expect(subs.every((s) => s.isActive === 0)).toBe(true);
  });
});

describe('signIn callback - returning user', () => {
  beforeEach(() => {
    db = createTestDb();
    seedSetting(db, 'registrationOpen', 'true');
    seedSetting(db, 'maxSubscribers', '2');
  });

  function seedDeletedUser() {
    const id = seedUser(db, {
      googleId: 'google-back',
      email: 'back@test.com',
      deletedAt: '2026-01-01T00:00:00.000Z',
    });
    for (const cat of SUBSCRIPTION_CATEGORIES) {
      seedSubscription(db, id, cat.id, { isActive: 0 });
    }
    return id;
  }

  it('reactivates subscriptions on re-register when there is room', async () => {
    const id = seedDeletedUser();
    fillSlots(1);

    expect(await signInCallback({ profile: googleProfile({ sub: 'google-back', email: 'back@test.com' }) })).toBe(true);

    const user = db.select().from(users).where(eq(users.id, id)).get()!;
    expect(user.deletedAt).toBeNull();
    expect(subsOf(id).every((s) => s.isActive === 1)).toBe(true);
    expect(user.subscriptionExpiresAt).toBe(getEndOfYear());
  });

  it('leaves subscriptions inactive on re-register when the limit is reached', async () => {
    const id = seedDeletedUser();
    fillSlots(2);

    expect(await signInCallback({ profile: googleProfile({ sub: 'google-back', email: 'back@test.com' }) })).toBe(true);

    const user = db.select().from(users).where(eq(users.id, id)).get()!;
    expect(user.deletedAt).toBeNull();
    expect(subsOf(id).every((s) => s.isActive === 0)).toBe(true);
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
});
