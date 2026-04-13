import { NextResponse } from 'next/server';
import { eq, sql, and, gte, desc, isNotNull } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, subscriptions, emailLogs, crawlLogs, posts } from '@/lib/db/schema';

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();

  const totalUsers = db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .get();

  const deletedUsers = db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(isNotNull(users.deletedAt))
    .get();

  const activeSubscribers = db
    .select({ count: sql<number>`count(DISTINCT user_id)` })
    .from(subscriptions)
    .where(eq(subscriptions.isActive, 1))
    .get();

  const totalEmailsSent = db
    .select({ count: sql<number>`count(*)` })
    .from(emailLogs)
    .where(eq(emailLogs.status, 'sent'))
    .get();

  const totalEmailsFailed = db
    .select({ count: sql<number>`count(*)` })
    .from(emailLogs)
    .where(eq(emailLogs.status, 'failed'))
    .get();

  const totalEmailsSkipped = db
    .select({ count: sql<number>`count(*)` })
    .from(emailLogs)
    .where(eq(emailLogs.status, 'skipped'))
    .get();

  const today = new Date().toISOString().slice(0, 10);
  const todayEmails = db
    .select({ count: sql<number>`count(*)` })
    .from(emailLogs)
    .where(and(gte(emailLogs.sentAt, today), eq(emailLogs.status, 'sent')))
    .get();

  const todaySkipped = db
    .select({ count: sql<number>`count(*)` })
    .from(emailLogs)
    .where(and(gte(emailLogs.sentAt, today), eq(emailLogs.status, 'skipped')))
    .get();

  const totalPosts = db
    .select({ count: sql<number>`count(*)` })
    .from(posts)
    .get();

  const recentCrawls = db
    .select()
    .from(crawlLogs)
    .orderBy(desc(crawlLogs.startedAt))
    .limit(10)
    .all();

  // Recent failed emails with user email
  const recentFailed = db
    .select({
      id: emailLogs.id,
      userId: emailLogs.userId,
      email: users.email,
      error: emailLogs.error,
      sentAt: emailLogs.sentAt,
    })
    .from(emailLogs)
    .innerJoin(users, eq(emailLogs.userId, users.id))
    .where(eq(emailLogs.status, 'failed'))
    .orderBy(desc(emailLogs.sentAt))
    .limit(20)
    .all();

  return NextResponse.json({
    totalUsers: totalUsers?.count || 0,
    deletedUsers: deletedUsers?.count || 0,
    activeSubscribers: activeSubscribers?.count || 0,
    totalPosts: totalPosts?.count || 0,
    emails: {
      totalSent: totalEmailsSent?.count || 0,
      totalFailed: totalEmailsFailed?.count || 0,
      totalSkipped: totalEmailsSkipped?.count || 0,
      todaySent: todayEmails?.count || 0,
      todaySkipped: todaySkipped?.count || 0,
      recentFailed,
    },
    recentCrawls,
  });
}
