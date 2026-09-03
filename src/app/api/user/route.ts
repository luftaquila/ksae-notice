import { NextResponse } from 'next/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, subscriptions, payments } from '@/lib/db/schema';
import { ACCOUNT_DELETE_CONFIRMATION } from '@/lib/constants';

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 확인 문구는 서버가 본다. 화면의 비활성 버튼만 믿으면 다른 경로로 지나간다.
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
    return NextResponse.json({ error: '확인 문구를 정확히 입력해 주세요.' }, { status: 400 });
  }

  const db = getDb();
  const userId = session.user.id;

  // 결제창이 떠 있는 동안은 탈퇴를 막는다 — 승인이 도착했을 때 받을 사람이 없어진다.
  // 방치된 pending 이 영원히 막지 않도록 15분 안의 것만 본다. 컷오프를 SQLite 안에서
  // 만드는 이유는 lib/payment/orders.ts 의 expireStaleOrders 와 같다.
  const openOrder = db
    .select({ id: payments.id })
    .from(payments)
    .where(and(
      eq(payments.userId, userId),
      eq(payments.status, 'pending'),
      gte(payments.createdAt, sql`datetime('now', '-15 minutes')`),
    ))
    .get();
  if (openOrder) {
    return NextResponse.json(
      { error: '진행 중인 결제가 끝난 뒤 다시 탈퇴해 주세요.' },
      { status: 409 },
    );
  }

  // 탈퇴는 남은 구독 기간을 포기하는 것이다 — /policy 와 확인 문구가 그렇게 말한다.
  // 기간을 남겨두면 재로그인만으로 결제 없이 되살아난다.
  db.transaction((tx) => {
    tx.update(subscriptions).set({ isActive: 0 }).where(eq(subscriptions.userId, userId)).run();
    tx.update(users)
      .set({ deletedAt: new Date().toISOString(), subscriptionExpiresAt: null })
      .where(eq(users.id, userId))
      .run();
  }, { behavior: 'immediate' });

  return NextResponse.json({ ok: true });
}
