import { NextResponse } from 'next/server';
import { getBusinessInfo, getSubscriptionPrice } from '@/lib/payment/pricing';
import { MIN_CARD_AMOUNT } from '@/lib/payment/nicepay';

// 전자상거래 고지 정보와 판매가. 하단정보와 메인 안내문이 이걸 읽으므로 인증 없이 연다.
// 페이지가 정적으로 미리 그려지면 빌드 시점 값이 박히니, 값은 이 라우트로만 내보낸다.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    business: getBusinessInfo(),
    price: getSubscriptionPrice(),
    minAmount: MIN_CARD_AMOUNT,
  });
}
