import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb, seedPost, type TestDb } from '../helpers';

let db: TestDb;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

const { GET } = await import('@/app/api/posts/route');

function req(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/posts');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

describe('GET /api/posts', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('returns empty list when no posts', async () => {
    const res = await GET(req());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.posts).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.page).toBe(1);
    expect(data.totalPages).toBe(0);
  });

  it('returns paginated posts', async () => {
    for (let i = 1; i <= 25; i++) {
      seedPost(db, { postNumber: i, title: `Post ${i}`, date: `2025-01-${String(i).padStart(2, '0')}` });
    }
    const res = await GET(req({ page: '2', limit: '10' }));
    const data = await res.json();
    expect(data.posts.length).toBe(10);
    expect(data.total).toBe(25);
    expect(data.page).toBe(2);
    expect(data.totalPages).toBe(3);
  });

  it('filters by board type', async () => {
    seedPost(db, { boardType: 'notice', postNumber: 1 });
    seedPost(db, { boardType: 'rule', postNumber: 2 });
    const res = await GET(req({ board: 'rule' }));
    const data = await res.json();
    expect(data.posts.length).toBe(1);
    expect(data.posts[0].boardType).toBe('rule');
  });

  it('filters by category', async () => {
    seedPost(db, { category: '공통', postNumber: 1 });
    seedPost(db, { category: 'Baja', postNumber: 2 });
    const res = await GET(req({ category: '공통' }));
    const data = await res.json();
    expect(data.posts.length).toBe(1);
    expect(data.posts[0].category).toBe('공통');
  });

  it('filters by categories param with 공통 (includes null category)', async () => {
    seedPost(db, { boardType: 'notice', category: '공통', postNumber: 1, title: 'Common' });
    seedPost(db, { boardType: 'notice', category: null, postNumber: 2, title: 'Null cat' });
    seedPost(db, { boardType: 'notice', category: 'Baja', postNumber: 3, title: 'Baja only' });
    const res = await GET(req({ categories: '공통' }));
    const data = await res.json();
    expect(data.total).toBe(2);
    const titles = data.posts.map((p: { title: string }) => p.title);
    expect(titles).toContain('Common');
    expect(titles).toContain('Null cat');
  });

  it('filters categories with 규정', async () => {
    seedPost(db, { boardType: 'notice', category: '공통', postNumber: 1 });
    seedPost(db, { boardType: 'rule', category: null, postNumber: 2, title: 'Rule post' });
    const res = await GET(req({ categories: '규정' }));
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.posts[0].boardType).toBe('rule');
  });

  it('filters mixed categories (notice + rule)', async () => {
    seedPost(db, { boardType: 'notice', category: 'Baja', postNumber: 1 });
    seedPost(db, { boardType: 'rule', postNumber: 2 });
    seedPost(db, { boardType: 'notice', category: 'EV', postNumber: 3 });
    const res = await GET(req({ categories: 'Baja,규정' }));
    const data = await res.json();
    expect(data.total).toBe(2);
  });

  it('filters pinned posts', async () => {
    seedPost(db, { isPinned: 1, postNumber: 1 });
    seedPost(db, { isPinned: 0, postNumber: 2 });
    const res = await GET(req({ pinned: 'true' }));
    const data = await res.json();
    expect(data.posts.length).toBe(1);
    expect(data.posts[0].isPinned).toBe(1);
  });

  it('searches by title', async () => {
    seedPost(db, { title: '안전 관련 공지사항', postNumber: 1 });
    seedPost(db, { title: '일정 변경 안내', postNumber: 2 });
    const res = await GET(req({ search: '안전' }));
    const data = await res.json();
    expect(data.posts.length).toBe(1);
    expect(data.posts[0].title).toContain('안전');
  });

  it('escapes LIKE special characters in search', async () => {
    seedPost(db, { title: '100% 완료', postNumber: 1 });
    seedPost(db, { title: '일반 게시글', postNumber: 2 });
    const res = await GET(req({ search: '100%' }));
    const data = await res.json();
    expect(data.posts.length).toBe(1);
  });

  it('clamps page and limit to valid ranges', async () => {
    seedPost(db, { postNumber: 1 });
    // page < 1 → 1, limit > 100 → 100
    const res = await GET(req({ page: '-5', limit: '999' }));
    const data = await res.json();
    expect(data.page).toBe(1);
    expect(data.posts.length).toBe(1);
  });

  it('orders pinned first by default', async () => {
    seedPost(db, { isPinned: 0, postNumber: 1, date: '2025-01-20' });
    seedPost(db, { isPinned: 1, postNumber: 2, date: '2025-01-10' });
    const res = await GET(req());
    const data = await res.json();
    expect(data.posts[0].isPinned).toBe(1);
  });

  it('disables pinnedFirst ordering', async () => {
    seedPost(db, { isPinned: 0, postNumber: 1, date: '2025-01-20' });
    seedPost(db, { isPinned: 1, postNumber: 2, date: '2025-01-10' });
    const res = await GET(req({ pinnedFirst: 'false' }));
    const data = await res.json();
    expect(data.posts[0].date).toBe('2025-01-20');
  });

  it('falls back to defaults for non-numeric page/limit', async () => {
    seedPost(db, { postNumber: 1 });
    const res = await GET(req({ page: 'abc', limit: 'xyz' }));
    const data = await res.json();
    expect(data.page).toBe(1);
    expect(data.posts.length).toBe(1);
  });

  it('escapes underscore and exclamation in search', async () => {
    seedPost(db, { title: 'test_value here', postNumber: 1 });
    seedPost(db, { title: 'testXvalue here', postNumber: 2 });
    const res = await GET(req({ search: 'test_value' }));
    const data = await res.json();
    expect(data.posts.length).toBe(1);
    expect(data.posts[0].title).toBe('test_value here');
  });

  it('handles empty categories param gracefully', async () => {
    seedPost(db, { postNumber: 1 });
    const res = await GET(req({ categories: '' }));
    const data = await res.json();
    // Empty categories filter = no filter from categories block, returns all posts
    expect(data.total).toBe(1);
  });

  it('filters categories with 경기결과 and 양식 (board-level filters)', async () => {
    seedPost(db, { boardType: 'notice', category: '공통', postNumber: 1, title: 'Notice' });
    seedPost(db, { boardType: 'rule', category: null, postNumber: 2, title: 'Rule' });
    seedPost(db, { boardType: 'result', category: null, postNumber: 3, title: 'Result' });
    seedPost(db, { boardType: 'form', category: null, postNumber: 4, title: 'Form' });

    let data = await (await GET(req({ categories: '경기결과' }))).json();
    expect(data.posts.map((p: { title: string }) => p.title)).toEqual(['Result']);

    data = await (await GET(req({ categories: '양식' }))).json();
    expect(data.posts.map((p: { title: string }) => p.title)).toEqual(['Form']);

    data = await (await GET(req({ categories: 'EV,양식,경기결과' }))).json();
    expect(data.posts.map((p: { title: string }) => p.title).sort()).toEqual(['Form', 'Result']);
  });

  it('orders pinned posts by board (notice, rule, result, form), not alphabetically', async () => {
    seedPost(db, { boardType: 'form', isPinned: 1, postNumber: 1, date: '2025-04-01', title: 'Form' });
    seedPost(db, { boardType: 'result', isPinned: 1, postNumber: 2, date: '2025-03-01', title: 'Result' });
    seedPost(db, { boardType: 'rule', isPinned: 1, postNumber: 3, date: '2025-02-01', title: 'Rule' });
    seedPost(db, { boardType: 'notice', isPinned: 1, postNumber: 4, date: '2025-01-01', title: 'Notice' });
    seedPost(db, { boardType: 'form', isPinned: 0, postNumber: 5, date: '2025-05-01', title: 'Form plain' });

    const data = await (await GET(req())).json();
    expect(data.posts.map((p: { title: string }) => p.title)).toEqual(['Notice', 'Rule', 'Result', 'Form', 'Form plain']);
  });

  it('filters categories with 공통 and 규정 combined', async () => {
    seedPost(db, { boardType: 'notice', category: '공통', postNumber: 1, title: 'Common' });
    seedPost(db, { boardType: 'notice', category: null, postNumber: 2, title: 'Null cat' });
    seedPost(db, { boardType: 'rule', category: null, postNumber: 3, title: 'Rule' });
    seedPost(db, { boardType: 'notice', category: 'Baja', postNumber: 4, title: 'Baja only' });
    const res = await GET(req({ categories: '공통,규정' }));
    const data = await res.json();
    expect(data.total).toBe(3);
    const titles = data.posts.map((p: { title: string }) => p.title);
    expect(titles).toContain('Common');
    expect(titles).toContain('Null cat');
    expect(titles).toContain('Rule');
    expect(titles).not.toContain('Baja only');
  });
});
