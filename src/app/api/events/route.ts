import { onCrawlFinished } from '@/lib/crawler/events';

// SSE. 크롤이 끝날 때마다 `crawl` 이벤트 한 줄을 흘린다. 페이지는 이걸 받고 통계·글 목록을
// 다시 읽는다. 25초마다 주석 한 줄을 보내 프록시가 놀고 있는 연결을 끊지 않게 한다.
// 인증 없음 — 메인 페이지가 공개고, 실리는 내용도 "끝났다" 는 시각 하나다.
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          open = false;
        }
      };

      // 브라우저 EventSource 의 재접속 간격.
      send('retry: 5000\n\n');

      const off = onCrawlFinished((event) => send(`event: crawl\ndata: ${JSON.stringify(event)}\n\n`));
      const beat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);

      cleanup = () => {
        if (!open) return;
        open = false;
        clearInterval(beat);
        off();
        try {
          controller.close();
        } catch {
          // 이미 닫힘
        }
      };
      request.signal.addEventListener('abort', cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
