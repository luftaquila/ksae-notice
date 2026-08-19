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

async function post(path: string, body: Record<string, unknown>): Promise<NicepayResult> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: authorizationHeader(),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return (await response.json()) as NicepayResult;
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
