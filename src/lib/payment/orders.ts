// 주문 원장과 상태 전이.
//
// 지급(기간 연장)과 회수(롤백)는 `WHERE status = ?` 조건부 UPDATE 의 changes 로
// 단 한 번만 통과시키고, users 행 변경을 같은 트랜잭션에 넣는다. returnUrl 과
// 웹훅이 같은 승인 건을 동시에 들고 들어와도 기간이 두 번 늘어나지 않는다.

import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { payments, users } from '../db/schema';
import { endOfYear, renewalTargetYear } from '../subscription/period';

export type PaymentRow = typeof payments.$inferSelect;

function dump(payload: unknown): string | null {
  if (payload === null || payload === undefined) return null;
  return JSON.stringify(payload);
}

export function getOrder(orderId: string): PaymentRow | undefined {
  return getDb().select().from(payments).where(eq(payments.orderId, orderId)).get();
}

export function listOrders(userId?: number, limit = 50): PaymentRow[] {
  const db = getDb();
  const query = db.select().from(payments);
  const rows = userId === undefined
    ? query.orderBy(desc(payments.id)).limit(limit).all()
    : query.where(eq(payments.userId, userId)).orderBy(desc(payments.id)).limit(limit).all();
  return rows;
}

export function createOrder(params: {
  userId: number;
  email: string;
  targetYear: number;
  amount: number;
  goodsName: string;
}): PaymentRow {
  const orderId = randomUUID().replace(/-/g, '');
  getDb()
    .insert(payments)
    .values({
      orderId,
      userId: params.userId,
      userEmail: params.email,
      targetYear: params.targetYear,
      amount: params.amount,
      goodsName: params.goodsName,
    })
    .run();
  return getOrder(orderId)!;
}

// pending 주문만 실패로 내린다. 이미 승인된 주문은 건드리지 않는다.
export function failOrder(orderId: string, reason: string, raw?: unknown): void {
  const set: Partial<typeof payments.$inferInsert> = {
    status: 'failed',
    failReason: reason.slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
  if (raw !== undefined) set.rawAuth = dump(raw);

  getDb()
    .update(payments)
    .set(set)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, 'pending')))
    .run();
}

// 승인된 주문을 확정하고 구독 기간을 연장한다. 실제로 연장이 일어났을 때만
// 주문 행을 돌려준다. 이미 처리된 주문이면 null.
export function settleOrder(params: {
  orderId: string;
  tid: string;
  method?: string | null;
  rawApprove: unknown;
  rawAuth?: unknown;
}): PaymentRow | null {
  const db = getDb();
  return db.transaction((tx) => {
    const row = tx.select().from(payments).where(eq(payments.orderId, params.orderId)).get();
    if (!row) return null;

    const now = new Date();
    const set: Partial<typeof payments.$inferInsert> = {
      status: 'paid',
      tid: params.tid,
      method: params.method ?? null,
      rawApprove: dump(params.rawApprove),
      approvedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    if (params.rawAuth !== undefined) set.rawAuth = dump(params.rawAuth);

    const settled = tx
      .update(payments)
      .set(set)
      .where(and(eq(payments.orderId, params.orderId), eq(payments.status, 'pending')))
      .run();

    if (settled.changes === 0) return null;

    const account = tx
      .select({ expiresAt: users.subscriptionExpiresAt })
      .from(users)
      .where(eq(users.id, row.userId))
      .get();

    // 기간은 결제 시점에 다시 계산한다. 주문을 만든 뒤 해를 넘겨 결제하면 주문
    // 당시 안내한 연도가 한 해 어긋나기 때문이다. 규칙은 lib/subscription/period
    // 그대로 — 한 번의 결제는 정확히 한 해를 산다.
    const grantedTo = endOfYear(renewalTargetYear(now, account?.expiresAt ?? null));

    tx.update(users)
      .set({ subscriptionExpiresAt: grantedTo, subscriptionRenewedAt: now.toISOString() })
      .where(eq(users.id, row.userId))
      .run();

    tx.update(payments)
      .set({ grantedFrom: account?.expiresAt ?? null, grantedTo })
      .where(eq(payments.orderId, params.orderId))
      .run();

    return tx.select().from(payments).where(eq(payments.orderId, params.orderId)).get() ?? null;
  }, { behavior: 'immediate' });
}

// 취소된 주문의 기간을 되돌린다. 실제로 취소 처리가 일어났을 때만 결과를 준다.
export function reclaimOrder(params: {
  orderId: string;
  reason: string;
  rawCancel?: unknown;
}): { order: PaymentRow; rolledBack: boolean } | null {
  const db = getDb();
  return db.transaction((tx) => {
    const row = tx.select().from(payments).where(eq(payments.orderId, params.orderId)).get();
    if (!row) return null;

    const now = new Date();
    const cancelled = tx
      .update(payments)
      .set({
        status: 'cancelled',
        cancelReason: params.reason.slice(0, 500),
        rawCancel: dump(params.rawCancel),
        cancelledAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .where(and(eq(payments.orderId, params.orderId), eq(payments.status, 'paid')))
      .run();

    if (cancelled.changes === 0) return null;

    const account = tx
      .select({ expiresAt: users.subscriptionExpiresAt })
      .from(users)
      .where(eq(users.id, row.userId))
      .get();

    // 만료일을 결제 직전 값으로 되돌린다. 그 사이 다른 결제로 기간이 더 늘어난
    // 경우에는 손대지 않는다 — 되돌리면 나중 결제까지 무효로 만들어 버린다.
    // 그때는 관리자가 직접 정리해야 하므로 rolledBack 으로 알린다.
    const rolledBack = !!row.grantedTo && account?.expiresAt === row.grantedTo;
    if (rolledBack) {
      tx.update(users)
        .set({ subscriptionExpiresAt: row.grantedFrom })
        .where(eq(users.id, row.userId))
        .run();
    }

    const order = tx.select().from(payments).where(eq(payments.orderId, params.orderId)).get()!;
    return { order, rolledBack };
  }, { behavior: 'immediate' });
}
