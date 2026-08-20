// 동의를 받기 전의 가입 대기 정보.
//
// 계정 행은 동의 후에 만든다. 그래서 Google 인증과 동의 화면 사이에 프로필을 어딘가
// 들고 있어야 하는데, DB 에 적으면 동의 전에 개인정보를 저장하는 셈이 된다. HMAC 으로
// 봉인한 httpOnly 쿠키에 담아 브라우저에만 맡긴다 — 서버는 아무것도 보관하지 않고,
// 서명이 없으면 남의 이메일로 가입시킬 수도 없다.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const PENDING_SIGNUP_COOKIE = 'ksae-pending-signup';

// 동의 화면에 머무를 수 있는 시간. 지나면 다시 로그인해야 한다.
export const PENDING_SIGNUP_TTL_SECONDS = 600;

export interface PendingSignup {
  googleId: string;
  email: string;
  name: string | null;
  avatar: string | null;
}

interface SealedPayload extends PendingSignup {
  exp: number;
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET is not set');
  return value;
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

export function sealPendingSignup(pending: PendingSignup, now = Date.now()): string {
  const payload: SealedPayload = {
    ...pending,
    exp: Math.floor(now / 1000) + PENDING_SIGNUP_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function unsealPendingSignup(value: string | undefined, now = Date.now()): PendingSignup | null {
  if (!value) return null;

  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;
  const body = value.slice(0, separator);
  const received = value.slice(separator + 1);

  const expected = sign(body);
  if (received.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'))) return null;

  let payload: SealedPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  // 서명이 맞아도 만료된 것은 받지 않는다.
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
  if (!payload.googleId || !payload.email) return null;

  return {
    googleId: payload.googleId,
    email: payload.email,
    name: payload.name ?? null,
    avatar: payload.avatar ?? null,
  };
}
