import { and, eq, gte, sql } from 'drizzle-orm';
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
  // A non-numeric setting would otherwise yield NaN, which compares false
  // against every count and would silently block all sign-ups.
  const parsed = parseInt(getSetting('maxSubscribers', db) || '', 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_MAX_SUBSCRIBERS;
}

// Distinct users who would actually receive mail — the number shown as `n / max`.
// Same predicate as the recipient query in lib/email/sender.ts, so a lapsed
// subscription stops holding a slot the moment it stops delivering anything.
export function getActiveSubscriberCount(db: DbClient = getDb()): number {
  const result = db
    .select({ count: sql<number>`count(DISTINCT user_id)` })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.isActive, 1),
      gte(subscriptions.expiresAt, new Date().toISOString()),
    ))
    .get();
  return result?.count || 0;
}

// Whether this user already occupies a slot, i.e. is part of the count above.
export function isCountedSubscriber(userId: number, db: DbClient = getDb()): boolean {
  const row = db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.isActive, 1),
      gte(subscriptions.expiresAt, new Date().toISOString()),
    ))
    .get();
  return row !== undefined;
}

// Whether a user with no active subscription may become an active subscriber right now.
export function canAcceptNewSubscriber(db: DbClient = getDb()): boolean {
  return isRegistrationOpen(db) && getActiveSubscriberCount(db) < getMaxSubscribers(db);
}
