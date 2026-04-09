import { NextRequest, NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { subscriptions, settings } from '@/lib/db/schema';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';
import { upsertSubscription } from '@/lib/subscription/upsert';

function getActiveSubscriberCount(): number {
  const db = getDb();
  const result = db
    .select({ count: sql<number>`count(DISTINCT user_id)` })
    .from(subscriptions)
    .where(eq(subscriptions.isActive, 1))
    .get();
  return result?.count || 0;
}

function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value || null;
}

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
  const registrationOpen = getSetting('registrationOpen');
  if (registrationOpen === 'false') {
    return NextResponse.json({ error: '현재 신규 구독이 중단되었습니다.' }, { status: 403 });
  }

  // Check max subscriber limit
  const maxSubscribers = parseInt(getSetting('maxSubscribers') || '50', 10);
  const currentCount = getActiveSubscriberCount();

  // Check if user already has any active subscription (if so, they're not a "new" subscriber)
  const db = getDb();
  const existingSubs = db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, session.user.id), eq(subscriptions.isActive, 1)))
    .all();

  if (existingSubs.length === 0 && currentCount >= maxSubscribers) {
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
