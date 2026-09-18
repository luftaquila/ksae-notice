import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { settings, users } from '../db/schema';

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

// 좌석 = 결제된 기간이 남아 있는 미탈퇴 계정. 메인의 `n / max` 가 이 수다.
//
// 알림 설정은 보지 않는다. 예전에는 켜진 카테고리가 하나라도 있어야 자리를 차지했는데,
// 그러면 결제한 사람이 토글을 다 끄는 순간 자리가 비고 남이 들어오고, 다시 켜면 정원
// 초과인 채로 수신했다 — 카테고리 스위치가 정원을 흔들었다. 좌석은 산 사람의 것이고,
// 알림을 잠시 꺼 두는 것은 그 사람 사정이다. 발송량 관점에서도 이 수는 실제 발송의
// 상한이라 안전한 방향으로 어긋난다. 판정은 lib/subscription/status 의
// subscriptionState().holdsSeat 와 같아야 한다.
export function getSeatCount(db: DbClient = getDb()): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(
      gte(users.subscriptionExpiresAt, new Date().toISOString()),
      isNull(users.deletedAt),
    ))
    .get();
  return result?.count || 0;
}

// Whether this user already holds a seat, i.e. is part of the count above.
export function holdsSeat(userId: number, db: DbClient = getDb()): boolean {
  const row = db
    .select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.id, userId),
      gte(users.subscriptionExpiresAt, new Date().toISOString()),
      isNull(users.deletedAt),
    ))
    .get();
  return row !== undefined;
}
