import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { getBoardCode, type BoardType } from '../constants';

export interface ParsedPost {
  postNumber: number;
  title: string;
  category: string | null;
  date: string;
  isPinned: boolean;
  url: string;
}

const BASE = 'https://www.ksae.org';

// 게시판마다 열이 다르다. 카테고리 열은 공지에만 있다.
//   J_notice: 번호 | 카테고리 | 제목 | 파일 | 조회수 | 등록일
//   J_rule:   번호 | 제목 | 파일 | 조회수 | 등록일
//   J_result: 번호 | 제목 | 등록자 | 파일 | 조회수 | 등록일
//   J_form:   번호 | 제목 | 파일 | 조회수 | 등록일
// 제목은 공지에서 3번째, 나머지는 2번째 열이고 등록일은 항상 마지막 열이다.
// 열 개수로 게시판을 짐작하면 안 된다 — 경기결과도 6열이지만 2번째가 제목이다.
export function parseBoardPage(html: string, boardType: BoardType): ParsedPost[] {
  const $ = cheerio.load(html);

  const posts: ParsedPost[] = [];

  const rows = $('table tr').toArray();

  for (const row of rows) {
    const tds = $(row).find('td');
    if (tds.length < 5) continue;

    const firstTd = tds.eq(0);
    const isPinned = firstTd.find('img[src*="notice"]').length > 0;

    let titleTd: cheerio.Cheerio<AnyNode>;
    let category: string | null = null;

    if (boardType === 'notice') {
      if (tds.length < 6) continue;
      category = tds.eq(1).text().trim() || null;
      titleTd = tds.eq(2);
    } else {
      titleTd = tds.eq(1);
    }

    const link = titleTd.find('a').first();
    if (!link.length) continue;

    const href = link.attr('href');
    if (!href) continue;

    const numberMatch = href.match(/number=(\d+)/);
    if (!numberMatch) continue;

    const postNumber = parseInt(numberMatch[1], 10);

    const titleSpan = link.find('span').first();
    const title = (titleSpan.length ? titleSpan.text() : link.text()).trim();

    if (!title) continue;

    const dateTd = tds.eq(tds.length - 1);
    const date = dateTd.text().trim();

    const url = `${BASE}/jajak/bbs/?number=${postNumber}&mode=view&code=${getBoardCode(boardType)}`;

    posts.push({ postNumber, title, category, date, isPinned, url });
  }

  return posts;
}
