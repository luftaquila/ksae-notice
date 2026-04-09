import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedSubscription, seedSetting, seedCrawlLog, type TestDb } from '../helpers';

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

  it('counts distinct active subscribers', async () => {
    const u1 = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    const u2 = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    seedSubscription(db, u1, 'notice_Z');
    seedSubscription(db, u1, 'notice_A');
    seedSubscription(db, u2, 'notice_Z');
    seedSubscription(db, u2, 'rule', { isActive: 0 });

    const res = await GET();
    const data = await res.json();
    expect(data.activeSubscribers).toBe(2); // distinct users with active subs
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
