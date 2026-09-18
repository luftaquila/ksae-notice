import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { alertPreferences, users } from '../db/schema';
import { ALERT_CATEGORIES } from '../constants';

// 알림 설정: 어느 게시판의 글을 받을지, 그리고 잠시 전부 멈출지.
//
// 구독(결제된 기간)과는 다른 축이다 — 여기 있는 어떤 함수도 users.subscription_expires_at
// 을 건드리지 않는다. 카테고리를 켜는 데 돈이 들지 않으므로, 여기서 기간이 생기면 누구나
// 토글 한 번으로 결제를 우회한다. 메일은 좌석(기간 유효) ∩ 켜진 카테고리 ∖ 일시중지 에게
// 간다 (lib/email/sender.ts).

export function enableAlert(userId: number, category: string): void {
  const db = getDb();
  const existing = db
    .select()
    .from(alertPreferences)
    .where(and(eq(alertPreferences.userId, userId), eq(alertPreferences.category, category)))
    .get();

  if (existing) {
    db.update(alertPreferences)
      .set({ isActive: 1 })
      .where(eq(alertPreferences.id, existing.id))
      .run();
  } else {
    db.insert(alertPreferences).values({ userId, category, isActive: 1 }).run();
  }
}

// 행은 남기고 is_active 만 내린다 — 다시 켤 때 enableAlert 가 찾는다.
export function disableAlert(userId: number, category: string): void {
  getDb()
    .update(alertPreferences)
    .set({ isActive: 0 })
    .where(and(eq(alertPreferences.userId, userId), eq(alertPreferences.category, category)))
    .run();
}

// 행이 없는 카테고리(나중에 추가된 게시판)도 채운다.
export function enableAllAlerts(userId: number): void {
  for (const cat of ALERT_CATEGORIES) {
    enableAlert(userId, cat.id);
  }
}

export function disableAllAlerts(userId: number): void {
  getDb()
    .update(alertPreferences)
    .set({ isActive: 0 })
    .where(eq(alertPreferences.userId, userId))
    .run();
}

// 일시중지는 설정을 지우지 않는다. 해제하면 켜 두었던 카테고리 그대로 이어진다.
export function setAlertsPaused(userId: number, paused: boolean): void {
  getDb()
    .update(users)
    .set({ alertsPausedAt: paused ? new Date().toISOString() : null })
    .where(eq(users.id, userId))
    .run();
}
