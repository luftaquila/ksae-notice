import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedSubscription, seedPost, seedEmailLog, seedCrawlLog, type TestDb } from '../helpers';

let db: TestDb;
let mockAdminSession: any = null;

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
    seedSubscription(db, u1, 'notice_Z');
    seedSubscription(db, u2, 'rule');
    seedSubscription(db, u2, 'notice_A', { isActive: 0 });

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

    expect(data.totalUsers).toBe(2);
    expect(data.activeSubscribers).toBe(2);
    expect(data.totalPosts).toBe(3);
    expect(data.emails.totalSent).toBe(2);
    expect(data.emails.totalFailed).toBe(1);
    expect(data.recentCrawls.length).toBe(2);
    expect(data.emails.recentFailed.length).toBe(1);
    expect(data.emails.recentFailed[0].error).toBe('timeout');
  });

  it('returns zeros when DB is empty', async () => {
    mockAdminSession = { user: { id: 1, isAdmin: true } };
    const res = await GET();
    const data = await res.json();
    expect(data.totalUsers).toBe(0);
    expect(data.activeSubscribers).toBe(0);
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
