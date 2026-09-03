import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb, seedPost, type TestDb } from '../helpers';

let db: TestDb;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

const { GET } = await import('@/app/go/[id]/route');

function req(id: string, userAgent = '') {
  return new NextRequest(`http://localhost/go/${id}`, {
    headers: { 'user-agent': userAgent },
  });
}

describe('GET /go/[id]', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it('redirects to home for non-numeric id', async () => {
    const res = await GET(
      req('abc'),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(307); // NextResponse.redirect default
    expect(new URL(res.headers.get('location')!).pathname).toBe('/');
  });

  it('redirects to home when post not found', async () => {
    const res = await GET(
      req('999'),
      { params: Promise.resolve({ id: '999' }) },
    );
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/');
  });

  it('redirects to desktop URL for desktop user-agent', async () => {
    const postId = seedPost(db, {
      postNumber: 42,
      boardType: 'notice',
      url: 'https://www.ksae.org/jajak/bbs/view.php?number=42&code=J_notice',
    });
    const res = await GET(
      req(String(postId), 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'),
      { params: Promise.resolve({ id: String(postId) }) },
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('ksae.org/jajak/bbs/view.php');
  });

  it('redirects to mobile URL for mobile user-agent', async () => {
    const postId = seedPost(db, {
      postNumber: 42,
      boardType: 'notice',
      url: 'https://www.ksae.org/jajak/bbs/view.php?number=42&code=J_notice',
    });
    const res = await GET(
      req(String(postId), 'Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit'),
      { params: Promise.resolve({ id: String(postId) }) },
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('mobile/bbs/view.php');
  });

  it.each([
    ['result', 'J_result'],
    ['form', 'J_form'],
  ])('uses the %s board code in the mobile URL', async (boardType, code) => {
    const postId = seedPost(db, {
      postNumber: 10,
      boardType,
      url: `https://www.ksae.org/jajak/bbs/?number=10&mode=view&code=${code}`,
    });
    const res = await GET(
      req(String(postId), 'Mozilla/5.0 (Android; Mobile)'),
      { params: Promise.resolve({ id: String(postId) }) },
    );
    expect(res.headers.get('location')).toBe(`https://www.ksae.org/jajak/mobile/bbs/view.php?number=10&page=1&code=${code}`);
  });

  it('uses correct mobile URL for rule board type', async () => {
    const postId = seedPost(db, {
      postNumber: 10,
      boardType: 'rule',
      url: 'https://www.ksae.org/jajak/bbs/view.php?number=10&code=J_rule',
    });
    const res = await GET(
      req(String(postId), 'Mozilla/5.0 (Android; Mobile)'),
      { params: Promise.resolve({ id: String(postId) }) },
    );
    expect(res.headers.get('location')).toContain('code=J_rule');
  });
});
