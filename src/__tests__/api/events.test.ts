import { describe, it, expect } from 'vitest';
import { emitCrawlFinished } from '@/lib/crawler/events';

const { GET } = await import('@/app/api/events/route');

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value, done } = await reader.read();
  return { text: value ? new TextDecoder().decode(value) : '', done };
}

describe('GET /api/events', () => {
  it('streams a crawl event when a crawl finishes, and closes when the client goes away', async () => {
    const controller = new AbortController();
    const res = await GET(new Request('http://localhost/api/events', { signal: controller.signal }));

    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();

    // 첫 줄은 재접속 간격.
    expect((await readChunk(reader)).text).toContain('retry: 5000');

    emitCrawlFinished();
    const { text } = await readChunk(reader);
    expect(text).toContain('event: crawl');
    expect(JSON.parse(text.split('data: ')[1].trim()).at).toBeTruthy();

    controller.abort();
    expect((await readChunk(reader)).done).toBe(true);
  });
});
