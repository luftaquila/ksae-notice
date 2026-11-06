// 발송 한도 관련 설정값의 해석. 서버(lib/email/sender)와 관리자 화면이 같이 쓰므로 DB 를 모른다.

// Brevo 잔량 중 새 글 알림에 쓰지 않고 남겨 두는 몫의 기본값 — 테스트 메일, 갱신 안내 같은 것.
// 관리자 설정 `brevoReserve` 가 덮는다.
export const DEFAULT_BREVO_RESERVE = 30;

// 0 이상의 정수만 받는다. 비었거나 숫자가 아니면 기본값.
export function parseBrevoReserve(value: string | null | undefined): number {
  if (value === null || value === undefined || value.trim() === '') return DEFAULT_BREVO_RESERVE;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_BREVO_RESERVE;
}
