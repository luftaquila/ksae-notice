import { NextRequest, NextResponse } from 'next/server';
import { eq, sql, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, subscriptions, emailLogs } from '@/lib/db/schema';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';
import { upsertSubscription } from '@/lib/subscription/upsert';

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();

  const allUsers = db.select().from(users).all();
  const allSubs = db.select().from(subscriptions).all();
  const emailCounts = db
    .select({ userId: emailLogs.userId, count: sql<number>`count(*)` })
    .from(emailLogs)
    .where(eq(emailLogs.status, 'sent'))
    .groupBy(emailLogs.userId)
    .all();

  const subsByUser = new Map<number, { category: string; isActive: number; expiresAt: string }[]>();
  for (const sub of allSubs) {
    if (!subsByUser.has(sub.userId)) subsByUser.set(sub.userId, []);
    subsByUser.get(sub.userId)!.push({ category: sub.category, isActive: sub.isActive, expiresAt: sub.expiresAt });
  }

  const emailCountMap = new Map(emailCounts.map((e) => [e.userId, e.count]));

  const result = allUsers.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt,
    subscriptions: subsByUser.get(user.id) || [],
    emailsSent: emailCountMap.get(user.id) || 0,
  }));

  result.sort((a, b) => {
    if (a.deletedAt && !b.deletedAt) return 1;
    if (!a.deletedAt && b.deletedAt) return -1;
    return 0;
  });

  return NextResponse.json({ users: result });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { userId, action, category } = body;

  if (!userId || !action) {
    return NextResponse.json({ error: 'Missing userId or action' }, { status: 400 });
  }

  const db = getDb();

  if (action === 'deactivate') {
    db.update(subscriptions)
      .set({ isActive: 0 })
      .where(eq(subscriptions.userId, userId))
      .run();
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete') {
    db.update(subscriptions).set({ isActive: 0 }).where(eq(subscriptions.userId, userId)).run();
    db.update(users).set({ deletedAt: new Date().toISOString() }).where(eq(users.id, userId)).run();
    return NextResponse.json({ ok: true });
  }

  if (action === 'subscribe' && category) {
    if (!SUBSCRIPTION_CATEGORIES.some((c) => c.id === category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    upsertSubscription(userId, category);
    return NextResponse.json({ ok: true });
  }

  if (action === 'unsubscribe' && category) {
    db.update(subscriptions)
      .set({ isActive: 0 })
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, category)))
      .run();
    return NextResponse.json({ ok: true });
  }

  if (action === 'subscribe_all') {
    for (const cat of SUBSCRIPTION_CATEGORIES) {
      upsertSubscription(userId, cat.id);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
