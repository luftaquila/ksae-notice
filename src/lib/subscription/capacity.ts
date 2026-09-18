import { and, eq, gte, isNotNull, isNull, notExists, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { alertPreferences, settings, users } from '../db/schema';

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

// 실제 수신인 = 좌석 중 알림을 하나라도 켜 두고 일시중지하지 않은 사람 — 지금 새 글이
// 뜨면 메일이 나가는 사람 수. 정원은 이 수가 아니라 좌석을 세고, 관리자 화면이 둘을
// 나란히 보여준다. 조건은 lib/email/sender.ts 의 수신자 조회와 같아야 한다.
export function getRecipientCount(db: DbClient = getDb()): number {
  const result = db
    .select({ count: sql<number>`count(DISTINCT ${alertPreferences.userId})` })
    .from(alertPreferences)
    .innerJoin(users, eq(alertPreferences.userId, users.id))
    .where(and(
      eq(alertPreferences.isActive, 1),
      gte(users.subscriptionExpiresAt, new Date().toISOString()),
      isNull(users.deletedAt),
      isNull(users.alertsPausedAt),
    ))
    .get();
  return result?.count || 0;
}

// 좌석을 셋으로 쪼갠 것: 수신인 + 알림 모두 꺼짐 + 일시중지 = 좌석. 관리자 카드가 "구독자
// 141 인데 수신인은 왜 138 인가" 에 답할 수 있어야 한다 — 차이는 이 두 수다.
export function getSeatBreakdown(db: DbClient = getDb()): { seats: number; recipients: number; alertsOff: number; paused: number } {
  const now = new Date().toISOString();
  const seated = and(gte(users.subscriptionExpiresAt, now), isNull(users.deletedAt));
  const count = (where: ReturnType<typeof and>) =>
    db.select({ count: sql<number>`count(*)` }).from(users).where(where).get()?.count || 0;

  const seats = count(seated);
  const paused = count(and(seated, isNotNull(users.alertsPausedAt)));
  const alertsOff = count(and(
    seated,
    isNull(users.alertsPausedAt),
    notExists(
      db.select({ id: alertPreferences.id })
        .from(alertPreferences)
        .where(and(eq(alertPreferences.userId, users.id), eq(alertPreferences.isActive, 1))),
    ),
  ));
  return { seats, recipients: seats - paused - alertsOff, alertsOff, paused };
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
