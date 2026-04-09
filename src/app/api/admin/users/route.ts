import { NextRequest, NextResponse } from 'next/server';
import { eq, sql, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, subscriptions, emailLogs } from '@/lib/db/schema';

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

  // Get all users with subscription and email stats
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
      subscriptions: subs.map((s) => ({
        category: s.category,
        isActive: s.isActive,
        expiresAt: s.expiresAt,
      })),
      emailsSent: emailCount?.count || 0,
    };
  });

  return NextResponse.json({ users: result });
}

// PATCH: admin actions on a specific user
export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { userId, action } = body;

  if (!userId || !action) {
    return NextResponse.json({ error: 'Missing userId or action' }, { status: 400 });
  }

  const db = getDb();

  if (action === 'deactivate') {
    // Deactivate all subscriptions for this user
    db.update(subscriptions)
      .set({ isActive: 0 })
      .where(eq(subscriptions.userId, userId))
      .run();
    return NextResponse.json({ ok: true });
  }

  if (action === 'activate') {
    // Re-activate all subscriptions for this user
    db.update(subscriptions)
      .set({ isActive: 1 })
      .where(eq(subscriptions.userId, userId))
      .run();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
