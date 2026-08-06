import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { crawlLogs } from '@/lib/db/schema';
import {
  getActiveSubscriberCount,
  getMaxSubscribers,
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
    activeSubscribers: getActiveSubscriberCount(),
    maxSubscribers: getMaxSubscribers(),
    registrationOpen: isRegistrationOpen(),
    lastCrawl: lastCrawl
      ? { finishedAt: lastCrawl.finishedAt, boardType: lastCrawl.boardType, newPostsCount: lastCrawl.newPostsCount }
      : null,
  });
}
