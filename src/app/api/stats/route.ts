import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { crawlLogs } from '@/lib/db/schema';
import { refreshAfterMs } from '@/lib/crawler/schedule';
import {
  getMaxSubscribers,
  getSeatCount,
  isRegistrationOpen,
} from '@/lib/subscription/capacity';

export async function GET() {
  const db = getDb();
  const now = new Date();

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
    // ageMs 는 서버 시계 기준이다. 클라이언트는 받은 뒤 흐른 시간만 더해 "N분 전" 을 그린다 —
    // 자기 시계로 finishedAt 을 빼면 시계가 틀린 브라우저에서 음수나 엉뚱한 값이 나온다.
    lastCrawl: lastCrawl
      ? {
          finishedAt: lastCrawl.finishedAt,
          ageMs: Math.max(0, now.getTime() - new Date(lastCrawl.finishedAt!).getTime()),
          boardType: lastCrawl.boardType,
          newPostsCount: lastCrawl.newPostsCount,
        }
      : null,
    // 몇 ms 뒤에 다시 읽을지도 서버가 정한다. 예정된 크롤이 아직 안 끝났으면 잠깐 뒤,
    // 끝났으면 다음 경계 직후. 밤에는 다음 날 07:00 까지라 요청이 없다.
    refreshAfterMs: refreshAfterMs(now, lastCrawl?.finishedAt ?? null),
  });
}
