// SQLite `datetime('now')` 는 "2026-08-19 09:15:00", JS `toISOString()` 는
// "2026-08-19T09:15:00.000Z" 로 저장된다. 둘 다 UTC 인데 앞의 형태에는 존
// 표시가 없어, 그대로 Date 에 넣으면 브라우저가 로컬 시각으로 읽어 KST 기준
// 9시간이 밀린다. 존을 붙여 UTC 로 못박은 뒤 로컬로 옮긴다.
export function formatLocalDateTime(value: string): string {
  const hasZone = value.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(value);
  const normalized = value.replace(' ', 'T') + (hasZone ? '' : 'Z');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 구독 만료일은 "그 해 12월 31일" 이라는 달력 날짜를 UTC 자정 직전(…T23:59:59.000Z)
// 으로 저장한 값이다. 로컬 시각으로 옮기면 KST 에서는 다음 해 1월 1일 08:59 가 되어
// 한 해가 밀려 보인다. 그래서 날짜는 ISO 앞 열 글자를 그대로 읽는다 —
// lib/subscription/period 가 연도를 비교하는 방식과 같다.
export function formatCalendarDate(value: string): string {
  return value.slice(0, 10);
}
