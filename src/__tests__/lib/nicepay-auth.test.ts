import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  accessToken,
  approve,
  cancelPayment,
  netCancel,
  resetAccessToken,
} from '@/lib/payment/nicepay';

// 결제 API(/v1/payments/*)는 Bearer 토큰만 받는다. Basic 을 보내면 조회조차
// U103 "사용자 인증타입이 맞지 않습니다"로 거절된다 — 실제 상점에서 확인했다.
// Basic 이 통하는 곳은 토큰을 발급하는 /v1/access-token 하나뿐이다.

interface Seen {
  method: string;
  path: string;
  authorization: string;
}

let seen: Seen[];
let respond: (path: string, authorization: string, call: number) => unknown;

function tokenBody(token = 'tok-1') {
  return { resultCode: '0000', resultMsg: '정상 처리되었습니다.', accessToken: token, tokenType: 'Bearer' };
}

beforeEach(() => {
  vi.stubEnv('NICEPAY_CLIENT_ID', 'R2_testclient');
  vi.stubEnv('NICEPAY_SECRET_KEY', 'testsecret');
  vi.stubEnv('NICEPAY_API_BASE', 'https://api.nicepay.test');
  resetAccessToken();
  seen = [];
  respond = (path) => (path === '/v1/access-token' ? tokenBody() : { resultCode: '0000', status: 'paid' });

  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const authorization = (init.headers as Record<string, string>).Authorization;
    seen.push({ method: init.method!, path, authorization });
    return { json: async () => respond(path, authorization, seen.length) } as Response;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetAccessToken();
});

const BASIC = `Basic ${Buffer.from('R2_testclient:testsecret', 'utf8').toString('base64')}`;

describe('payment API authentication', () => {
  it('issues the token with Basic and calls the payment API with Bearer', async () => {
    const result = await approve('tid-1', 1000);

    expect(result.resultCode).toBe('0000');
    expect(seen).toEqual([
      { method: 'POST', path: '/v1/access-token', authorization: BASIC },
      { method: 'POST', path: '/v1/payments/tid-1', authorization: 'Bearer tok-1' },
    ]);
  });

  it('reuses one token across approve, cancel, and net cancel', async () => {
    await approve('tid-1', 1000);
    await cancelPayment('tid-1', 'test', 'o1');
    await netCancel('o1');

    expect(seen.filter((s) => s.path === '/v1/access-token').length).toBe(1);
    expect(seen.filter((s) => s.path !== '/v1/access-token').map((s) => s.path)).toEqual([
      '/v1/payments/tid-1',
      '/v1/payments/tid-1/cancel',
      '/v1/payments/netcancel',
    ]);
  });

  // U103 은 인증 계층에서 잘린 것이라 요청이 처리된 흔적이 없다. 승인 요청이라도
  // 재시도가 안전한 유일한 오류코드다.
  it('reissues the token once and retries when it is rejected', async () => {
    respond = (path, authorization, call) => {
      if (path === '/v1/access-token') return tokenBody(`tok-${call}`);
      if (call === 2) return { resultCode: 'U103', resultMsg: '사용자 인증타입이 맞지 않습니다.' };
      return { resultCode: '0000', status: 'paid' };
    };

    const result = await approve('tid-1', 1000);

    expect(result.resultCode).toBe('0000');
    expect(seen.map((s) => s.path)).toEqual([
      '/v1/access-token',
      '/v1/payments/tid-1',
      '/v1/access-token',
      '/v1/payments/tid-1',
    ]);
    expect(seen[3].authorization).toBe('Bearer tok-3');
  });

  it('never retries any other error code', async () => {
    respond = (path) =>
      path === '/v1/access-token' ? tokenBody() : { resultCode: '3041', resultMsg: '금액 오류' };

    const result = await approve('tid-1', 1000);

    expect(result.resultCode).toBe('3041');
    expect(seen.filter((s) => s.path === '/v1/payments/tid-1').length).toBe(1);
  });

  // 토큰이 없으면 승인을 시도조차 할 수 없다. 부르는 쪽(processReturn)이 이것을
  // 승인 실패로 다뤄 주문을 failed 로 내리고 망취소를 던진다.
  it('throws when the token cannot be issued', async () => {
    respond = () => ({ resultCode: 'U116', resultMsg: '사용자 정보가 존재하지 않습니다.' });

    await expect(accessToken()).rejects.toThrow('U116');
  });
});
