import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedAlertPreference, seedSetting, EXPIRED, UNEXPIRED, type TestDb } from '../helpers';
import { alertSummary, subscriptionState } from '@/lib/subscription/status';

let db: TestDb;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

const { getSeatCount } = await import('@/lib/subscription/capacity');

describe('subscriptionState', () => {
  const now = new Date('2026-08-19T00:00:00.000Z');
  const covered = '2026-12-31T23:59:59.000Z';
  const lapsed = '2025-12-31T23:59:59.000Z';

  it('is active, and holds a seat, only while the period runs', () => {
    const active = subscriptionState({ deletedAt: null, subscriptionExpiresAt: covered }, now);
    expect(active.key).toBe('active');
    expect(active.holdsSeat).toBe(true);
  });

  it('separates never-paid from lapsed', () => {
    const none = subscriptionState({ deletedAt: null, subscriptionExpiresAt: null }, now);
    const expired = subscriptionState({ deletedAt: null, subscriptionExpiresAt: lapsed }, now);

    expect([none.key, expired.key]).toEqual(['none', 'expired']);
    expect([none.holdsSeat, expired.holdsSeat]).toEqual([false, false]);
  });

  it('reports a withdrawn account as withdrawn whatever else is set', () => {
    const state = subscriptionState({ deletedAt: '2026-01-01T00:00:00.000Z', subscriptionExpiresAt: covered }, now);
    expect(state.key).toBe('withdrawn');
    expect(state.holdsSeat).toBe(false);
  });
});

// 알림 설정은 구독과 곱하지 않는다. 설정 자체가 배달을 허용하는지만 말한다.
describe('alertSummary', () => {
  it('folds the category switches and the pause into one line', () => {
    expect(alertSummary({ activeCount: 8, total: 8, paused: false })).toMatchObject({ key: 'all', delivering: true });
    expect(alertSummary({ activeCount: 3, total: 8, paused: false })).toMatchObject({ key: 'partial', label: '3/8 켜짐', delivering: true });
    expect(alertSummary({ activeCount: 0, total: 8, paused: false })).toMatchObject({ key: 'off', delivering: false });
  });

  it('lets the pause override everything else', () => {
    expect(alertSummary({ activeCount: 8, total: 8, paused: true })).toMatchObject({ key: 'paused', delivering: false });
  });
});

// 화면이 세는 좌석과 서버가 정원에 세는 좌석이 어긋나면 이 배지는 없는 것보다 나쁘다.
describe('subscriptionState agrees with the seat count', () => {
  beforeEach(() => {
    db = createTestDb();
    seedSetting(db, 'registrationOpen', 'true');
    seedSetting(db, 'maxSubscribers', '50');
  });

  it('counts the same accounts as getSeatCount, whatever the alert settings say', () => {
    // 기간 × 탈퇴 × (무관해야 하는) 알림 설정의 모든 조합.
    const cases: [string, string | null, boolean, boolean, boolean][] = [
      ['active-all-on', UNEXPIRED, false, true, false],
      ['active-all-off', UNEXPIRED, false, false, false],
      ['active-paused', UNEXPIRED, false, true, true],
      ['none-on', null, false, true, false],
      ['expired-on', EXPIRED, false, true, false],
      ['withdrawn-covered', UNEXPIRED, true, true, false],
    ];

    const rows = cases.map(([name, expiresAt, deleted, on, paused], i) => {
      const deletedAt = deleted ? '2026-01-01T00:00:00.000Z' : null;
      const id = seedUser(db, {
        googleId: `g-${i}`,
        email: `${name}@test.com`,
        subscriptionExpiresAt: expiresAt,
        deletedAt,
        alertsPausedAt: paused ? '2026-01-01T00:00:00.000Z' : null,
      });
      seedAlertPreference(db, id, 'notice_Z', { isActive: on ? 1 : 0 });
      return { deletedAt, subscriptionExpiresAt: expiresAt };
    });

    const held = rows.filter((row) => subscriptionState(row).holdsSeat).length;

    expect(held).toBe(3);
    expect(held).toBe(getSeatCount());
  });
});
