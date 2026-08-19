import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { subscriptions } from '../db/schema';

// Turning a category on is free and says nothing about the subscription period:
// the period is account-level and only a settled payment extends it. Mail goes
// out to the intersection — an active category on an unexpired account.
export function upsertSubscription(userId: number, category: string): void {
  const db = getDb();
  const existing = db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, category)))
    .get();

  if (existing) {
    db.update(subscriptions)
      .set({ isActive: 1 })
      .where(eq(subscriptions.id, existing.id))
      .run();
  } else {
    db.insert(subscriptions).values({ userId, category, isActive: 1 }).run();
  }
}
