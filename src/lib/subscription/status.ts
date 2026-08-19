// 구독 상태는 두 축의 곱이다: 켜진 카테고리가 있는지, 그리고 결제된 기간이 남았는지.
// 관리자 화면에는 그 두 축을 따로 켜고 끄는 버튼이 있는데 곱한 결과는 어디에도 없어서,
// 누가 구독자 자리를 차지하고 있는지 표를 봐도 알 수 없었다. 여기서 한 값으로 접는다.
//
// 판정은 lib/subscription/capacity 의 getActiveSubscriberCount 와 같아야 한다 —
// 화면이 세는 수와 서버가 정원에 세는 수가 어긋나면 이 칸은 없는 것보다 나쁘다.

export type SubscriptionStatusKey = 'receiving' | 'unpaid' | 'paused' | 'inactive' | 'withdrawn';

export interface SubscriptionStatus {
  key: SubscriptionStatusKey;
  label: string;
  // 구독자 정원에 잡히는 상태인지. receiving 하나뿐이다.
  holdsSlot: boolean;
}

const STATUS: Record<SubscriptionStatusKey, SubscriptionStatus> = {
  receiving: { key: 'receiving', label: '수신 중', holdsSlot: true },
  unpaid: { key: 'unpaid', label: '미결제', holdsSlot: false },
  paused: { key: 'paused', label: '해제', holdsSlot: false },
  inactive: { key: 'inactive', label: '해제·미결제', holdsSlot: false },
  withdrawn: { key: 'withdrawn', label: '탈퇴', holdsSlot: false },
};

export function subscriptionStatus(
  account: {
    deletedAt: string | null;
    subscriptionExpiresAt: string | null;
    hasActiveCategory: boolean;
  },
  now = new Date(),
): SubscriptionStatus {
  if (account.deletedAt) return STATUS.withdrawn;

  // 서버의 정원 집계와 같은 비교: NULL 만료일은 이 비교에서 탈락한다.
  const covered =
    !!account.subscriptionExpiresAt && account.subscriptionExpiresAt >= now.toISOString();

  if (account.hasActiveCategory && covered) return STATUS.receiving;
  if (account.hasActiveCategory) return STATUS.unpaid;
  if (covered) return STATUS.paused;
  return STATUS.inactive;
}
