import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { adminCancel } from '@/lib/payment/flow';
import { listOrders, type PaymentRow } from '@/lib/payment/orders';

// 관리자 화면용. 취소에 필요한 값까지 싣되 원문 JSON 은 뺀다.
function adminView(row: PaymentRow) {
  return {
    orderId: row.orderId,
    userId: row.userId,
    userEmail: row.userEmail,
    goodsName: row.goodsName,
    targetYear: row.targetYear,
    amount: row.amount,
    status: row.status,
    method: row.method,
    tid: row.tid,
    grantedFrom: row.grantedFrom,
    grantedTo: row.grantedTo,
    failReason: row.failReason,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    cancelledAt: row.cancelledAt,
  };
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ payments: listOrders(undefined, 200).map(adminView) });
}

// 전액 취소. 나이스페이 취소가 성립한 뒤에만 구독 기간을 되돌린다.
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  // 나이스페이 취소사유는 100자까지다.
  const reason = (typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : '관리자 취소').slice(0, 100);

  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
  }

  const result = await adminCancel(orderId, reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, rolledBack: result.rolledBack });
}
