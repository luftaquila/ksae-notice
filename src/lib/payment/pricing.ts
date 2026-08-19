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

// 연간 구독료. 카드 최소 승인금액 밑으로 내려간 설정값은 승인이 거절되는 값이라
// 저장돼 있어도 쓰지 않는다 — 결제창까지 갔다가 3041로 튕기는 것보다 낫다.
export function getSubscriptionPrice(): number {
  const parsed = parseInt(getSetting('subscriptionPrice') || '', 10);
  if (!Number.isFinite(parsed) || parsed < MIN_CARD_AMOUNT) return DEFAULT_SUBSCRIPTION_PRICE;
  return parsed;
}

export function getBusinessInfo(): BusinessInfo {
  return Object.fromEntries(
    BUSINESS_SETTING_KEYS.map((key) => [key, getSetting(key) || '']),
  ) as BusinessInfo;
}
