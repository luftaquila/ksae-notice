import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  MIN_CARD_AMOUNT,
  PAY_METHOD,
  apiBase,
  authSignature,
  clientId,
  isConfigured,
  resultSignature,
  signatureMatches,
} from '@/lib/payment/nicepay';

describe('nicepay signatures', () => {
  beforeEach(() => {
    vi.stubEnv('NICEPAY_CLIENT_ID', 'R2_testclient');
    vi.stubEnv('NICEPAY_SECRET_KEY', 'testsecret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // hex(sha256(authToken + clientId + amount + secretKey))
  it('builds the returnUrl signature from the documented formula', () => {
    const expected = createHash('sha256')
      .update('authtokenR2_testclient1000testsecret', 'utf8')
      .digest('hex');

    expect(authSignature('authtoken', '1000')).toBe(expected);
    // A number and its string form must hash the same — NicePay sends a string
    // on the form post and a number in the JSON responses.
    expect(authSignature('authtoken', 1000)).toBe(expected);
  });

  // hex(sha256(tid + amount + ediDate + secretKey))
  it('builds the approval and webhook signature from the documented formula', () => {
    const expected = createHash('sha256')
      .update('tid-110002026-08-19T12:00:00.000+0900testsecret', 'utf8')
      .digest('hex');

    expect(resultSignature('tid-1', 1000, '2026-08-19T12:00:00.000+0900')).toBe(expected);
  });

  it('rejects a missing, short, or wrong signature', () => {
    const expected = authSignature('authtoken', 1000);

    expect(signatureMatches(expected, expected)).toBe(true);
    expect(signatureMatches(expected, null)).toBe(false);
    expect(signatureMatches(expected, undefined)).toBe(false);
    expect(signatureMatches(expected, '')).toBe(false);
    // Different length must not throw the way timingSafeEqual would on its own.
    expect(signatureMatches(expected, 'deadbeef')).toBe(false);
    expect(signatureMatches(expected, '0'.repeat(expected.length))).toBe(false);
  });
});

describe('nicepay configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports itself unconfigured without both keys', () => {
    vi.stubEnv('NICEPAY_CLIENT_ID', 'R2_testclient');
    vi.stubEnv('NICEPAY_SECRET_KEY', '');
    expect(isConfigured()).toBe(false);

    vi.stubEnv('NICEPAY_SECRET_KEY', 'testsecret');
    expect(isConfigured()).toBe(true);
    expect(clientId()).toBe('R2_testclient');
  });

  it('defaults to the production host and trims a trailing slash', () => {
    vi.stubEnv('NICEPAY_API_BASE', '');
    expect(apiBase()).toBe('https://api.nicepay.co.kr');

    vi.stubEnv('NICEPAY_API_BASE', 'https://sandbox-api.nicepay.co.kr/');
    expect(apiBase()).toBe('https://sandbox-api.nicepay.co.kr');
  });

  it('pins the card minimum and the combined card + easy-pay window', () => {
    // NicePay result code 3041: 1,000원 미만 신용카드 승인 불가.
    expect(MIN_CARD_AMOUNT).toBe(1000);
    expect(PAY_METHOD).toBe('cardAndEasyPay');
  });
});
