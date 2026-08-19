import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users, subscriptions } from '@/lib/db/schema';
import { PRIVACY_CONSENT_VERSION, SUBSCRIPTION_CATEGORIES } from '@/lib/constants';
import { PENDING_SIGNUP_COOKIE, unsealPendingSignup } from '@/lib/signup/pending';

// 계정을 실제로 만드는 곳. signIn 콜백은 프로필을 봉인한 쿠키에 담아 동의 화면으로
// 보내기만 하므로, 동의가 여기 도착할 때까지 DB 에는 아무것도 적히지 않는다.
export async function POST() {
  const jar = await cookies();
  const pending = unsealPendingSignup(jar.get(PENDING_SIGNUP_COOKIE)?.value);
  if (!pending) {
    return NextResponse.json(
      { error: '가입 정보가 만료되었습니다. 다시 로그인해 주세요.' },
      { status: 400 },
    );
  }

  const db = getDb();
  const existing = db.select().from(users).where(eq(users.googleId, pending.googleId)).get();

  // 같은 계정으로 두 번 눌렸거나 그사이 다른 경로로 만들어진 경우. 동의만 기록하고
  // 카테고리는 건드리지 않는다.
  if (existing) {
    if (!existing.privacyConsentAt) {
      db.update(users)
        .set({
          privacyConsentAt: new Date().toISOString(),
          privacyConsentVersion: PRIVACY_CONSENT_VERSION,
        })
        .where(eq(users.id, existing.id))
        .run();
    }
    jar.delete(PENDING_SIGNUP_COOKIE);
    return NextResponse.json({ ok: true });
  }

  // 카테고리는 무료라 전부 켜서 시작한다. 구독 기간은 결제만이 준다.
  db.transaction((tx) => {
    const result = tx.insert(users).values({
      googleId: pending.googleId,
      email: pending.email,
      name: pending.name,
      avatar: pending.avatar,
      subscriptionExpiresAt: null,
      privacyConsentAt: new Date().toISOString(),
      privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    }).run();

    const userId = Number(result.lastInsertRowid);
    for (const cat of SUBSCRIPTION_CATEGORIES) {
      tx.insert(subscriptions).values({ userId, category: cat.id, isActive: 1 }).run();
    }
  }, { behavior: 'immediate' });

  jar.delete(PENDING_SIGNUP_COOKIE);
  return NextResponse.json({ ok: true });
}
