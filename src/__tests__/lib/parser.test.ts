import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseBoardPage } from '@/lib/crawler/parser';
import { BOARDS, type BoardType } from '@/lib/constants';

// 실제 게시판 HTML 에서 헤더 + 고정글 1 + 일반글 2 만 남긴 것이다 (2026-09-03 수집).
function fixture(board: BoardType): string {
  return readFileSync(join(__dirname, '..', 'fixtures', `board_${board}.html`), 'utf8');
}

describe('parseBoardPage', () => {
  it('parses the notice board with its category column', () => {
    const posts = parseBoardPage(fixture('notice'), 'notice');
    expect(posts.map((p) => p.postNumber)).toEqual([71643, 71632, 71595]);

    const [pinned, plain, formula] = posts;
    expect(pinned).toMatchObject({
      title: '2026 대학생 자작자동차 발표대회 참가팀 모집',
      category: '공통',
      date: '2026-09-02',
      isPinned: true,
      url: 'https://www.ksae.org/jajak/bbs/?number=71643&mode=view&code=J_notice',
    });
    // 제목 안의 <오토저널> 은 태그가 아니라 글자다.
    expect(plain.title).toBe('학회지<오토저널> 2026 대학생 자작자동차대회 현장 스케치 원고모집');
    expect(plain.isPinned).toBe(false);
    expect(formula.category).toBe('Formula');
  });

  it('parses the rule board (no category column)', () => {
    const posts = parseBoardPage(fixture('rule'), 'rule');
    expect(posts.map((p) => p.postNumber)).toEqual([71479, 67178, 67044]);
    expect(posts[0]).toMatchObject({
      title: '2026 대학생 자작자동차대회 - 발표대회규정',
      category: null,
      date: '2026-05-27',
      isPinned: true,
      url: 'https://www.ksae.org/jajak/bbs/?number=71479&mode=view&code=J_rule',
    });
    expect(posts[1]).toMatchObject({ title: '2025 대학생 자율주행 포뮬러 경진대회 - 규정 개정', date: '2025-07-25', isPinned: false });
  });

  it('parses the result board — six columns like notice, but the title is the second one', () => {
    const posts = parseBoardPage(fixture('result'), 'result');
    expect(posts.map((p) => p.postNumber)).toEqual([71635, 71444, 68677]);
    expect(posts[0]).toMatchObject({
      title: '[26FSK]내구경기 스타터 오더(출발순서)',
      category: null,
      date: '2026-08-29',
      isPinned: true,
      url: 'https://www.ksae.org/jajak/bbs/?number=71635&mode=view&code=J_result',
    });
    // 등록자 열('Formula경기운영위원장')이 제목이나 카테고리로 새지 않는다.
    for (const post of posts) {
      expect(post.category).toBeNull();
      expect(post.title).not.toMatch(/경기운영위원장/);
    }
    expect(posts[2]).toMatchObject({
      title: '[스마트 e모빌리티] 2025 대학생 스마트 e-모빌리티 경진대회 결승 결과공지',
      date: '2025-10-26',
      isPinned: false,
    });
  });

  it('parses the form board', () => {
    const posts = parseBoardPage(fixture('form'), 'form');
    expect(posts.map((p) => p.postNumber)).toEqual([71530, 68664, 67242]);
    expect(posts[0]).toMatchObject({
      title: '[Baja Student Korea] 검차양식 (Technical Inspection Sheet)',
      category: null,
      date: '2026-06-25',
      isPinned: true,
      url: 'https://www.ksae.org/jajak/bbs/?number=71530&mode=view&code=J_form',
    });
    expect(posts[1]).toMatchObject({ title: '[스마트 e모빌리티] 2025 대회양식', date: '2025-10-20', isPinned: false });
  });

  it('writes every board URL with that board\'s own code', () => {
    for (const board of BOARDS) {
      const posts = parseBoardPage(fixture(board.type), board.type);
      expect(posts.length).toBeGreaterThan(0);
      for (const post of posts) {
        expect(post.url).toContain(`code=${board.code}`);
      }
    }
  });

  it('returns nothing for a page without post rows', () => {
    expect(parseBoardPage('<html><body><table><tr><th>번호</th></tr></table></body></html>', 'result')).toEqual([]);
    expect(parseBoardPage('', 'form')).toEqual([]);
  });
});
