import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedUser, seedSubscription, seedSetting, EXPIRED, type TestDb } from '../helpers';
import { settings } from '@/lib/db/schema';

let db: TestDb;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

const {
  DEFAULT_MAX_SUBSCRIBERS,
  canAcceptNewSubscriber,
  getActiveSubscriberCount,
  getMaxSubscribers,
  isCountedSubscriber,
  isRegistrationOpen,
} = await import('@/lib/subscription/capacity');

describe('getMaxSubscribers', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('reads the setting', () => {
    seedSetting(db, 'maxSubscribers', '120');
    expect(getMaxSubscribers()).toBe(120);
  });

  it('falls back to the default when the setting is missing', () => {
    expect(getMaxSubscribers()).toBe(DEFAULT_MAX_SUBSCRIBERS);
  });

  it('falls back to the default instead of NaN for a non-numeric setting', () => {
    seedSetting(db, 'maxSubscribers', 'not-a-number');
    expect(getMaxSubscribers()).toBe(DEFAULT_MAX_SUBSCRIBERS);
  });
});

describe('isRegistrationOpen', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('is open unless the setting says otherwise', () => {
    expect(isRegistrationOpen()).toBe(true);
    seedSetting(db, 'registrationOpen', 'true');
    expect(isRegistrationOpen()).toBe(true);
  });

  it('is closed when the setting is false', () => {
    seedSetting(db, 'registrationOpen', 'false');
    expect(isRegistrationOpen()).toBe(false);
  });
});

describe('getActiveSubscriberCount', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('counts each user once regardless of category count', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, u1, 'notice_Z');
    seedSubscription(db, u1, 'rule');
    const u2 = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    seedSubscription(db, u2, 'notice_Z');

    expect(getActiveSubscriberCount()).toBe(2);
  });

  it('ignores users whose subscriptions are all inactive', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, u1, 'notice_Z', { isActive: 0 });
    seedSubscription(db, u1, 'rule', { isActive: 0 });

    expect(getActiveSubscriberCount()).toBe(0);
  });

  it('ignores lapsed subscriptions, which no longer receive mail', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, u1, 'notice_Z', { expiresAt: EXPIRED });
    seedSubscription(db, u1, 'rule', { expiresAt: EXPIRED });

    expect(getActiveSubscriberCount()).toBe(0);
  });

  it('counts a user who still has one unexpired category', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, u1, 'notice_Z', { expiresAt: EXPIRED });
    seedSubscription(db, u1, 'rule');

    expect(getActiveSubscriberCount()).toBe(1);
  });
});

describe('isCountedSubscriber', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('is true while holding an unexpired active subscription', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, u1, 'notice_Z');

    expect(isCountedSubscriber(u1)).toBe(true);
  });

  it('is false once every subscription has lapsed', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, u1, 'notice_Z', { expiresAt: EXPIRED });

    expect(isCountedSubscriber(u1)).toBe(false);
  });

  it('is false for a user with no subscription at all', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });

    expect(isCountedSubscriber(u1)).toBe(false);
  });
});

describe('canAcceptNewSubscriber', () => {
  beforeEach(() => {
    db = createTestDb();
    seedSetting(db, 'registrationOpen', 'true');
    seedSetting(db, 'maxSubscribers', '1');
  });

  it('accepts while below the limit', () => {
    expect(canAcceptNewSubscriber()).toBe(true);
  });

  it('rejects once the limit is reached', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, u1, 'notice_Z');

    expect(canAcceptNewSubscriber()).toBe(false);
  });

  it('rejects while registration is closed even with room', () => {
    db.update(settings).set({ value: 'false' }).where(eq(settings.key, 'registrationOpen')).run();

    expect(canAcceptNewSubscriber()).toBe(false);
  });
});
