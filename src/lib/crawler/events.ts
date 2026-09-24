import { EventEmitter } from 'node:events';

// 크롤이 끝났음을 열린 페이지들에 알리는 통로. 메인 페이지는 /api/events(SSE)로 이걸 받아
// 통계와 글 목록을 다시 읽는다 — 크롤을 도는 게 이 서버 자신이라 "바뀌었나" 를 클라이언트가
// 물어볼 이유가 없다.
//
// 커스텀 서버(server.ts → tsx 소스)와 Next 가 번들한 라우트 핸들러는 같은 프로세스지만
// 모듈 그래프가 따로라, 모듈 스코프에 둔 인스턴스는 둘로 갈린다. 전역 심볼 레지스트리의
// 키로 globalThis 에 하나만 두어 양쪽이 같은 emitter 를 본다.
const KEY = Symbol.for('ksae-notice.crawlEvents');

function emitter(): EventEmitter {
  const store = globalThis as typeof globalThis & { [KEY]?: EventEmitter };
  if (!store[KEY]) {
    const created = new EventEmitter();
    created.setMaxListeners(0); // 열린 탭 하나가 리스너 하나다.
    store[KEY] = created;
  }
  return store[KEY];
}

export interface CrawlFinished {
  at: string;
}

export function emitCrawlFinished(): void {
  emitter().emit('crawl', { at: new Date().toISOString() } satisfies CrawlFinished);
}

// 구독 해제 함수를 돌려준다.
export function onCrawlFinished(listener: (event: CrawlFinished) => void): () => void {
  const target = emitter();
  target.on('crawl', listener);
  return () => target.off('crawl', listener);
}
