// 결제 흐름: 인증 결과 검증 → 승인 → 지급, 그리고 웹훅·취소.
//
// 라우트는 이 모듈을 부르기만 한다. 판정 로직이 HTTP 표면에서 떨어져 있어야
// 서명·금액 검증과 멱등성을 테스트로 붙잡을 수 있다.

import {
  approve,
  authSignature,
  cancelPayment,
  netCancel,
  resultSignature,
  signatureMatches,
  type NicepayResult,
} from './nicepay';
import { failOrder, getOrder, reclaimOrder, settleOrder } from './orders';

export type ReturnOutcome = 'paid' | 'failed' | 'invalid';

// returnUrl POST 처리.
//
// 로그인 세션에 의존하지 않는다. 나이스페이 도메인에서 넘어오는 top-level
// cross-site POST 라 SameSite=Lax 인 next-auth 세션 쿠키가 실려 오지 않기
// 때문이다. 소유자는 주문 행의 userId 로만 판단한다.
export async function processReturn(
  fields: Record<string, string>,
): Promise<{ orderId: string | null; result: ReturnOutcome }> {
  const orderId = (fields.orderId || '').trim();
  if (!orderId) {
    console.warn('[Payment] return without an orderId');
    return { orderId: null, result: 'invalid' };
  }

  const order = getOrder(orderId);
  if (!order) {
    console.warn(`[Payment] return for an unknown order ${orderId}`);
    return { orderId: null, result: 'invalid' };
  }

  if (fields.authResultCode !== '0000') {
    failOrder(orderId, fields.authResultMsg || '결제가 취소되었거나 인증에 실패했습니다', fields);
    return { orderId, result: 'failed' };
  }

  const rawAmount = fields.amount || '';
  const amount = Number.parseInt(rawAmount, 10);
  if (!Number.isFinite(amount)) {
    failOrder(orderId, '결제 금액을 해석할 수 없습니다', fields);
    return { orderId, result: 'failed' };
  }

  if (amount !== order.amount) {
    // 결제창에 넘긴 금액이 바뀐 채 돌아온 경우. 승인 API 를 부르지 않으므로
    // 결제는 성립하지 않는다.
    console.error(`[Payment] ${orderId} amount mismatch: order=${order.amount} returned=${amount}`);
    failOrder(orderId, '결제 금액이 주문과 일치하지 않습니다', fields);
    return { orderId, result: 'failed' };
  }

  // 서명은 나이스페이가 보낸 amount 문자열 그대로로 만든다.
  const expected = authSignature(fields.authToken || '', rawAmount);
  if (!signatureMatches(expected, fields.signature)) {
    console.error(`[Payment] ${orderId} signature verification failed`);
    failOrder(orderId, '결제 인증 서명 검증에 실패했습니다', fields);
    return { orderId, result: 'failed' };
  }

  const tid = (fields.tid || '').trim();
  if (!tid) {
    failOrder(orderId, '거래키가 없습니다', fields);
    return { orderId, result: 'failed' };
  }

  let result: NicepayResult;
  try {
    result = await approve(tid, order.amount);
  } catch (error) {
    // 승인 성립 여부를 알 수 없는 상태다. 망취소로 문제 거래를 정리한다.
    console.error(`[Payment] ${orderId} approval request failed:`, error);
    try {
      await netCancel(orderId);
    } catch (netCancelError) {
      console.error(`[Payment] ${orderId} net cancel failed:`, netCancelError);
    }
    failOrder(orderId, '승인 응답을 받지 못해 망취소를 요청했습니다', fields);
    return { orderId, result: 'failed' };
  }

  if (result.resultCode !== '0000' || result.status !== 'paid') {
    console.error(`[Payment] ${orderId} approval rejected: ${result.resultCode} ${result.resultMsg}`);
    failOrder(orderId, result.resultMsg || '결제 승인이 거절되었습니다', fields);
    return { orderId, result: 'failed' };
  }

  // 응답에 서명이 실려 오면 검증한다. 여기서 어긋나면 승인은 이미 성립한
  // 상태이므로 기간을 늘리지 않고 관리자 확인 대상으로 남긴다.
  if (result.signature) {
    const expectedResult = resultSignature(tid, result.amount ?? '', result.ediDate ?? '');
    if (!signatureMatches(expectedResult, result.signature)) {
      console.error(`[Payment] ${orderId} approval response signature mismatch; not granting`);
      failOrder(orderId, '승인 응답 서명 검증에 실패했습니다', result);
      return { orderId, result: 'failed' };
    }
  }

  settleOrder({
    orderId,
    tid,
    method: result.payMethod ?? fields.payMethod ?? null,
    rawApprove: result,
    rawAuth: fields,
  });
  return { orderId, result: 'paid' };
}

