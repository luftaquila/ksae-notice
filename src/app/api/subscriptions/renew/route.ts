import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const nextYearEnd = `${new Date().getFullYear() + 1}-12-31T23:59:59.000Z`;

  db.update(subscriptions)
    .set({ expiresAt: nextYearEnd, renewedAt: new Date().toISOString() })
    .where(and(
      eq(subscriptions.userId, session.user.id),
      eq(subscriptions.isActive, 1),
    ))
    .run();

  return NextResponse.json({ ok: true });
}
