import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { createTestDb, seedUser, seedAlertPreference, EXPIRED, UNEXPIRED, type TestDb } from '../helpers';
import { users, alertPreferences } from '@/lib/db/schema';
import { ALERT_CATEGORIES } from '@/lib/constants';

let db: TestDb;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

const { enableAlert, disableAlert, enableAllAlerts, disableAllAlerts, setAlertsPaused } = await import('@/lib/alerts/preferences');

function categoryOf(userId: number, category: string) {
  return db.select().from(alertPreferences)
    .where(and(eq(alertPreferences.userId, userId), eq(alertPreferences.category, category)))
    .get();
}

function account(userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get()!;
}

describe('enableAlert', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('reactivates a category the user already has a row for', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const rowId = seedAlertPreference(db, id, 'notice_Z', { isActive: 0 });

    enableAlert(id, 'notice_Z');

    const row = categoryOf(id, 'notice_Z')!;
    expect(row.id).toBe(rowId);
    expect(row.isActive).toBe(1);
  });

  it('inserts a category the user never had', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com' });

    enableAlert(id, 'rule');

    expect(categoryOf(id, 'rule')!.isActive).toBe(1);
  });

  // 알림 설정은 무료다. 여기서 기간이 생기면 누구나 토글 한 번으로 결제를 우회한다.
  it('does not start a period for an account that has none', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });

    enableAlert(id, 'notice_Z');

    expect(account(id).subscriptionExpiresAt).toBeNull();
  });

  it('does not revive a lapsed period', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: EXPIRED });

    enableAlert(id, 'notice_Z');

    expect(account(id).subscriptionExpiresAt).toBe(EXPIRED);
  });

  it('leaves a paid period exactly where it is', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: UNEXPIRED });
    seedAlertPreference(db, id, 'notice_Z');

    enableAlert(id, 'notice_A');

    expect(account(id).subscriptionExpiresAt).toBe(UNEXPIRED);
    expect(categoryOf(id, 'notice_A')!.isActive).toBe(1);
  });
});

describe('disableAlert / enableAllAlerts / disableAllAlerts', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('keeps the row when a category is switched off', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, id, 'notice_Z');

    disableAlert(id, 'notice_Z');

    expect(categoryOf(id, 'notice_Z')!.isActive).toBe(0);
  });

  // 행이 없는 카테고리(나중에 추가된 게시판)도 채우고, 꺼 둔 것도 되살린다.
  it('turns every category on, filling missing rows and reviving switched-off ones', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: EXPIRED });
    seedAlertPreference(db, id, 'notice_Z', { isActive: 0 });
    seedAlertPreference(db, id, 'rule');

    enableAllAlerts(id);

    const on = db.select().from(alertPreferences)
      .where(and(eq(alertPreferences.userId, id), eq(alertPreferences.isActive, 1)))
      .all().map((r) => r.category).sort();
    expect(on).toEqual([...ALERT_CATEGORIES].map((c) => c.id).sort());
    expect(account(id).subscriptionExpiresAt).toBe(EXPIRED);
  });

  it('turns every category off for that user only', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    for (const cat of ALERT_CATEGORIES) seedAlertPreference(db, id, cat.id);
    const other = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    seedAlertPreference(db, other, 'notice_Z');

    disableAllAlerts(id);

    const mine = db.select().from(alertPreferences).where(eq(alertPreferences.userId, id)).all();
    expect(mine).toHaveLength(ALERT_CATEGORIES.length);
    expect(mine.every((r) => r.isActive === 0)).toBe(true);
    expect(categoryOf(other, 'notice_Z')!.isActive).toBe(1);
  });
});

// 일시중지는 설정과 좌석을 그대로 두고 배달만 멈춘다.
describe('setAlertsPaused', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('stamps and clears alerts_paused_at without touching categories or the period', () => {
    const id = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: UNEXPIRED });
    seedAlertPreference(db, id, 'notice_Z');

    setAlertsPaused(id, true);
    expect(account(id).alertsPausedAt).not.toBeNull();
    expect(account(id).subscriptionExpiresAt).toBe(UNEXPIRED);
    expect(categoryOf(id, 'notice_Z')!.isActive).toBe(1);

    setAlertsPaused(id, false);
    expect(account(id).alertsPausedAt).toBeNull();
  });
});
