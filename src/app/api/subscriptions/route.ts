import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';
import { upsertSubscription } from '@/lib/subscription/upsert';
import {
  getActiveSubscriberCount,
  getMaxSubscribers,
  isCountedSubscriber,
  isRegistrationOpen,
} from '@/lib/subscription/capacity';

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

  return NextResponse.json({ subscriptions: subs });
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

  // Check if registration is open
  if (!isRegistrationOpen()) {
    return NextResponse.json({ error: '현재 신규 구독이 중단되었습니다.' }, { status: 403 });
  }

  // Check max subscriber limit
  const maxSubscribers = getMaxSubscribers();
  const currentCount = getActiveSubscriberCount();

  // A user who already occupies a slot is not a "new" subscriber
  if (!isCountedSubscriber(session.user.id) && currentCount >= maxSubscribers) {
    return NextResponse.json({ error: '최대 구독자 수에 도달했습니다.' }, { status: 403 });
  }

  // Upsert subscription
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
