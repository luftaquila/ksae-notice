import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { crawlLogs } from '@/lib/db/schema';
import {
  getMaxSubscribers,
  getSeatCount,
  isRegistrationOpen,
} from '@/lib/subscription/capacity';

export async function GET() {
  const db = getDb();

  const lastCrawl = db
    .select()
    .from(crawlLogs)
    .where(eq(crawlLogs.status, 'completed'))
    .orderBy(desc(crawlLogs.finishedAt))
    .limit(1)
    .get();

  return NextResponse.json({
    // 구독자 수 = 결제된 좌석 수. 메인이 `n / max` 로 보여준다.
    activeSubscribers: getSeatCount(),
    maxSubscribers: getMaxSubscribers(),
    registrationOpen: isRegistrationOpen(),
    lastCrawl: lastCrawl
      ? { finishedAt: lastCrawl.finishedAt, boardType: lastCrawl.boardType, newPostsCount: lastCrawl.newPostsCount }
      : null,
  });
}
