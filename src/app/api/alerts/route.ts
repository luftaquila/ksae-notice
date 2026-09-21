import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, alertPreferences } from '@/lib/db/schema';
import { ALERT_CATEGORIES } from '@/lib/constants';
import { getSubscriptionPrice, isFreeSubscription } from '@/lib/payment/pricing';
import { isConfigured } from '@/lib/payment/nicepay';
import { disableAlert, enableAlert } from '@/lib/alerts/preferences';

// 알림 설정 API. 구독(결제된 기간)과는 다른 축이라 여기서는 기간을 읽기만 하고
// 쓰지 않는다. 정원·접수 여부도 보지 않는다 — 카테고리는 무료고, 좌석은 결제된
// 기간이 차지한다. 그 검사는 좌석을 사는 곳(POST /api/payments/orders)에 있다.

function isAlertCategory(category: unknown): category is string {
  return typeof category === 'string' && ALERT_CATEGORIES.some((c) => c.id === category);
}

// GET: 내 알림 설정과, 대시보드가 같은 화면에 그리는 구독 정보.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const alerts = db
    .select()
    .from(alertPreferences)
    .where(eq(alertPreferences.userId, session.user.id))
    .all();

  // 기간과 일시중지는 계정에 하나씩이다.
  const account = db
    .select({ expiresAt: users.subscriptionExpiresAt, pausedAt: users.alertsPausedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .get();

  const free = isFreeSubscription();
  return NextResponse.json({
    alerts,
    paused: !!account?.pausedAt,
    expiresAt: account?.expiresAt ?? null,
    price: getSubscriptionPrice(),
    free,
    // 구독 시작 버튼을 띄울 수 있는지. 무료 구독은 게이트웨이 설정을 타지 않는다.
    paymentEnabled: free || isConfigured(),
  });
}

// POST: 카테고리 하나 켬
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { category } = await request.json();
  if (!isAlertCategory(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  enableAlert(session.user.id, category);
  return NextResponse.json({ ok: true });
}

// DELETE: 카테고리 하나 끔
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { category } = await request.json();
  if (!isAlertCategory(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  disableAlert(session.user.id, category);
  return NextResponse.json({ ok: true });
}
