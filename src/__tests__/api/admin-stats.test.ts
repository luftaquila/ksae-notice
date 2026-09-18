import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedAlertPreference, seedPost, seedEmailLog, seedCrawlLog, type MockSession, type TestDb } from '../helpers';

let db: TestDb;
let mockAdminSession: MockSession = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  requireAdmin: () => mockAdminSession,
}));

const { GET } = await import('@/app/api/admin/stats/route');

describe('GET /api/admin/stats', () => {
  beforeEach(() => {
    db = createTestDb();
    mockAdminSession = null;
  });

  it('returns 403 when not admin', async () => {
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns comprehensive stats', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };

    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const u2 = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    seedAlertPreference(db, u1, 'notice_Z');
    seedAlertPreference(db, u2, 'rule');
    seedAlertPreference(db, u2, 'notice_A', { isActive: 0 });
    // 좌석은 있지만 일시중지 — 구독자에는 잡히고 수신인에는 안 잡힌다.
    const u3 = seedUser(db, { googleId: 'g3', email: 'c@test.com', alertsPausedAt: '2026-01-01T00:00:00.000Z' });
    seedAlertPreference(db, u3, 'notice_Z');
    // 좌석은 있지만 알림을 전부 꺼 둠 — 역시 수신인이 아니다. 수신인 + 꺼짐 + 일시중지 = 좌석.
    const u4 = seedUser(db, { googleId: 'g4', email: 'd@test.com' });
    seedAlertPreference(db, u4, 'notice_Z', { isActive: 0 });

    seedPost(db, { postNumber: 1 });
    seedPost(db, { postNumber: 2 });
    seedPost(db, { postNumber: 3 });

    seedEmailLog(db, u1, { status: 'sent' });
    seedEmailLog(db, u1, { status: 'sent' });
    seedEmailLog(db, u2, { status: 'failed', error: 'timeout' });

    seedCrawlLog(db, { boardType: 'notice', status: 'completed' });
    seedCrawlLog(db, { boardType: 'rule', status: 'failed' });

    const res = await GET();
    const data = await res.json();

    expect(data.totalUsers).toBe(4);
    expect(data.seats).toBe(4);
    expect(data.recipients).toBe(2);
    expect(data.seatsAlertsOff).toBe(1);
    expect(data.seatsPaused).toBe(1);
    expect(data.recipients + data.seatsAlertsOff + data.seatsPaused).toBe(data.seats);
    expect(data.totalPosts).toBe(3);
    expect(data.emails.totalSent).toBe(2);
    expect(data.emails.totalFailed).toBe(1);
    expect(data.emails.todayFailed).toBe(1);
    expect(data.recentCrawls.length).toBe(2);
    expect(data.emails.recentFailed.length).toBe(1);
    expect(data.emails.recentFailed[0].error).toBe('timeout');
  });

  it('returns zeros when DB is empty', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const res = await GET();
    const data = await res.json();
    expect(data.totalUsers).toBe(0);
    expect(data.seats).toBe(0);
    expect(data.recipients).toBe(0);
    expect(data.seatsAlertsOff).toBe(0);
    expect(data.seatsPaused).toBe(0);
    expect(data.totalPosts).toBe(0);
    expect(data.emails.totalSent).toBe(0);
    expect(data.recentCrawls).toEqual([]);
  });

  it('counts todaySent emails correctly', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    // today's sent email (default sentAt = datetime('now'))
    seedEmailLog(db, userId, { status: 'sent' });
    seedEmailLog(db, userId, { status: 'sent' });
    // today's failed email — should not count
    seedEmailLog(db, userId, { status: 'failed' });
    // old sent email
    seedEmailLog(db, userId, { status: 'sent', sentAt: '2020-01-01T00:00:00Z' });

    const res = await GET();
    const data = await res.json();
    expect(data.emails.todaySent).toBe(2);
    expect(data.emails.totalSent).toBe(3);
  });
});
