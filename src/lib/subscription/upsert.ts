import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { users, subscriptions } from '../db/schema';
import { getEndOfYear } from '../constants';

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

  // The period belongs to the account, not to this one category, so it may only
  // be extended: a user who already renewed into next year must not be pulled
  // back to the end of this one by switching a category on.
  const endOfYear = getEndOfYear();
  const current = db
    .select({ expiresAt: users.subscriptionExpiresAt })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!current?.expiresAt || current.expiresAt < endOfYear) {
    db.update(users)
      .set({ subscriptionExpiresAt: endOfYear, subscriptionRenewedAt: new Date().toISOString() })
      .where(eq(users.id, userId))
      .run();
  }
}
