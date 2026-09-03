// 심사용 계정.
//
// 나이스페이와 카드사 심사는 "ID/PW, 2차 인증 없음, SNS 로그인 불가" 계정을 요구한다.
// Google 로그인만 있는 서비스라 이 경로만 예외로 둔다. 자격증명이 환경변수에 없으면
// 페이지도 API 도 404 — 평시에는 존재하지 않는 경로다.

import { createHash, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { users, subscriptions } from './db/schema';
import { PRIVACY_CONSENT_VERSION, SUBSCRIPTION_CATEGORIES } from './constants';

// users.google_id 자리에 들어가는 고정값. 실제 Google sub 는 숫자열이라 겹치지 않는다.
export const REVIEW_GOOGLE_ID = 'review-account';
// RFC 2606 예약 도메인 — 어디로도 배달되지 않는다. ADMIN_EMAIL 과 다르므로 관리자가 될 수 없다.
export const REVIEW_EMAIL = 'review@nicepay.example';

export function reviewLoginEnabled(): boolean {
  return Boolean(process.env.REVIEW_LOGIN_ID && process.env.REVIEW_LOGIN_PASSWORD);
}

// 길이가 다르면 timingSafeEqual 이 던지므로 해시를 비교한다.
function same(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function verifyReviewCredentials(loginId: string, password: string): boolean {
  if (!reviewLoginEnabled()) return false;
  // 두 비교를 모두 수행해 아이디만 맞았을 때와 둘 다 틀렸을 때의 시간차를 없앤다.
  const idOk = same(loginId, process.env.REVIEW_LOGIN_ID!);
  const pwOk = same(password, process.env.REVIEW_LOGIN_PASSWORD!);
  return idOk && pwOk;
}

// 심사자들이 함께 쓰는 계정 하나. 없으면 만들고, 탈퇴돼 있으면 되살린다.
// 동의 화면을 거치지 않는 유일한 계정이라 동의는 기록된 것으로 친다.
export function getOrCreateReviewUser() {
  const db = getDb();
  const existing = db.select().from(users).where(eq(users.googleId, REVIEW_GOOGLE_ID)).get();

  if (existing) {
    if (existing.deletedAt) {
      // signIn 콜백의 되살리기와 같은 규칙 — 탈퇴는 기간을 포기하는 것이다.
      db.transaction((tx) => {
        tx.update(users)
          .set({ deletedAt: null, subscriptionExpiresAt: null })
          .where(eq(users.id, existing.id))
          .run();
        tx.update(subscriptions)
          .set({ isActive: 1 })
          .where(eq(subscriptions.userId, existing.id))
          .run();
      }, { behavior: 'immediate' });
    }
    return db.select().from(users).where(eq(users.id, existing.id)).get()!;
  }

  return db.transaction((tx) => {
    const result = tx.insert(users).values({
      googleId: REVIEW_GOOGLE_ID,
      email: REVIEW_EMAIL,
      name: '심사 계정',
      avatar: null,
      subscriptionExpiresAt: null,
      privacyConsentAt: new Date().toISOString(),
      privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    }).run();

    const userId = Number(result.lastInsertRowid);
    for (const cat of SUBSCRIPTION_CATEGORIES) {
      tx.insert(subscriptions).values({ userId, category: cat.id, isActive: 1 }).run();
    }
    return tx.select().from(users).where(eq(users.id, userId)).get()!;
  }, { behavior: 'immediate' });
}

// 시도 제한은 프로세스 안에 둔다. 이 경로에 붙는 계정이 하나뿐이라 계정별 카운터가
// 필요 없다. 5분에 10회.
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const ATTEMPT_LIMIT = 10;
const attempts: number[] = [];

export function reviewAttemptAllowed(now = Date.now()): boolean {
  while (attempts.length && now - attempts[0] >= ATTEMPT_WINDOW_MS) attempts.shift();
  if (attempts.length >= ATTEMPT_LIMIT) return false;
  attempts.push(now);
  return true;
}

// 테스트용. 프로세스 안의 시도 기록을 비운다.
export function resetReviewAttempts(): void {
  attempts.length = 0;
}
