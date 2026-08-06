import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, subscriptions } from '@/lib/db/schema';
import {
  getActiveSubscriberCount,
  getMaxSubscribers,
  isCountedSubscriber,
  isRegistrationOpen,
} from '@/lib/subscription/capacity';
import { endOfYear, renewalTargetYear } from '@/lib/subscription/period';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Renewing an already lapsed subscription reclaims a slot someone else may
  // have taken in the meantime, so it goes through the same gate as a new
  // subscription — including the same two reasons, kept apart.
  if (!isCountedSubscriber(session.user.id)) {
    if (!isRegistrationOpen()) {
      return NextResponse.json({ error: '현재 신규 구독이 중단되었습니다.' }, { status: 403 });
    }
    if (getActiveSubscriberCount() >= getMaxSubscribers()) {
      return NextResponse.json({ error: '최대 구독자 수에 도달했습니다.' }, { status: 403 });
    }
  }

  const db = getDb();

  // The period is account-level now, but there is still nothing to renew for an
  // account that holds no active category.
  const hasActiveCategory = db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.userId, session.user.id),
      eq(subscriptions.isActive, 1),
    ))
    .get();

  if (hasActiveCategory) {
    const account = db
      .select({ expiresAt: users.subscriptionExpiresAt })
      .from(users)
      .where(eq(users.id, session.user.id))
      .get();

    // Same rule the dashboard labels the button with — see lib/subscription/period.
    const now = new Date();
    const renewedTo = endOfYear(renewalTargetYear(now, account?.expiresAt ?? null));

    db.update(users)
      .set({ subscriptionExpiresAt: renewedTo, subscriptionRenewedAt: now.toISOString() })
      .where(eq(users.id, session.user.id))
      .run();
  }

  return NextResponse.json({ ok: true });
}
