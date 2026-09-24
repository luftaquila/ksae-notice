// 구독 상태는 결제된 기간 하나로 정해진다: 없음 / 이용 중 / 만료 (그리고 탈퇴).
//
// 예전에는 여기에 "켜진 카테고리가 있는지" 를 곱해 네 칸을 만들었다. 그 결과 "해제"
// (돈은 냈는데 아무것도 안 받음) 같은 퇴화 상태가 구독 상태로 보였고, 카테고리 스위치
// 하나가 정원까지 흔들었다 — 결제한 사람이 토글을 다 끄면 자리가 비고, 다시 켜면 정원
// 초과인 채로 수신했다. 카테고리는 이제 알림 설정(alertSummary)이라는 별도 축이고,
// 구독과 곱하지 않는다. 메일은 두 축의 교집합에게 가지만, 상태는 각자 따로 말한다.
//
// holdsSeat 판정은 lib/subscription/capacity 의 getSeatCount 와 같아야 한다 —
// 화면이 세는 좌석과 서버가 정원에 세는 좌석이 어긋나면 이 배지는 없는 것보다 나쁘다.

export type SubscriptionStateKey = 'none' | 'active' | 'expired' | 'withdrawn';

export interface SubscriptionState {
  key: SubscriptionStateKey;
  label: string;
  // 정원(maxSubscribers)에 잡히는 좌석인지. active 하나뿐이다.
  holdsSeat: boolean;
}

const STATE: Record<SubscriptionStateKey, SubscriptionState> = {
  none: { key: 'none', label: '구독 없음', holdsSeat: false },
  active: { key: 'active', label: '이용 중', holdsSeat: true },
  expired: { key: 'expired', label: '만료', holdsSeat: false },
  withdrawn: { key: 'withdrawn', label: '탈퇴', holdsSeat: false },
};

export function subscriptionState(
  account: { deletedAt: string | null; subscriptionExpiresAt: string | null },
  now = new Date(),
): SubscriptionState {
  if (account.deletedAt) return STATE.withdrawn;
  if (!account.subscriptionExpiresAt) return STATE.none;
  // 서버의 정원 집계와 같은 비교 — ISO 문자열 그대로.
  return account.subscriptionExpiresAt >= now.toISOString() ? STATE.active : STATE.expired;
}

// 알림 설정을 한 줄로 접은 것. 구독 상태와는 무관하게, 설정 자체가 배달을 허용하는지.
export type AlertSummaryKey = 'paused' | 'off' | 'partial' | 'all';

export interface AlertSummary {
  key: AlertSummaryKey;
  label: string;
  // 이 설정으로 메일이 나갈 수 있는지. 실제 발송은 여기에 좌석까지 있어야 한다.
  delivering: boolean;
}

export function alertSummary(input: { activeCount: number; total: number; paused: boolean }): AlertSummary {
  if (input.paused) return { key: 'paused', label: '일시중지', delivering: false };
  if (input.activeCount <= 0) return { key: 'off', label: '모두 꺼짐', delivering: false };
  if (input.activeCount >= input.total) return { key: 'all', label: '모두 켜짐', delivering: true };
  return { key: 'partial', label: `${input.activeCount}/${input.total} 켜짐`, delivering: true };
}
