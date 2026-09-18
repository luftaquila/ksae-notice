'use client';

import { Fragment, useMemo, useState } from 'react';
import { formatLocalDateTime } from '@/lib/format';
import { Badge, BUTTON_DANGER, BUTTON_GHOST, Card, INPUT, TD, TH, type BadgeTone } from '@/components/ui';
import type { Payment } from './types';

const PAYMENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: '진행 중', tone: 'amber' },
  paid: { label: '완료', tone: 'green' },
  failed: { label: '실패', tone: 'red' },
  cancelled: { label: '취소', tone: 'gray' },
  expired: { label: '미완료', tone: 'gray' },
};

type Filter = 'all' | 'paid' | 'pending' | 'failed' | 'cancelled';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'paid', label: '완료' },
  { id: 'pending', label: '진행 중' },
  { id: 'failed', label: '실패' },
  { id: 'cancelled', label: '취소' },
];

export default function PaymentsTab({
  payments,
  onCancel,
}: {
  payments: Payment[];
  onCancel: (orderId: string, reason: string) => Promise<{ error?: string; notice?: string }>;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  // 취소 폼이 열린 주문 하나. prompt() 대신 그 행 안에서 사유를 받는다.
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('관리자 취소');
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<{ orderId: string; text: string; tone: 'error' | 'notice' } | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: payments.length, paid: 0, pending: 0, failed: 0, cancelled: 0 };
    for (const p of payments) if (p.status in c && p.status !== 'all') c[p.status as Exclude<Filter, 'all'>] += 1;
    return c;
  }, [payments]);

  const visible = filter === 'all' ? payments : payments.filter((p) => p.status === filter);

  const copy = async (orderId: string) => {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(orderId);
      setTimeout(() => setCopied((c) => (c === orderId ? null : c)), 1500);
    } catch {
      // 클립보드가 막힌 환경이면 번호는 title 로 보인다.
    }
  };

  const confirmCancel = async (orderId: string) => {
    const text = reason.trim();
    if (!text) return;
    setBusy(orderId);
    setRowMessage(null);
    const result = await onCancel(orderId, text.slice(0, 100));
    setBusy(null);
    if (result.error) setRowMessage({ orderId, text: result.error, tone: 'error' });
    else {
      setCancelling(null);
      if (result.notice) setRowMessage({ orderId, text: result.notice, tone: 'notice' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">결제 내역</h2>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            최근 50건. 취소는 나이스페이 전액 취소가 성립한 뒤에만 구독 기간을 결제 직전 값으로 되돌립니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700 dark:hover:border-gray-500'
                }`}
              >
                {f.label} <span className={`tabular-nums ${active ? 'opacity-70' : 'text-gray-400 dark:text-gray-500'}`}>{counts[f.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 가로 스크롤을 만들지 않는다: 구매자 열이 남는 폭을 받아 말줄임하고, 일시·주문번호는
          좁은 화면에서 숨긴다. 상품명은 연도만 남긴다 — 나머지 글자는 모든 행이 같다. */}
      <Card className="overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className={`${TH} pl-4 pt-3`}>구매자</th>
              <th className={`${TH} pt-3 w-16`}>연도</th>
              <th className={`${TH} pt-3 w-24 text-right`}>금액</th>
              <th className={`${TH} pt-3 w-28`}>상태</th>
              <th className={`${TH} pt-3 w-36 hidden sm:table-cell`}>일시</th>
              <th className={`${TH} pt-3 w-24 hidden md:table-cell`}>주문번호</th>
              <th className={`${TH} pt-3 pr-4 w-28`} />
            </tr>
          </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {visible.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">결제 내역이 없습니다.</td></tr>
              )}
              {visible.map((payment) => {
                const status = PAYMENT_STATUS[payment.status] ?? { label: payment.status, tone: 'gray' as BadgeTone };
                const muted = payment.status === 'paid' || payment.status === 'pending' ? '' : 'text-gray-400 dark:text-gray-500';
                const open = cancelling === payment.orderId;
                return (
                  <Fragment key={payment.orderId}>
                    <tr className={open ? 'bg-gray-50 dark:bg-gray-800/40' : ''}>
                      <td className={`${TD} pl-4 font-mono text-xs truncate ${muted}`} title={payment.userEmail}>{payment.userEmail}</td>
                      <td className={`${TD} whitespace-nowrap tabular-nums ${muted}`} title={payment.goodsName}>{payment.targetYear}년</td>
                      <td className={`${TD} whitespace-nowrap text-right tabular-nums ${muted || 'font-medium text-gray-900 dark:text-gray-100'}`}>
                        {payment.amount.toLocaleString('ko-KR')}원
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {payment.status === 'failed' && payment.failReason && (
                          <div className="mt-1 text-xs text-red-500 dark:text-red-400 whitespace-normal">{payment.failReason}</div>
                        )}
                        {payment.status === 'cancelled' && payment.cancelReason && (
                          <div className="mt-1 text-xs text-gray-400 dark:text-gray-500 whitespace-normal">{payment.cancelReason}</div>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-gray-500 dark:text-gray-400 tabular-nums hidden sm:table-cell`}>
                        {formatLocalDateTime(payment.approvedAt || payment.cancelledAt || payment.createdAt)}
                      </td>
                      <td className={`${TD} whitespace-nowrap hidden md:table-cell`}>
                        <button
                          type="button"
                          onClick={() => copy(payment.orderId)}
                          title={payment.orderId}
                          className="font-mono text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
                        >
                          {copied === payment.orderId ? '복사됨' : `${payment.orderId.slice(0, 8)}…`}
                        </button>
                      </td>
                      <td className={`${TD} pr-4 whitespace-nowrap text-right`}>
                        {payment.status === 'paid' && !open && (
                          <button
                            onClick={() => { setCancelling(payment.orderId); setReason('관리자 취소'); setRowMessage(null); }}
                            disabled={busy !== null}
                            className={BUTTON_DANGER}
                          >
                            결제 취소
                          </button>
                        )}
                      </td>
                    </tr>
                    {(open || rowMessage?.orderId === payment.orderId) && (
                      <tr className="bg-gray-50 dark:bg-gray-800/40">
                        <td colSpan={7} className="px-4 pb-4 pt-0">
                          {open && (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">전액 취소 · 사유</span>
                              <input
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                maxLength={100}
                                className={`${INPUT} sm:w-72`}
                                autoFocus
                              />
                              <button
                                onClick={() => confirmCancel(payment.orderId)}
                                disabled={busy !== null || !reason.trim()}
                                className={`${BUTTON_DANGER} border-red-300 text-red-600 dark:border-red-500/50 dark:text-red-400`}
                              >
                                {busy === payment.orderId ? '취소 중...' : '취소 확정'}
                              </button>
                              <button onClick={() => setCancelling(null)} disabled={busy !== null} className={BUTTON_GHOST}>닫기</button>
                            </div>
                          )}
                          {rowMessage?.orderId === payment.orderId && (
                            <p className={`mt-2 text-xs ${rowMessage.tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                              {rowMessage.text}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
        </table>
      </Card>
    </div>
  );
}
