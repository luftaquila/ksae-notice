import { NextRequest, NextResponse } from 'next/server';
import { processWebhook } from '@/lib/payment/flow';

// 승인·취소 비동기 통보. 본문에 "OK" 가 없으면 나이스페이가 실패로 보고
// 재전송하므로, 처리 중 예외는 삼키지 않고 그대로 5xx 로 흘려 재전송을 받는다.
export async function POST(request: NextRequest) {
  const payload = await request.json();
  if (payload && typeof payload === 'object') {
    processWebhook(payload as Record<string, unknown>);
  }
  return new NextResponse('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
