import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, subscriptions } from '@/lib/db/schema';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';
import { getSubscriptionPrice, isFreeSubscription } from '@/lib/payment/pricing';
import { isConfigured } from '@/lib/payment/nicepay';
import { upsertSubscription } from '@/lib/subscription/upsert';

// GET: get current user's subscriptions
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const subs = db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.user.id))
    .all();

  // The expiry is one value for the account, not one per category.
  const account = db
    .select({ expiresAt: users.subscriptionExpiresAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .get();

  return NextResponse.json({
    subscriptions: subs,
    expiresAt: account?.expiresAt ?? null,
    price: getSubscriptionPrice(),
    free: isFreeSubscription(),
    // 구독 신청 버튼을 띄울 수 있는지. 무료 구독은 게이트웨이 설정을 타지 않는다.
    paymentEnabled: isFreeSubscription() || isConfigured(),
  });
}

// POST: subscribe to a category
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { category } = body;

  if (!SUBSCRIPTION_CATEGORIES.some((c) => c.id === category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  // No capacity gate here: a category costs nothing on its own. Slots are held
  // by paid periods, so the limit and the registration switch are enforced
  // where a period is bought — POST /api/payments/orders.
  upsertSubscription(session.user.id, category);

  return NextResponse.json({ ok: true });
}

// DELETE: unsubscribe from a category
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { category } = body;

  const db = getDb();
  db.update(subscriptions)
    .set({ isActive: 0 })
    .where(and(
      eq(subscriptions.userId, session.user.id),
      eq(subscriptions.category, category),
    ))
    .run();

  return NextResponse.json({ ok: true });
}
