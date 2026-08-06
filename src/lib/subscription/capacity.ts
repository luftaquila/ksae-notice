import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { subscriptions, settings } from '../db/schema';

export const DEFAULT_MAX_SUBSCRIBERS = 50;

// The drizzle instance and its transaction objects share this surface, so every
// helper below can run either standalone or inside a transaction.
type DbClient = Pick<ReturnType<typeof getDb>, 'select'>;

export function getSetting(key: string, db: DbClient = getDb()): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value || null;
}

export function isRegistrationOpen(db: DbClient = getDb()): boolean {
  return getSetting('registrationOpen', db) !== 'false';
}

export function getMaxSubscribers(db: DbClient = getDb()): number {
  return parseInt(getSetting('maxSubscribers', db) || String(DEFAULT_MAX_SUBSCRIBERS), 10);
}

// Distinct users holding at least one active subscription — the number shown as `n / max`.
export function getActiveSubscriberCount(db: DbClient = getDb()): number {
  const result = db
    .select({ count: sql<number>`count(DISTINCT user_id)` })
    .from(subscriptions)
    .where(eq(subscriptions.isActive, 1))
    .get();
  return result?.count || 0;
}

// Whether a user with no active subscription may become an active subscriber right now.
export function canAcceptNewSubscriber(db: DbClient = getDb()): boolean {
  return isRegistrationOpen(db) && getActiveSubscriberCount(db) < getMaxSubscribers(db);
}
