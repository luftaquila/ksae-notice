import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listOrders, type PaymentRow } from '@/lib/payment/orders';
import { getSubscriptionPrice } from '@/lib/payment/pricing';
import { isConfigured } from '@/lib/payment/nicepay';

// 사용자에게 보이는 결제 내역. 거래키와 원문은 내보내지 않는다.
// 실패 사유는 본인 주문에 대한 안내문이라 그대로 보여준다.
function publicView(row: PaymentRow) {
  return {
    orderId: row.orderId,
    goodsName: row.goodsName,
    targetYear: row.targetYear,
    amount: row.amount,
    status: row.status,
    method: row.method,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    cancelledAt: row.cancelledAt,
    failReason: row.failReason,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    payments: listOrders(session.user.id).map(publicView),
    price: getSubscriptionPrice(),
    enabled: isConfigured(),
  });
}
