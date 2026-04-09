import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { BoardType } from '../constants';

export interface ParsedPost {
  postNumber: number;
  title: string;
  category: string | null;
  date: string;
  isPinned: boolean;
  url: string;
}

export interface ParseResult {
  posts: ParsedPost[];
  totalPages: number;
}

const BASE = 'https://www.ksae.org';

export function parseBoardPage(html: string, boardType: BoardType): ParseResult {
  const $ = cheerio.load(html);

  const posts: ParsedPost[] = [];

  // The post list is in a table. Each row is a <tr> inside tbody (or directly in table).
  // Notice board: 6 columns (icon/number, category, title, file, views, date)
  // Rule board: 5 columns (icon/number, title, file, views, date)
  const rows = $('table tr').toArray();

  for (const row of rows) {
    const tds = $(row).find('td');
    if (tds.length < 5) continue;

    // Determine if this is a pinned post by checking for notice.png in the first td
    const firstTd = tds.eq(0);
    const isPinned = firstTd.find('img[src*="notice"]').length > 0;

    let titleTd: cheerio.Cheerio<AnyNode>;
    let category: string | null = null;

    if (boardType === 'notice') {
      // Notice board has 6 columns: [icon/num, category, title, file, views, date]
      if (tds.length < 6) continue;
      category = tds.eq(1).text().trim() || null;
      titleTd = tds.eq(2);
    } else {
      // Rule board has 5 columns: [icon/num, title, file, views, date]
      titleTd = tds.eq(1);
    }

    // Extract the post link and number
    const link = titleTd.find('a').first();
    if (!link.length) continue;

    const href = link.attr('href');
    if (!href) continue;

    // Extract post number from href: ?number=XXXXX&mode=view&...
    const numberMatch = href.match(/number=(\d+)/);
    if (!numberMatch) continue;

    const postNumber = parseInt(numberMatch[1], 10);

    // Extract title text from span (or direct text node)
    const titleSpan = link.find('span').first();
    const title = (titleSpan.length ? titleSpan.text() : link.text()).trim();

    if (!title) continue;

    // Extract date from the last td
    const dateTd = tds.eq(tds.length - 1);
    const date = dateTd.text().trim();

    // Build full URL
    const url = `${BASE}/jajak/bbs/?number=${postNumber}&mode=view&code=${boardType === 'notice' ? 'J_notice' : 'J_rule'}`;

    posts.push({ postNumber, title, category, date, isPinned, url });
  }

  // Parse total pages from pagination
  const totalPages = parseTotalPages($);

  return { posts, totalPages };
}

function parseTotalPages($: cheerio.CheerioAPI): number {
  let maxPage = 1;

  // Look for pagination links containing page= parameter
  $('a[href*="page="]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/page=(\d+)/);
    if (match) {
      const page = parseInt(match[1], 10);
      if (page > maxPage) maxPage = page;
    }
  });

  return maxPage;
}
