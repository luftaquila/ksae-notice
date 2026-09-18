import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedAlertPreference, seedSetting, seedCrawlLog, type TestDb } from '../helpers';

let db: TestDb;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

const { GET } = await import('@/app/api/stats/route');

describe('GET /api/stats', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('returns zeros when DB is empty', async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.activeSubscribers).toBe(0);
    expect(data.maxSubscribers).toBe(50); // default
    expect(data.registrationOpen).toBe(true); // default (not 'false')
    expect(data.lastCrawl).toBeNull();
  });

  // 구독자 수 = 결제된 좌석 수. 알림을 전부 꺼 둔 사람도 좌석은 가지고 있고,
  // 기간이 없는 사람은 카테고리를 아무리 켜도 좌석이 없다.
  it('counts paid seats, not switched-on categories', async () => {
    const paid = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedAlertPreference(db, paid, 'notice_Z');
    const paidButMuted = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    seedAlertPreference(db, paidButMuted, 'notice_Z', { isActive: 0 });
    const unpaid = seedUser(db, { googleId: 'g3', email: 'c@test.com', subscriptionExpiresAt: null });
    seedAlertPreference(db, unpaid, 'notice_Z');

    const data = await (await GET()).json();
    expect(data.activeSubscribers).toBe(2);
  });

  it('reads maxSubscribers and registrationOpen from settings', async () => {
    seedSetting(db, 'maxSubscribers', '100');
    seedSetting(db, 'registrationOpen', 'false');

    const res = await GET();
    const data = await res.json();
    expect(data.maxSubscribers).toBe(100);
    expect(data.registrationOpen).toBe(false);
  });

  it('returns last completed crawl', async () => {
    seedCrawlLog(db, { boardType: 'notice', status: 'completed', finishedAt: '2025-01-01T10:00:00Z', newPostsCount: 3 });
    seedCrawlLog(db, { boardType: 'rule', status: 'completed', finishedAt: '2025-01-02T10:00:00Z', newPostsCount: 1 });
    seedCrawlLog(db, { boardType: 'notice', status: 'failed', finishedAt: '2025-01-03T10:00:00Z' });

    const res = await GET();
    const data = await res.json();
    expect(data.lastCrawl).not.toBeNull();
    expect(data.lastCrawl.boardType).toBe('rule');
    expect(data.lastCrawl.newPostsCount).toBe(1);
  });

  it('returns null lastCrawl when only failed crawls exist', async () => {
    seedCrawlLog(db, { boardType: 'notice', status: 'failed', finishedAt: '2025-01-01T10:00:00Z' });

    const res = await GET();
    const data = await res.json();
    expect(data.lastCrawl).toBeNull();
  });
});
