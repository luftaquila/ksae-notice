import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { posts, crawlLogs } from '../db/schema';
import { BOARDS, type BoardType } from '../constants';
import { parseBoardPage, type ParsedPost } from './parser';
import { notifyNewPosts } from '../email/sender';

async function fetchPage(boardCode: string, page: number): Promise<string> {
  const url = `https://www.ksae.org/jajak/bbs/index.php?page=${page}&code=${boardCode}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; KSAE-Notice-Bot/1.0)',
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

function insertPost(db: ReturnType<typeof getDb>, post: ParsedPost, boardType: BoardType): boolean {
  try {
    const result = db
      .insert(posts)
      .values({
        boardType,
        postNumber: post.postNumber,
        title: post.title,
        category: post.category,
        date: post.date,
        isPinned: post.isPinned ? 1 : 0,
        url: post.url,
      })
      .onConflictDoNothing({
        target: [posts.boardType, posts.postNumber],
      })
      .run();

    return result.changes > 0;
  } catch {
    return false;
  }
}

export async function crawlAll(): Promise<void> {
  const db = getDb();
  console.log('[Crawler] Starting full crawl...');

  for (const board of BOARDS) {
    const logId = db
      .insert(crawlLogs)
      .values({
        boardType: board.type,
        startedAt: new Date().toISOString(),
        status: 'running',
      })
      .run().lastInsertRowid;

    try {
      let newCount = 0;
      let page = 1;

      while (true) {
        const html = await fetchPage(board.code, page);
        const pagePosts = parseBoardPage(html, board.type);

        // No posts found (or only pinned on subsequent pages) → done
        const nonPinned = pagePosts.filter((p) => !p.isPinned);
        if (page > 1 && nonPinned.length === 0) break;
        if (pagePosts.length === 0) break;

        for (const post of pagePosts) {
          // Skip pinned posts on subsequent pages (already inserted from page 1)
          if (page > 1 && post.isPinned) continue;
          if (insertPost(db, post, board.type)) newCount++;
        }

        page++;
        await new Promise((r) => setTimeout(r, 500));
      }

      db.update(crawlLogs)
        .set({
          finishedAt: new Date().toISOString(),
          newPostsCount: newCount,
          status: 'completed',
        })
        .where(eq(crawlLogs.id, Number(logId)))
        .run();

      console.log(`[Crawler] Full crawl for ${board.type}: ${newCount} posts inserted (${page - 1} pages)`);
    } catch (error) {
      db.update(crawlLogs)
        .set({
          finishedAt: new Date().toISOString(),
          status: 'failed',
        })
        .where(eq(crawlLogs.id, Number(logId)))
        .run();

      console.error(`[Crawler] Full crawl failed for ${board.type}:`, error);
    }
  }
}

export async function crawlLatest(): Promise<ParsedPost[]> {
  const db = getDb();
  const allNewPosts: (ParsedPost & { boardType: BoardType })[] = [];

  for (const board of BOARDS) {
    const logId = db
      .insert(crawlLogs)
      .values({
        boardType: board.type,
        startedAt: new Date().toISOString(),
        status: 'running',
      })
      .run().lastInsertRowid;

    try {
      const html = await fetchPage(board.code, 1);
      const pagePosts = parseBoardPage(html, board.type);
      let newCount = 0;

      for (const post of pagePosts) {
        if (insertPost(db, post, board.type)) {
          newCount++;
          allNewPosts.push({ ...post, boardType: board.type });
        }
      }

      db.update(crawlLogs)
        .set({
          finishedAt: new Date().toISOString(),
          newPostsCount: newCount,
          status: 'completed',
        })
        .where(eq(crawlLogs.id, Number(logId)))
        .run();

      if (newCount > 0) {
        console.log(`[Crawler] Incremental crawl for ${board.type}: ${newCount} new posts`);
      }
    } catch (error) {
      db.update(crawlLogs)
        .set({
          finishedAt: new Date().toISOString(),
          status: 'failed',
        })
        .where(eq(crawlLogs.id, Number(logId)))
        .run();

      console.error(`[Crawler] Incremental crawl failed for ${board.type}:`, error);
    }
  }

  if (allNewPosts.length > 0) {
    try {
      await notifyNewPosts(allNewPosts);
    } catch (error) {
      console.error('[Crawler] Failed to send notifications:', error);
    }
  }

  return allNewPosts;
}

export function needsInitialCrawl(): boolean {
  const db = getDb();
  const count = db
    .select({ count: sql<number>`count(*)` })
    .from(posts)
    .get();
  return !count || count.count === 0;
}
