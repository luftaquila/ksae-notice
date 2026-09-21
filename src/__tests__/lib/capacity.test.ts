import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedAlertPreference, seedSetting, EXPIRED, type TestDb } from '../helpers';

let db: TestDb;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

const {
  DEFAULT_MAX_SUBSCRIBERS,
  getMaxSubscribers,
  getRecipientCount,
  getSeatCount,
  holdsSeat,
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

// 좌석 = 결제된 기간이 남아 있는 미탈퇴 계정. 알림 설정은 좌석과 무관하다.
describe('getSeatCount', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('counts each paid account once', () => {
    seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedUser(db, { googleId: 'g2', email: 'b@test.com' });

    expect(getSeatCount()).toBe(2);
  });

  // 결제한 사람이 토글을 다 끈다고 자리가 비지 않는다 — 그러면 남이 들어오고, 다시
  // 켜면 정원 초과인 채로 수신했다.
  it('keeps the seat of a paid account with every alert switched off or paused', () => {
    const muted = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, muted, 'notice_Z', { isActive: 0 });
    seedUser(db, { googleId: 'g2', email: 'b@test.com', alertsPausedAt: '2026-01-01T00:00:00.000Z' });

    expect(getSeatCount()).toBe(2);
  });

  it('ignores a lapsed account', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: EXPIRED });
    seedAlertPreference(db, u1, 'notice_Z');

    expect(getSeatCount()).toBe(0);
  });

  it('ignores an account with no period, however many alerts it has on', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    seedAlertPreference(db, u1, 'notice_Z');
    seedAlertPreference(db, u1, 'rule');

    expect(getSeatCount()).toBe(0);
  });

  it('ignores a deleted account even if its period was left in place', () => {
    seedUser(db, { googleId: 'g1', email: 'a@test.com', deletedAt: '2026-01-01T00:00:00.000Z' });

    expect(getSeatCount()).toBe(0);
  });
});

// 실제 수신인 = 좌석 ∩ 알림 하나 이상 켬 ∖ 일시중지. 좌석보다 작거나 같다.
describe('getRecipientCount', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('counts a seat once however many categories it has on, and drops muted or paused seats', () => {
    const chatty = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, chatty, 'notice_Z');
    seedAlertPreference(db, chatty, 'rule');
    const muted = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    seedAlertPreference(db, muted, 'notice_Z', { isActive: 0 });
    const pausedUser = seedUser(db, { googleId: 'g3', email: 'c@test.com', alertsPausedAt: '2026-01-01T00:00:00.000Z' });
    seedAlertPreference(db, pausedUser, 'notice_Z');

    expect(getSeatCount()).toBe(3);
    expect(getRecipientCount()).toBe(1);
  });

  it('never counts someone without a seat, however loud their settings', () => {
    const unpaid = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    seedAlertPreference(db, unpaid, 'notice_Z');
    const lapsed = seedUser(db, { googleId: 'g2', email: 'b@test.com', subscriptionExpiresAt: EXPIRED });
    seedAlertPreference(db, lapsed, 'notice_Z');

    expect(getRecipientCount()).toBe(0);
  });
});

describe('holdsSeat', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('is true while the period runs, with or without alerts on', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    expect(holdsSeat(u1)).toBe(true);
  });

  it('is false once the period has lapsed', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: EXPIRED });
    expect(holdsSeat(u1)).toBe(false);
  });

  it('is false with no period at all', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    expect(holdsSeat(u1)).toBe(false);
  });

  it('is false for a deleted account', () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com', deletedAt: '2026-01-01T00:00:00.000Z' });
    expect(holdsSeat(u1)).toBe(false);
  });
});
