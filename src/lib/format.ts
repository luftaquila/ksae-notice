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
