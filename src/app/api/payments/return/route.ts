import { NextRequest, NextResponse } from 'next/server';
import { processReturn } from '@/lib/payment/flow';
import { siteOrigin } from '@/lib/payment/origin';

// 결제창 인증 결과. 나이스페이가 브라우저를 통해 form-urlencoded 로 POST 한다.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const fields: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === 'string') fields[key] = value;
  });

  const { orderId, result } = await processReturn(fields);

  const query = new URLSearchParams({ result });
  if (orderId) query.set('order', orderId);

  // 303 이라야 브라우저가 결과 페이지를 GET 으로 가져간다. Location 은 요청 URL
  // 이 아니라 공개 주소로 만든다 — request.url 은 컨테이너 내부 주소다.
  return NextResponse.redirect(`${siteOrigin(request)}/payments/result?${query}`, 303);
}
