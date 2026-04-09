import { NextRequest, NextResponse } from 'next/server';
import { eq, sql, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, subscriptions, emailLogs } from '@/lib/db/schema';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';

function getEndOfYear(): string {
  return `${new Date().getFullYear()}-12-31T23:59:59.000Z`;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.isAdmin) return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();

  const allUsers = db.select().from(users).all();

  const result = allUsers.map((user) => {
    const subs = db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .all();

    const emailCount = db
      .select({ count: sql<number>`count(*)` })
      .from(emailLogs)
      .where(and(eq(emailLogs.userId, user.id), eq(emailLogs.status, 'sent')))
      .get();

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      subscriptions: subs.map((s) => ({
        category: s.category,
        isActive: s.isActive,
        expiresAt: s.expiresAt,
      })),
      emailsSent: emailCount?.count || 0,
    };
  });

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
    const existing = db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, category)))
      .get();

    if (existing) {
      db.update(subscriptions)
        .set({ isActive: 1, expiresAt: getEndOfYear(), renewedAt: new Date().toISOString() })
        .where(eq(subscriptions.id, existing.id))
        .run();
    } else {
      db.insert(subscriptions).values({
        userId,
        category,
        isActive: 1,
        expiresAt: getEndOfYear(),
      }).run();
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'unsubscribe' && category) {
    db.update(subscriptions)
      .set({ isActive: 0 })
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, category)))
      .run();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
