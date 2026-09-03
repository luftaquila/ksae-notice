import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getOrCreateReviewUser,
  reviewAttemptAllowed,
  reviewLoginEnabled,
  verifyReviewCredentials,
} from '@/lib/review';
import { issueSessionCookie } from '@/lib/session';

// 심사용 ID/PW 로그인. 성공하면 Google 로그인과 같은 세션 쿠키를 내려준다.
export async function POST(request: Request) {
  if (!reviewLoginEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  if (!reviewAttemptAllowed()) {
    return NextResponse.json({ error: '잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const loginId = typeof body?.loginId === 'string' ? body.loginId : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!verifyReviewCredentials(loginId, password)) {
    console.warn('[review-login] rejected');
    return NextResponse.json(
      { error: '아이디 또는 비밀번호가 올바르지 않습니다.' },
      { status: 401 },
    );
  }

  const user = getOrCreateReviewUser();
  const session = await issueSessionCookie({
    id: user.id,
    googleId: user.googleId,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
  }, request.headers);
  (await cookies()).set(session.name, session.value, session.options);

  console.log(`[review-login] accepted for user ${user.id}`);
  return NextResponse.json({ ok: true, redirect: '/dashboard' });
}
