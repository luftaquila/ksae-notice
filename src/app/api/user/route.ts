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

  // 탈퇴는 남은 구독 기간을 포기하는 것이다 — /policy 와 확인 문구가 그렇게 말한다.
  // 기간을 남겨두면 재로그인만으로 결제 없이 되살아난다.
  db.update(subscriptions).set({ isActive: 0 }).where(eq(subscriptions.userId, userId)).run();
  db.update(users)
    .set({ deletedAt: new Date().toISOString(), subscriptionExpiresAt: null })
    .where(eq(users.id, userId))
    .run();

  return NextResponse.json({ ok: true });
}
