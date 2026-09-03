// Auth.js 세션을 직접 발급한다.
//
// Auth.js 는 Google 콜백 안에서만 세션 쿠키를 만든다. 그런데 가입 동의와 심사용
// 로그인은 콜백 밖에서 "이 사람을 로그인시켜라"를 해야 한다 — 예전에는 동의 뒤에
// Google 로 한 번 더 다녀와 세션을 받았는데, 사용자에게는 로그인이 두 번으로 보였다.
//
// 그래서 Auth.js 가 읽는 것과 같은 쿠키를 여기서 만든다. 쿠키 이름·salt·시크릿·
// 페이로드 모양이 @auth/core 내부와 일치해야 하고, 어긋나면 발급은 되는데 auth() 가
// 아무것도 못 읽는 조용한 실패가 된다. 그 계약은 session.test.ts 가 Auth.js 의
// decode 로 되읽어 확인한다.

import { encode } from 'next-auth/jwt';

// Auth.js 기본값 (lib/init.js 의 maxAge). 30일.
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface SessionUser {
  id: number;
  googleId: string;
  email: string;
  name: string | null;
  avatar: string | null;
}

export interface SessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: 'lax';
    path: '/';
    secure: boolean;
    maxAge: number;
  };
}

// @auth/core 의 createActionURL 과 같은 순서로 판단한다: AUTH_URL(NEXTAUTH_URL) 이
// 있으면 그 프로토콜, 없으면 x-forwarded-proto, 그것도 없으면 https. 결과가 https 면
// 쿠키 이름에 __Secure- 가 붙는다 — 이름이 다르면 Auth.js 에게는 다른 쿠키다.
export function secureCookies(headers: Headers): boolean {
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (envUrl) return new URL(envUrl).protocol === 'https:';
  const proto = headers.get('x-forwarded-proto') ?? 'https';
  return proto.replace(/:$/, '') === 'https';
}

export function sessionCookieName(secure: boolean): string {
  return `${secure ? '__Secure-' : ''}authjs.session-token`;
}

// Google 로그인이 만들었을 것과 같은 페이로드다. sub 는 Google ID, userId 는
// jwt 콜백이 얹는 값이고 session 콜백이 그것을 session.user.id 로 옮긴다.
export async function issueSessionCookie(user: SessionUser, headers: Headers): Promise<SessionCookie> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');

  const secure = secureCookies(headers);
  const name = sessionCookieName(secure);
  const value = await encode({
    token: {
      sub: user.googleId,
      name: user.name ?? undefined,
      email: user.email,
      picture: user.avatar ?? undefined,
      userId: user.id,
    },
    secret,
    // Auth.js 는 쿠키 이름을 salt 로 쓴다. 다른 값을 쓰면 복호화가 안 된다.
    salt: name,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return {
    name,
    value,
    options: { httpOnly: true, sameSite: 'lax', path: '/', secure, maxAge: SESSION_MAX_AGE_SECONDS },
  };
}
