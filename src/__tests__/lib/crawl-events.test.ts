import { describe, it, expect, vi } from 'vitest';

// emitter 는 globalThis 에 하나다. 커스텀 서버와 Next 라우트 번들처럼 모듈 인스턴스가 둘이어도
// 한쪽에서 emit 하면 다른 쪽 리스너가 받아야 한다.
describe('crawl events', () => {
  it('delivers an emit to a listener and stops after unsubscribe', async () => {
    const { emitCrawlFinished, onCrawlFinished } = await import('@/lib/crawler/events');
    const seen: string[] = [];
    const off = onCrawlFinished((e) => seen.push(e.at));

    emitCrawlFinished();
    expect(seen).toHaveLength(1);
    expect(new Date(seen[0]).getTime()).toBeGreaterThan(0);

    off();
    emitCrawlFinished();
    expect(seen).toHaveLength(1);
  });

  it('shares one emitter across module instances', async () => {
    const first = await import('@/lib/crawler/events');
    vi.resetModules();
    const second = await import('@/lib/crawler/events');
    expect(second).not.toBe(first);

    const seen: string[] = [];
    const off = first.onCrawlFinished((e) => seen.push(e.at));
    second.emitCrawlFinished();
    off();

    expect(seen).toHaveLength(1);
  });
});
