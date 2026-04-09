import { NextResponse } from 'next/server';
import { eq, sql, desc, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, crawlLogs, settings, emailLogs } from '@/lib/db/schema';

export async function GET() {
  const db = getDb();

  const activeSubscribers = db
    .select({ count: sql<number>`count(DISTINCT user_id)` })
    .from(subscriptions)
    .where(eq(subscriptions.isActive, 1))
    .get();

  const maxSubscribersRow = db
    .select()
    .from(settings)
    .where(eq(settings.key, 'maxSubscribers'))
    .get();

  const registrationOpenRow = db
    .select()
    .from(settings)
    .where(eq(settings.key, 'registrationOpen'))
    .get();

  const lastCrawl = db
    .select()
    .from(crawlLogs)
    .where(eq(crawlLogs.status, 'completed'))
    .orderBy(desc(crawlLogs.finishedAt))
    .limit(1)
    .get();

  return NextResponse.json({
    activeSubscribers: activeSubscribers?.count || 0,
    maxSubscribers: parseInt(maxSubscribersRow?.value || '50', 10),
    registrationOpen: registrationOpenRow?.value !== 'false',
    lastCrawl: lastCrawl
      ? { finishedAt: lastCrawl.finishedAt, boardType: lastCrawl.boardType, newPostsCount: lastCrawl.newPostsCount }
      : null,
  });
}
