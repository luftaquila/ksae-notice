import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import {
  getActiveSubscriberCount,
  getMaxSubscribers,
  isCountedSubscriber,
  isRegistrationOpen,
} from '@/lib/subscription/capacity';
import { renewalTargetYear } from '@/lib/subscription/period';
import { createOrder } from '@/lib/payment/orders';
import { getSubscriptionPrice } from '@/lib/payment/pricing';
import { PAY_METHOD, clientId, isConfigured } from '@/lib/payment/nicepay';
import { siteOrigin } from '@/lib/payment/origin';

// 결제창을 열기 전에 서버가 금액과 대상 연도를 확정한다. 클라이언트가 보내는
// 값은 없다 — 금액이 브라우저를 거치지 않으면 위변조할 표면도 없다.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ error: '결제가 준비되지 않았습니다.' }, { status: 503 });
  }

  // 슬롯을 차지하는 것은 결제된 기간이다. 이미 슬롯을 가진 사람은 신규가 아니다.
  if (!isCountedSubscriber(session.user.id)) {
    if (!isRegistrationOpen()) {
      return NextResponse.json({ error: '현재 신규 구독이 중단되었습니다.' }, { status: 403 });
    }
    if (getActiveSubscriberCount() >= getMaxSubscribers()) {
      return NextResponse.json({ error: '최대 구독자 수에 도달했습니다.' }, { status: 403 });
    }
  }

  const db = getDb();
  const account = db
    .select({ expiresAt: users.subscriptionExpiresAt, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, session.user.id))
    .get();

  if (!account) {
    return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
  }

  const targetYear = renewalTargetYear(new Date(), account.expiresAt ?? null);
  const amount = getSubscriptionPrice();
  const goodsName = `KSAE 공지봇 ${targetYear}년 구독`;

  const order = createOrder({
    userId: session.user.id,
    email: account.email,
    targetYear,
    amount,
    goodsName,
  });

  // returnUrl 은 브라우저가 따라가는 절대 주소여야 한다.
  const origin = siteOrigin(request);

  return NextResponse.json({
    orderId: order.orderId,
    amount: order.amount,
    goodsName: order.goodsName,
    targetYear,
    clientId: clientId(),
    method: PAY_METHOD,
    returnUrl: `${origin}/api/payments/return`,
    buyerName: account.name,
    buyerEmail: account.email,
  });
}
