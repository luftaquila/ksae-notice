// 나이스페이 v2 결제창 서버승인 클라이언트.
//
// 결제창은 인증만 한다. 승인 API를 부르지 않으면 결제가 성립하지 않으므로,
// 인증 결과(returnUrl)와 승인은 분리해서 다룬다.

import { createHash, timingSafeEqual } from 'node:crypto';

const DEFAULT_API_BASE = 'https://api.nicepay.co.kr';

// 카드 + 간편결제(카카오페이·네이버페이·페이코 등) 통합 결제창.
export const PAY_METHOD = 'cardAndEasyPay';

// 나이스페이 오류코드 3041 "금액 오류(1000원 미만 신용카드 승인 불가)".
// 카드 결제창을 쓰는 이상 이 밑의 주문은 만들어도 승인이 거절된다.
export const MIN_CARD_AMOUNT = 1000;

// 승인 API는 카드사 응답을 기다린다. 여기서 끊기면 승인 성립 여부를 알 수 없어
// 망취소를 던져야 하므로, 성급하게 자르지 않는다.
const REQUEST_TIMEOUT_MS = 30_000;

// 액세스 토큰 유효시간 30분. 만료 직전에 걸리지 않도록 여유를 두고 갱신한다.
// expireAt 을 파싱하지 않는 이유는 시계 오차와 오프셋 표기(+0900, 콜론 없음)에
// 기대지 않기 위해서다 — 어긋나도 U103 재시도가 받아준다.
const TOKEN_TTL_MS = 30 * 60_000;
const TOKEN_MARGIN_MS = 120_000;

// 인증타입 불일치. Basic 으로 결제 API 를 부르면 이 코드가 온다.
const WRONG_AUTH_TYPE = 'U103';

export interface NicepayResult {
  resultCode?: string;
  resultMsg?: string;
  status?: string;
  tid?: string;
  orderId?: string;
  amount?: number;
  payMethod?: string;
  ediDate?: string;
  signature?: string;
  [key: string]: unknown;
}

export function clientId(): string {
  return process.env.NICEPAY_CLIENT_ID || '';
}

// 서버 전용. 응답이나 로그 어디에도 실리면 안 된다.
function secretKey(): string {
  return process.env.NICEPAY_SECRET_KEY || '';
}

export function apiBase(): string {
  return (process.env.NICEPAY_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
}

export function isConfigured(): boolean {
  return !!(clientId() && secretKey());
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// returnUrl 위변조 검증값: hex(sha256(authToken + clientId + amount + secretKey))
export function authSignature(authToken: string, amount: string | number): string {
  return sha256Hex(`${authToken}${clientId()}${amount}${secretKey()}`);
}

// 승인 응답·웹훅 위변조 검증값: hex(sha256(tid + amount + ediDate + secretKey))
export function resultSignature(tid: string, amount: string | number, ediDate: string): string {
  return sha256Hex(`${tid}${amount}${ediDate}${secretKey()}`);
}

export function signatureMatches(expected: string, received: string | null | undefined): boolean {
  if (!received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
}

function authorizationHeader(): string {
  return `Basic ${Buffer.from(`${clientId()}:${secretKey()}`, 'utf8').toString('base64')}`;
}

// 결제 API(/v1/payments/*)는 Bearer 토큰만 받는다. Basic 을 보내면 조회조차
// U103 "사용자 인증타입이 맞지 않습니다"로 거절된다. Basic 이 통하는 곳은 토큰을
// 발급하는 /v1/access-token 하나뿐이다.
let cachedToken: { value: string; expiresAt: number } | null = null;

export function resetAccessToken(): void {
  cachedToken = null;
}

async function request(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  authorization: string,
): Promise<NicepayResult> {
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return (await response.json()) as NicepayResult;
}

// 발급 실패는 throw 한다 — 토큰이 없으면 승인을 시도조차 할 수 없고, 부르는 쪽이
// 그것을 승인 실패로 다뤄야 한다.
//
// 락은 두지 않는다. 단일 레플리카에 저트래픽이라 경합해도 토큰이 하나 더 발급될
// 뿐이고, 먼저 받은 토큰도 만료까지 그대로 유효하다.
export async function accessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAt) return cachedToken.value;

  const body = await request('POST', '/v1/access-token', {}, authorizationHeader());
  const token = typeof body.accessToken === 'string' ? body.accessToken : '';
  if (body.resultCode !== '0000' || !token) {
    throw new Error(`access token 발급 실패: ${body.resultCode} ${body.resultMsg}`);
  }

  cachedToken = { value: token, expiresAt: now + TOKEN_TTL_MS - TOKEN_MARGIN_MS };
  return token;
}

// 토큰이 만료돼 U103 이 오면 한 번 재발급해 재시도한다. U103 은 인증 계층에서
// 잘린 것이므로 요청이 처리된 흔적이 없다 — 그래서 승인 요청이라도 재시도가
// 안전하다. 다른 오류코드는 절대 재시도하지 않는다.
async function post(path: string, body: Record<string, unknown>): Promise<NicepayResult> {
  const result = await request('POST', path, body, `Bearer ${await accessToken()}`);
  if (result.resultCode !== WRONG_AUTH_TYPE) return result;

  console.warn(`[Payment] access token rejected (U103); reissuing and retrying ${path}`);
  resetAccessToken();
  return request('POST', path, body, `Bearer ${await accessToken()}`);
}

export async function approve(tid: string, amount: number): Promise<NicepayResult> {
  return post(`/v1/payments/${encodeURIComponent(tid)}`, { amount });
}

// cancelAmt 를 넘기지 않으면 전액취소로 동작한다.
export async function cancelPayment(
  tid: string,
  reason: string,
  orderId: string,
): Promise<NicepayResult> {
  return post(`/v1/payments/${encodeURIComponent(tid)}/cancel`, { reason, orderId });
}

// 승인 요청 후 1시간 이내에만 유효하다.
export async function netCancel(orderId: string): Promise<NicepayResult> {
  return post('/v1/payments/netcancel', { orderId });
}
