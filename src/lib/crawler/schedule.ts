// 크롤 일정 한 곳. 스케줄러의 cron 식과 "다음 크롤은 언제인가" 계산이 같은 파일에
// 있어야 둘이 어긋나지 않는다 — 메인 페이지가 다음 크롤 직후에 통계를 다시 읽는 데 쓴다.

// 5분마다, 07:00 ~ 18:55 KST (19시 전 마지막 실행이 18:55).
export const CRAWL_CRON = '*/5 7-18 * * *';
export const CRAWL_TIMEZONE = 'Asia/Seoul';

const STEP_MINUTES = 5;
const FIRST_HOUR = 7;
const LAST_HOUR_EXCLUSIVE = 19;
// 한국은 DST 가 없어 고정 오프셋으로 충분하다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// now 보다 뒤인 첫 크롤 시각. 지금이 정확히 경계(07:05:00.000)여도 그 다음 경계를 준다 —
// 그 순간의 크롤은 이미 시작됐고, 부르는 쪽은 "그 다음에 언제 다시 읽을지" 를 알고 싶다.
export function nextCrawlAt(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const mo = kst.getUTCMonth();
  const d = kst.getUTCDate();
  let hour = kst.getUTCHours();
  let minute = (Math.floor(kst.getUTCMinutes() / STEP_MINUTES) + 1) * STEP_MINUTES;
  if (minute >= 60) {
    minute = 0;
    hour += 1;
  }

  let wall: number;
  if (hour < FIRST_HOUR) wall = Date.UTC(y, mo, d, FIRST_HOUR, 0);
  else if (hour >= LAST_HOUR_EXCLUSIVE) wall = Date.UTC(y, mo, d + 1, FIRST_HOUR, 0);
  else wall = Date.UTC(y, mo, d, hour, minute);

  return new Date(wall - KST_OFFSET_MS);
}

// now 이하인 가장 최근 경계 — 지금 돌고 있어야 할(또는 방금 돌았을) 크롤의 시각.
// 창 밖이면 마지막 실행(18:55)이다: 새벽이면 어제, 저녁이면 오늘.
export function lastCrawlBoundaryAt(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const mo = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const hour = kst.getUTCHours();
  const minute = Math.floor(kst.getUTCMinutes() / STEP_MINUTES) * STEP_MINUTES;

  let wall: number;
  if (hour < FIRST_HOUR) wall = Date.UTC(y, mo, d - 1, LAST_HOUR_EXCLUSIVE - 1, 60 - STEP_MINUTES);
  else if (hour >= LAST_HOUR_EXCLUSIVE) wall = Date.UTC(y, mo, d, LAST_HOUR_EXCLUSIVE - 1, 60 - STEP_MINUTES);
  else wall = Date.UTC(y, mo, d, hour, minute);

  return new Date(wall - KST_OFFSET_MS);
}

// 크롤이 늦어도 이 시간까지만 짧게 되묻는다. 크롤러가 죽어 있을 때 5초마다 두드리지 않게.
const LATE_CRAWL_GRACE_MS = 60_000;
const DUE_RETRY_MS = 5_000;
const AFTER_BOUNDARY_MS = 2_000;

// 통계를 다시 읽을 때까지 기다릴 시간. 서버 시계로 정하므로 클라이언트 시계가 틀려도
// 상관없다. 직전 경계의 크롤이 아직 안 끝났으면(마지막 완료가 그 경계보다 앞이면) 잠깐 뒤에
// 다시, 끝났으면 다음 경계 직후에.
export function refreshAfterMs(now: Date, lastFinishedAt: string | null): number {
  const due = lastCrawlBoundaryAt(now);
  const lateBy = now.getTime() - due.getTime();
  const dueDone = lastFinishedAt !== null && new Date(lastFinishedAt).getTime() >= due.getTime();
  if (!dueDone && lateBy >= 0 && lateBy < LATE_CRAWL_GRACE_MS) return DUE_RETRY_MS;
  return nextCrawlAt(now).getTime() - now.getTime() + AFTER_BOUNDARY_MS;
}
