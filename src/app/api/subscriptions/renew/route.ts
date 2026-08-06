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

    // A period always ends on 12/31 and renewal buys exactly one calendar year:
    // the current one when it is not covered yet, otherwise the next. Handing a
    // lapsed account year + 1 would give it two years in one click.
    const now = new Date().toISOString();
    const covered = !!account?.expiresAt && account.expiresAt >= now;
    const renewedTo = `${new Date().getFullYear() + (covered ? 1 : 0)}-12-31T23:59:59.000Z`;

    db.update(users)
      .set({ subscriptionExpiresAt: renewedTo, subscriptionRenewedAt: now })
      .where(eq(users.id, session.user.id))
      .run();
  }

  return NextResponse.json({ ok: true });
}
