import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { decode } from 'next-auth/jwt';
import { issueSessionCookie, sessionCookieName, secureCookies } from '@/lib/session';

// 이 파일이 지키는 계약: 우리가 만든 쿠키를 Auth.js 가 그대로 읽을 수 있어야 한다.
// 이름·salt·시크릿이 하나라도 어긋나면 auth() 는 로그인 안 된 것으로 본다.

const USER = { id: 7, googleId: 'google-7', email: 'a@test.com', name: '홍길동', avatar: 'https://example.com/a.png' };

function headers(init: Record<string, string> = {}) {
  return new Headers(init);
}

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
  vi.stubEnv('AUTH_URL', '');
  vi.stubEnv('NEXTAUTH_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('issueSessionCookie', () => {
  it('issues a token Auth.js decodes with the cookie name as salt', async () => {
    const cookie = await issueSessionCookie(USER, headers({ 'x-forwarded-proto': 'http' }));

    const payload = await decode({ token: cookie.value, secret: 'test-auth-secret', salt: cookie.name });
    expect(payload).toMatchObject({
      sub: 'google-7',
      name: '홍길동',
      email: 'a@test.com',
      picture: 'https://example.com/a.png',
      userId: 7,
    });
    expect(typeof payload?.exp).toBe('number');
  });

  it('cannot be read with another salt', async () => {
    const cookie = await issueSessionCookie(USER, headers({ 'x-forwarded-proto': 'http' }));

    await expect(
      decode({ token: cookie.value, secret: 'test-auth-secret', salt: 'other' }),
    ).rejects.toThrow();
  });

  it('cannot be read with another secret', async () => {
    const cookie = await issueSessionCookie(USER, headers({ 'x-forwarded-proto': 'http' }));

    await expect(
      decode({ token: cookie.value, secret: 'wrong', salt: cookie.name }),
    ).rejects.toThrow();
  });

  it('carries the cookie options Auth.js uses', async () => {
    const cookie = await issueSessionCookie(USER, headers({ 'x-forwarded-proto': 'https' }));

    expect(cookie.options).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      maxAge: 30 * 24 * 60 * 60,
    });
  });

  it('leaves out name and picture when the account has none', async () => {
    const cookie = await issueSessionCookie(
      { ...USER, name: null, avatar: null },
      headers({ 'x-forwarded-proto': 'http' }),
    );

    const payload = await decode({ token: cookie.value, secret: 'test-auth-secret', salt: cookie.name });
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('picture');
    expect(payload?.email).toBe('a@test.com');
  });

  it('refuses without AUTH_SECRET', async () => {
    vi.stubEnv('AUTH_SECRET', '');

    await expect(issueSessionCookie(USER, headers())).rejects.toThrow('AUTH_SECRET');
  });
});

// Auth.js 는 https 면 __Secure- 를 붙인다. 판단 순서는 createActionURL 과 같다.
describe('cookie name', () => {
  it('follows x-forwarded-proto when no AUTH_URL is set', () => {
    expect(secureCookies(headers({ 'x-forwarded-proto': 'https' }))).toBe(true);
    expect(secureCookies(headers({ 'x-forwarded-proto': 'http' }))).toBe(false);
  });

  it('assumes https when nothing says otherwise', () => {
    expect(secureCookies(headers())).toBe(true);
  });

  it('lets AUTH_URL override the header', () => {
    vi.stubEnv('AUTH_URL', 'http://localhost:3000');
    expect(secureCookies(headers({ 'x-forwarded-proto': 'https' }))).toBe(false);

    vi.stubEnv('AUTH_URL', 'https://notice.example.com');
    expect(secureCookies(headers({ 'x-forwarded-proto': 'http' }))).toBe(true);
  });

  it('prefixes the secure cookie', () => {
    expect(sessionCookieName(true)).toBe('__Secure-authjs.session-token');
    expect(sessionCookieName(false)).toBe('authjs.session-token');
  });

  it('names the issued cookie the same way', async () => {
    const plain = await issueSessionCookie(USER, headers({ 'x-forwarded-proto': 'http' }));
    const secure = await issueSessionCookie(USER, headers({ 'x-forwarded-proto': 'https' }));

    expect(plain.name).toBe('authjs.session-token');
    expect(plain.options.secure).toBe(false);
    expect(secure.name).toBe('__Secure-authjs.session-token');
    expect(secure.options.secure).toBe(true);
  });
});
