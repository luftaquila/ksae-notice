import { eq, sql, and } from 'drizzle-orm';
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
      // Fetch page 1 to get total pages
      const html1 = await fetchPage(board.code, 1);
      const result1 = parseBoardPage(html1, board.type);
      let newCount = 0;

      for (const post of result1.posts) {
        if (insertPost(db, post, board.type)) newCount++;
      }

      // Fetch remaining pages
      for (let page = 2; page <= result1.totalPages; page++) {
        const html = await fetchPage(board.code, page);
        const result = parseBoardPage(html, board.type);

        for (const post of result.posts) {
          // Skip pinned posts on subsequent pages (already inserted from page 1)
          if (post.isPinned) continue;
          if (insertPost(db, post, board.type)) newCount++;
        }

        // Small delay to be polite
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

      console.log(`[Crawler] Full crawl for ${board.type}: ${newCount} posts inserted`);
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
      const result = parseBoardPage(html, board.type);
      let newCount = 0;

      for (const post of result.posts) {
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

  // Send notifications for new posts
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
