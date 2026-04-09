import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, subscriptions, emailLogs } from '@/lib/db/schema';

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const userId = session.user.id;

  db.delete(emailLogs).where(eq(emailLogs.userId, userId)).run();
  db.delete(subscriptions).where(eq(subscriptions.userId, userId)).run();
  db.delete(users).where(eq(users.id, userId)).run();

  return NextResponse.json({ ok: true });
}
