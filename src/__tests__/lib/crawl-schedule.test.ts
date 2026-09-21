import { describe, it, expect } from 'vitest';
import { CRAWL_CRON, lastCrawlBoundaryAt, nextCrawlAt, refreshAfterMs } from '@/lib/crawler/schedule';

// KST 벽시계로 적고 UTC 로 바꾼다.
const kst = (iso: string) => new Date(`${iso}+09:00`);

describe('nextCrawlAt', () => {
  it('matches the cron the scheduler runs', () => {
    expect(CRAWL_CRON).toBe('*/5 7-18 * * *');
  });

  it('is the next five-minute boundary inside the window', () => {
    expect(nextCrawlAt(kst('2026-09-21T16:02:10')).toISOString()).toBe(kst('2026-09-21T16:05:00').toISOString());
    expect(nextCrawlAt(kst('2026-09-21T16:54:59')).toISOString()).toBe(kst('2026-09-21T16:55:00').toISOString());
  });

  // 정확히 경계인 순간의 크롤은 이미 시작됐다. 부르는 쪽은 그 다음을 알고 싶다.
  it('skips a boundary that is exactly now', () => {
    expect(nextCrawlAt(kst('2026-09-21T07:05:00.000')).toISOString()).toBe(kst('2026-09-21T07:10:00').toISOString());
  });

  it('rolls an hour over', () => {
    expect(nextCrawlAt(kst('2026-09-21T09:57:00')).toISOString()).toBe(kst('2026-09-21T10:00:00').toISOString());
  });

  it('waits for 07:00 before the window opens', () => {
    expect(nextCrawlAt(kst('2026-09-21T06:30:00')).toISOString()).toBe(kst('2026-09-21T07:00:00').toISOString());
    expect(nextCrawlAt(kst('2026-09-21T06:59:30')).toISOString()).toBe(kst('2026-09-21T07:00:00').toISOString());
    expect(nextCrawlAt(kst('2026-09-21T00:10:00')).toISOString()).toBe(kst('2026-09-21T07:00:00').toISOString());
  });

  // 18:55 가 마지막 실행이다. 그 뒤로는 다음 날 07:00.
  it('jumps to the next morning after the last run of the day', () => {
    expect(nextCrawlAt(kst('2026-09-21T18:54:00')).toISOString()).toBe(kst('2026-09-21T18:55:00').toISOString());
    expect(nextCrawlAt(kst('2026-09-21T18:55:00')).toISOString()).toBe(kst('2026-09-22T07:00:00').toISOString());
    expect(nextCrawlAt(kst('2026-09-21T18:57:00')).toISOString()).toBe(kst('2026-09-22T07:00:00').toISOString());
    expect(nextCrawlAt(kst('2026-09-21T23:30:00')).toISOString()).toBe(kst('2026-09-22T07:00:00').toISOString());
  });

  it('crosses a month boundary', () => {
    expect(nextCrawlAt(kst('2026-09-30T20:00:00')).toISOString()).toBe(kst('2026-10-01T07:00:00').toISOString());
  });
});

describe('lastCrawlBoundaryAt', () => {
  it('is the boundary at or before now inside the window', () => {
    expect(lastCrawlBoundaryAt(kst('2026-09-21T16:07:10')).toISOString()).toBe(kst('2026-09-21T16:05:00').toISOString());
    expect(lastCrawlBoundaryAt(kst('2026-09-21T16:05:00.000')).toISOString()).toBe(kst('2026-09-21T16:05:00').toISOString());
  });

  it('is the last run of the day outside the window', () => {
    expect(lastCrawlBoundaryAt(kst('2026-09-21T20:00:00')).toISOString()).toBe(kst('2026-09-21T18:55:00').toISOString());
    expect(lastCrawlBoundaryAt(kst('2026-09-21T03:00:00')).toISOString()).toBe(kst('2026-09-20T18:55:00').toISOString());
  });
});

// 서버 시계로 정하는 "다음에 언제 읽을지".
describe('refreshAfterMs', () => {
  it('asks again shortly while the crawl due at the last boundary has not finished', () => {
    // 16:05:02 — 16:05 크롤이 아직 안 끝났다(마지막 완료는 16:00).
    expect(refreshAfterMs(kst('2026-09-21T16:05:02'), kst('2026-09-21T16:00:00.7').toISOString())).toBe(5_000);
    expect(refreshAfterMs(kst('2026-09-21T16:05:02'), null)).toBe(5_000);
  });

  it('waits for the next boundary once the due crawl has finished', () => {
    // 16:05:07 — 16:05 크롤 완료. 다음은 16:10:02.
    const now = kst('2026-09-21T16:05:07');
    expect(refreshAfterMs(now, kst('2026-09-21T16:05:00.6').toISOString()))
      .toBe(kst('2026-09-21T16:10:00').getTime() - now.getTime() + 2_000);
  });

  // 크롤러가 죽어 있으면 5초마다 두드리지 않고 다음 경계로 넘어간다.
  it('stops short retries a minute after a missed crawl', () => {
    const now = kst('2026-09-21T16:06:30');
    expect(refreshAfterMs(now, kst('2026-09-21T15:55:00').toISOString()))
      .toBe(kst('2026-09-21T16:10:00').getTime() - now.getTime() + 2_000);
  });

  it('sleeps until the morning at night', () => {
    const now = kst('2026-09-21T22:00:00');
    expect(refreshAfterMs(now, kst('2026-09-21T18:55:00.5').toISOString()))
      .toBe(kst('2026-09-22T07:00:00').getTime() - now.getTime() + 2_000);
  });
});