// 웹훅 처리. 브라우저가 returnUrl 을 완주하지 못한 승인을 건져 올리고,
// 나이스페이 관리자 화면에서 직접 취소한 건을 서비스에 반영한다.
//
// 서버승인 모델에서는 우리가 승인 API 를 부르지 않으면 결제가 성립하지 않는다.
// 따라서 여기로 들어오는 paid 웹훅의 주문이 아직 pending 이라면, 승인은 났는데
// returnUrl 처리가 중간에 끊긴 경우다.
export function processWebhook(payload: Record<string, unknown>): void {
  const orderId = String(payload.orderId ?? '').trim();
  if (!orderId) return;

  const order = getOrder(orderId);
  if (!order) {
    console.warn(`[Payment] webhook for an unknown order ${orderId}`);
    return;
  }

  const tid = String(payload.tid ?? '').trim();
  const signature = payload.signature ? String(payload.signature) : null;
  if (signature) {
    const expected = resultSignature(tid, String(payload.amount ?? ''), String(payload.ediDate ?? ''));
    if (!signatureMatches(expected, signature)) {
      console.error(`[Payment] webhook ${orderId} signature verification failed`);
      return;
    }
  }

  const amount = Number.parseInt(String(payload.amount ?? ''), 10);
  if (!Number.isFinite(amount)) {
    console.error(`[Payment] webhook ${orderId} has an unreadable amount`);
    return;
  }

  const status = payload.status;

  if (status === 'paid') {
    if (amount !== order.amount) {
      console.error(`[Payment] webhook ${orderId} amount mismatch: order=${order.amount} webhook=${amount}`);
      return;
    }
    const settled = settleOrder({
      orderId,
      tid,
      method: payload.payMethod ? String(payload.payMethod) : null,
      rawApprove: payload,
    });
    if (settled) {
      console.warn(`[Payment] ${orderId} was settled by the webhook, not by returnUrl`);
    }
    return;
  }

  if (status === 'cancelled' || status === 'partialCancelled') {
    const reclaimed = reclaimOrder({
      orderId,
      reason: '나이스페이 취소 통보',
      rawCancel: payload,
    });
    if (reclaimed) {
      console.warn(
        `[Payment] ${orderId} was cancelled outside the admin page; period rolled back: ${reclaimed.rolledBack}`,
      );
    }
  }
}

// 관리자 전액 취소. 취소 API 가 성립한 뒤에만 기간을 되돌린다.
export async function adminCancel(
  orderId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; rolledBack?: boolean }> {
  const order = getOrder(orderId);
  if (!order) return { ok: false, error: '주문을 찾을 수 없습니다.' };
  if (order.status !== 'paid') {
    return { ok: false, error: '결제 완료 상태의 주문만 취소할 수 있습니다.' };
  }
  if (!order.tid) return { ok: false, error: '거래키가 없어 취소할 수 없습니다.' };

  let result: NicepayResult;
  try {
    result = await cancelPayment(order.tid, reason, orderId);
  } catch (error) {
    console.error(`[Payment] ${orderId} cancel request failed:`, error);
    return { ok: false, error: '취소 요청에 실패했습니다.' };
  }

  if (result.resultCode !== '0000') {
    return { ok: false, error: result.resultMsg || '취소가 거절되었습니다.' };
  }

  const reclaimed = reclaimOrder({ orderId, reason, rawCancel: result });
  if (!reclaimed) {
    // 웹훅이 한발 먼저 되돌린 경우. 취소 자체는 성립했다.
    return { ok: true, rolledBack: false };
  }
  return { ok: true, rolledBack: reclaimed.rolledBack };
}
