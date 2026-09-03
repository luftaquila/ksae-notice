import { Agent } from 'undici';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { posts, crawlLogs } from '../db/schema';
import { BOARDS, type BoardType } from '../constants';
import { parseBoardPage, type ParsedPost } from './parser';
import { notifyNewPosts } from '../email/sender';

type UpsertResult =
  | { type: 'new'; id: number }
  | { type: 'updated'; id: number; previousTitle: string }
  | false;

// KSAE server uses weak DH parameters rejected by OpenSSL 3.x default SECLEVEL
const tlsAgent = new Agent({ connect: { ciphers: 'DEFAULT:@SECLEVEL=0' } });

function startCrawlLog(db: ReturnType<typeof getDb>, boardType: string) {
  return db.insert(crawlLogs).values({
    boardType,
    startedAt: new Date().toISOString(),
    status: 'running',
  }).run().lastInsertRowid;
}

function finishCrawlLog(db: ReturnType<typeof getDb>, logId: bigint | number, status: 'completed' | 'failed', newPostsCount = 0) {
  db.update(crawlLogs)
    .set({ finishedAt: new Date().toISOString(), newPostsCount, status })
    .where(eq(crawlLogs.id, Number(logId)))
    .run();
}

async function fetchPage(boardCode: string, page: number): Promise<string> {
  const url = `https://www.ksae.org/jajak/bbs/index.php?page=${page}&code=${boardCode}`;
  // dispatcher 는 undici 전용 옵션이다. Node 의 fetch 는 받지만 표준 RequestInit 타입에는 없다.
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KSAE-Notice-Bot/1.0)' },
    dispatcher: tlsAgent,
  } as RequestInit);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

function upsertPost(db: ReturnType<typeof getDb>, post: ParsedPost, boardType: BoardType): UpsertResult {
  try {
    // Check if post already exists
    const existing = db
      .select({ id: posts.id, title: posts.title })
      .from(posts)
      .where(and(eq(posts.boardType, boardType), eq(posts.postNumber, post.postNumber)))
      .get();

    if (existing) {
      const titleChanged = existing.title !== post.title;
      // Update isPinned/title/category if changed
      db.update(posts)
        .set({
          isPinned: post.isPinned ? 1 : 0,
          title: post.title,
          category: post.category,
        })
        .where(eq(posts.id, existing.id))
        .run();
      return titleChanged
        ? { type: 'updated', id: existing.id, previousTitle: existing.title }
        : false;
    }

    const result = db.insert(posts)
      .values({
        boardType,
        postNumber: post.postNumber,
        title: post.title,
        category: post.category,
        date: post.date,
        isPinned: post.isPinned ? 1 : 0,
        url: post.url,
      })
      .run();

    return { type: 'new', id: Number(result.lastInsertRowid) };
  } catch (error) {
    console.error(`[Crawler] upsertPost failed for ${boardType}/${post.postNumber}:`, error);
    return false;
  }
}

export function cleanupStaleCrawlLogs(): void {
  const db = getDb();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  db.update(crawlLogs)
    .set({ status: 'failed', finishedAt: new Date().toISOString() })
    .where(and(eq(crawlLogs.status, 'running'), sql`${crawlLogs.startedAt} < ${tenMinutesAgo}`))
    .run();
}

function boardHasPosts(db: ReturnType<typeof getDb>, boardType: BoardType): boolean {
  return !!db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.boardType, boardType))
    .limit(1)
    .get();
}

// 저장된 글이 하나도 없는 게시판. 처음 켜는 DB 는 전부, 게시판을 새로 붙인 배포는
// 그 게시판만 여기에 잡힌다. 이 게시판들은 crawlLatest 보다 crawlAll 이 먼저 돌아야
// 한다 — 아니면 첫 페이지가 통째로 새 글로 잡혀 구독자에게 옛 글이 쏟아진다.
export function boardsNeedingInitialCrawl(): BoardType[] {
  const db = getDb();
  return BOARDS.map((b) => b.type).filter((type) => !boardHasPosts(db, type));
}

export async function crawlAll(boardTypes: readonly BoardType[] = BOARDS.map((b) => b.type)): Promise<void> {
  const db = getDb();
  console.log(`[Crawler] Starting full crawl (${boardTypes.join(', ')})...`);

  for (const board of BOARDS) {
    if (!boardTypes.includes(board.type)) continue;
    const logId = startCrawlLog(db, board.type);

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
          const result = upsertPost(db, post, board.type);
          if (result && result.type === 'new') newCount++;
        }

        page++;
        if (page > 50) {
          console.warn(`[Crawler] Page cap reached for ${board.type}, stopping at page 50`);
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      finishCrawlLog(db, logId, 'completed', newCount);
      console.log(`[Crawler] Full crawl for ${board.type}: ${newCount} posts inserted (${page - 1} pages)`);
    } catch (error) {
      finishCrawlLog(db, logId, 'failed');
      console.error(`[Crawler] Full crawl failed for ${board.type}:`, error);
    }
  }
}

export async function crawlLatest(): Promise<ParsedPost[]> {
  const db = getDb();
  const allNewPosts: (ParsedPost & { id: number; boardType: BoardType; previousTitle?: string })[] = [];

  for (const board of BOARDS) {
    const logId = startCrawlLog(db, board.type);

    try {
      // 전체 수집이 실패한 채 여기 왔다면 첫 페이지 전부가 '새 글'이다. 저장은 하되
      // 알림은 내지 않는다 — 실제로 새로 올라온 글이 아니다.
      const seeding = !boardHasPosts(db, board.type);
      if (seeding) {
        console.warn(`[Crawler] No stored posts for ${board.type}; seeding from page 1 without notifications`);
      }

      const html = await fetchPage(board.code, 1);
      const pagePosts = parseBoardPage(html, board.type);
      let newCount = 0;

      for (const post of pagePosts) {
        const result = upsertPost(db, post, board.type);
        if (result) {
          if (result.type === 'new') newCount++;
          if (seeding) continue;
          allNewPosts.push({
            ...post,
            id: result.id,
            boardType: board.type,
            ...(result.type === 'updated' && { previousTitle: result.previousTitle }),
          });
        }
      }

      finishCrawlLog(db, logId, 'completed', newCount);
      if (newCount > 0) {
        console.log(`[Crawler] Incremental crawl for ${board.type}: ${newCount} new posts`);
      }
    } catch (error) {
      finishCrawlLog(db, logId, 'failed');
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

