import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedSubscription, seedSetting, EXPIRED, UNEXPIRED, type TestDb } from '../helpers';
import { subscriptionStatus } from '@/lib/subscription/status';

let db: TestDb;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

const { getActiveSubscriberCount } = await import('@/lib/subscription/capacity');

describe('subscriptionStatus', () => {
  const now = new Date('2026-08-19T00:00:00.000Z');
  const covered = '2026-12-31T23:59:59.000Z';
  const lapsed = '2025-12-31T23:59:59.000Z';

  it('only counts an active category on an unexpired period as holding a slot', () => {
    const receiving = subscriptionStatus(
      { deletedAt: null, subscriptionExpiresAt: covered, hasActiveCategory: true }, now,
    );
    expect(receiving.key).toBe('receiving');
    expect(receiving.holdsSlot).toBe(true);
  });

  it('separates the two reasons a subscriber is not receiving', () => {
    const unpaid = subscriptionStatus(
      { deletedAt: null, subscriptionExpiresAt: null, hasActiveCategory: true }, now,
    );
    const paused = subscriptionStatus(
      { deletedAt: null, subscriptionExpiresAt: covered, hasActiveCategory: false }, now,
    );
    const inactive = subscriptionStatus(
      { deletedAt: null, subscriptionExpiresAt: lapsed, hasActiveCategory: false }, now,
    );

    expect([unpaid.key, paused.key, inactive.key]).toEqual(['unpaid', 'paused', 'inactive']);
    expect([unpaid.holdsSlot, paused.holdsSlot, inactive.holdsSlot]).toEqual([false, false, false]);
  });

  it('treats a lapsed period as unpaid rather than receiving', () => {
    expect(subscriptionStatus(
      { deletedAt: null, subscriptionExpiresAt: lapsed, hasActiveCategory: true }, now,
    ).key).toBe('unpaid');
  });

  it('reports a withdrawn account as withdrawn whatever else is set', () => {
    const status = subscriptionStatus(
      { deletedAt: '2026-01-01T00:00:00.000Z', subscriptionExpiresAt: covered, hasActiveCategory: true },
      now,
    );
    expect(status.key).toBe('withdrawn');
    expect(status.holdsSlot).toBe(false);
  });
});

// 화면이 세는 수와 서버가 정원에 세는 수가 어긋나면 이 배지는 없는 것보다 나쁘다.
describe('subscriptionStatus agrees with the capacity count', () => {
  beforeEach(() => {
    db = createTestDb();
    seedSetting(db, 'registrationOpen', 'true');
    seedSetting(db, 'maxSubscribers', '50');
  });

  it('counts the same accounts as getActiveSubscriberCount', () => {
    // 두 축과 탈퇴까지 모든 조합.
    const cases: [string, string | null, boolean, boolean][] = [
      ['receiving', UNEXPIRED, true, false],
      ['unpaid-null', null, true, false],
      ['unpaid-lapsed', EXPIRED, true, false],
      ['paused', UNEXPIRED, false, false],
      ['inactive', EXPIRED, false, false],
      ['withdrawn-but-covered', UNEXPIRED, true, true],
      ['receiving-2', UNEXPIRED, true, false],
    ];

    const rows = cases.map(([name, expiresAt, active, deleted], i) => {
      const id = seedUser(db, {
        googleId: `g-${i}`,
        email: `${name}@test.com`,
        subscriptionExpiresAt: expiresAt,
        deletedAt: deleted ? '2026-01-01T00:00:00.000Z' : null,
      });
      seedSubscription(db, id, 'notice_Z', { isActive: active ? 1 : 0 });
      return { deletedAt: deleted ? '2026-01-01T00:00:00.000Z' : null, subscriptionExpiresAt: expiresAt, hasActiveCategory: active };
    });

    const held = rows.filter((row) => subscriptionStatus(row).holdsSlot).length;

    expect(held).toBe(2);
    expect(held).toBe(getActiveSubscriberCount());
  });
});
