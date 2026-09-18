import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';
import { upsertSubscription } from '@/lib/subscription/upsert';

// 카테고리 전체를 한 번에 켜고 끈다. 대시보드가 카테고리마다 요청을 따로 보내던
// 때는 여덟 번 왕복하는 동안 버튼이 "처리 중" 으로 멈춰 있었고, 중간에 하나가
// 실패하면 반쯤 바뀐 채 끝났다.
//
// POST /api/subscriptions 와 같은 이유로 정원·접수 여부는 보지 않는다 — 카테고리는
// 무료고, 자리는 결제된 기간이 차지한다. 기간도 건드리지 않는다.

// POST: 전체 켬
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  for (const cat of SUBSCRIPTION_CATEGORIES) {
    upsertSubscription(session.user.id, cat.id);
  }

  return NextResponse.json({ ok: true });
}

// DELETE: 전체 끔. 행은 남기고 is_active 만 내린다 — 다시 켤 때 upsert 가 찾는다.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  getDb()
    .update(subscriptions)
    .set({ isActive: 0 })
    .where(eq(subscriptions.userId, session.user.id))
    .run();

  return NextResponse.json({ ok: true });
}
