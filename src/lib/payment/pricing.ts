import { getSetting } from '../subscription/capacity';
import { MIN_CARD_AMOUNT } from './nicepay';

export const DEFAULT_SUBSCRIPTION_PRICE = 1000;

// 전자상거래 고지 정보. 값은 관리자 화면에서 채우고 /policy 가 그대로 렌더한다.
export const BUSINESS_SETTING_KEYS = [
  'bizName',
  'bizOwner',
  'bizRegNo',
  'bizMailOrderNo',
  'bizAddress',
  'bizTel',
  'bizEmail',
] as const;

export type BusinessInfo = Record<(typeof BUSINESS_SETTING_KEYS)[number], string>;

// 0 은 "무료" 를 뜻하는 설정값이다. 결제할 것이 없다는 뜻이므로 결제창을 열지
// 않고 주문을 그 자리에서 확정한다 (lib/payment/orders 의 settleFreeOrder).
export const FREE_PRICE = 0;

// 연간 구독료. 0(무료)을 빼면, 카드 최소 승인금액 밑으로 내려간 설정값은 승인이
// 거절되는 값이라 저장돼 있어도 쓰지 않는다 — 결제창까지 갔다가 3041로 튕기는
// 것보다 낫다. 1~999 는 무료 의도로 읽지 않는다: 무료는 정확히 0 하나다.
export function getSubscriptionPrice(): number {
  const parsed = parseInt(getSetting('subscriptionPrice') || '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SUBSCRIPTION_PRICE;
  if (parsed === FREE_PRICE) return FREE_PRICE;
  if (parsed < MIN_CARD_AMOUNT) return DEFAULT_SUBSCRIPTION_PRICE;
  return parsed;
}

// 지금 구독이 무료인지. 결제 경로가 갈리는 지점마다 이 한 값을 본다.
export function isFreeSubscription(): boolean {
  return getSubscriptionPrice() === FREE_PRICE;
}

export function getBusinessInfo(): BusinessInfo {
  return Object.fromEntries(
    BUSINESS_SETTING_KEYS.map((key) => [key, getSetting(key) || '']),
  ) as BusinessInfo;
}
