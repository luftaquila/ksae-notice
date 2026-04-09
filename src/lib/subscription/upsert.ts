import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { subscriptions } from '../db/schema';
import { getEndOfYear } from '../constants';

export function upsertSubscription(userId: number, category: string): void {
  const db = getDb();
  const existing = db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.category, category)))
    .get();

  const endOfYear = getEndOfYear();
  if (existing) {
    db.update(subscriptions)
      .set({ isActive: 1, expiresAt: endOfYear, renewedAt: new Date().toISOString() })
      .where(eq(subscriptions.id, existing.id))
      .run();
  } else {
    db.insert(subscriptions)
      .values({ userId, category, isActive: 1, expiresAt: endOfYear })
      .run();
  }
}
