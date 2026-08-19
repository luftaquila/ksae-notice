import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PENDING_SIGNUP_TTL_SECONDS,
  sealPendingSignup,
  unsealPendingSignup,
} from '@/lib/signup/pending';

// 봉인이 뚫리면 남의 이메일로 가입시킬 수 있다. 서명과 만료가 그것만 막고 있다.
const PENDING = {
  googleId: 'google-1',
  email: 'a@test.com',
  name: '홍길동',
  avatar: 'https://example.com/a.png',
};

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('pending signup seal', () => {
  it('round-trips the profile', () => {
    expect(unsealPendingSignup(sealPendingSignup(PENDING))).toEqual(PENDING);
  });

  it('keeps a null name and avatar null rather than undefined', () => {
    const sealed = sealPendingSignup({ ...PENDING, name: null, avatar: null });
    expect(unsealPendingSignup(sealed)).toEqual({ ...PENDING, name: null, avatar: null });
  });

  it('rejects a tampered payload', () => {
    const sealed = sealPendingSignup(PENDING);
    const [body, signature] = sealed.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...PENDING, email: 'attacker@test.com', exp: 9999999999 }),
      'utf8',
    ).toString('base64url');

    expect(unsealPendingSignup(`${forged}.${signature}`)).toBeNull();
    // 서명 자체를 바꾼 경우도, 길이만 맞춘 경우도 통과하지 못한다.
    expect(unsealPendingSignup(`${body}.${'A'.repeat(signature.length)}`)).toBeNull();
    expect(unsealPendingSignup(`${body}.short`)).toBeNull();
  });

  it('rejects a signature made with a different secret', () => {
    const sealed = sealPendingSignup(PENDING);
    vi.stubEnv('AUTH_SECRET', 'another-secret');
    expect(unsealPendingSignup(sealed)).toBeNull();
  });

  it('rejects an expired seal even though the signature is valid', () => {
    const now = Date.now();
    const sealed = sealPendingSignup(PENDING, now);

    expect(unsealPendingSignup(sealed, now + (PENDING_SIGNUP_TTL_SECONDS - 1) * 1000)).toEqual(PENDING);
    expect(unsealPendingSignup(sealed, now + (PENDING_SIGNUP_TTL_SECONDS + 1) * 1000)).toBeNull();
  });

  it('rejects junk', () => {
    expect(unsealPendingSignup(undefined)).toBeNull();
    expect(unsealPendingSignup('')).toBeNull();
    expect(unsealPendingSignup('nodot')).toBeNull();
    expect(unsealPendingSignup('.sig')).toBeNull();
  });
});
