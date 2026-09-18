'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { formatLocalDateTime } from '@/lib/format';
import { Badge, BUTTON_DANGER, BUTTON_GHOST, Card, INPUT, TH, type BadgeTone } from '@/components/ui';
import type { Payment } from './types';

// 결제 내역. md 이상은 표(좁은 열은 내용 폭, 구매자·상태가 남는 폭을 나눔), md 미만은 주문마다
// 카드 하나로 쌓는다 — 주문번호까지 전부 보인다. 취소는 prompt() 대신 그 자리에서 사유를 받는다.

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

const TD = 'py-3 pr-4 align-top';

export default function PaymentsTab({
  payments,
  onCancel,
}: {
  payments: Payment[];
  onCancel: (orderId: string, reason: string) => Promise<{ error?: string; notice?: string }>;
}) {
  const [filter, setFilter] = useState<Filter>('all');
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
      // 클립보드가 막힌 환경이면 번호는 그대로 읽을 수 있다.
    }
  };

  const openCancel = (orderId: string) => {
    setCancelling(orderId);
    setReason('관리자 취소');
    setRowMessage(null);
  };

  // 닫기는 폼과 함께 그 행의 메시지도 지운다 — 실패 문구가 폼이 사라진 뒤에도 남아 있었다.
  const closeCancel = () => {
    setCancelling(null);
    setRowMessage(null);
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

  const statusOf = (p: Payment) => PAYMENT_STATUS[p.status] ?? { label: p.status, tone: 'gray' as BadgeTone };
  const reasonOf = (p: Payment): ReactNode =>
    p.status === 'failed' && p.failReason ? (
      <span className="text-xs text-red-500 dark:text-red-400">{p.failReason}</span>
    ) : p.status === 'cancelled' && p.cancelReason ? (
      <span className="text-xs text-gray-400 dark:text-gray-500">{p.cancelReason}</span>
    ) : null;
  const when = (p: Payment) => formatLocalDateTime(p.approvedAt || p.cancelledAt || p.createdAt);
  const orderIdButton = (p: Payment, className = '') => (
    <button
      type="button"
      onClick={() => copy(p.orderId)}
      title="클릭하면 복사"
      className={`font-mono text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer break-all text-left ${className}`}
    >
      {copied === p.orderId ? '복사됨' : p.orderId}
    </button>
  );

  const cancelForm = (p: Payment): ReactNode => {
    const open = cancelling === p.orderId;
    const message = rowMessage?.orderId === p.orderId ? rowMessage : null;
    if (!open && !message) return null;
    return (
      <CancelPanel
        open={open}
        reason={reason}
        onReason={setReason}
        busy={busy === p.orderId}
        message={message}
        onConfirm={() => confirmCancel(p.orderId)}
        onClose={closeCancel}
        onDismiss={() => setRowMessage(null)}
      />
    );
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

      {visible.length === 0 && (
        <Card className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">결제 내역이 없습니다.</Card>
      )}

      {/* md 이상: 표 */}
      {visible.length > 0 && (
        <Card className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className={`${TH} pl-4 pt-3 w-[1%]`}>구매자</th>
                <th className={`${TH} pt-3 w-[1%]`}>연도</th>
                <th className={`${TH} pt-3 w-[1%] text-right`}>금액</th>
                <th className={`${TH} pt-3`}>상태</th>
                <th className={`${TH} pt-3 w-[1%]`}>일시</th>
                <th className={`${TH} pt-3 w-[1%]`}>주문번호</th>
                <th className={`${TH} pt-3 pr-4 w-[1%]`} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {visible.map((p) => {
                const status = statusOf(p);
                const muted = p.status === 'paid' || p.status === 'pending' ? '' : 'text-gray-400 dark:text-gray-500';
                const open = cancelling === p.orderId || rowMessage?.orderId === p.orderId;
                return (
                  <Fragment key={p.orderId}>
                    <tr className={open ? 'bg-gray-50 dark:bg-gray-800/40' : ''}>
                      <td className={`${TD} pl-4 whitespace-nowrap`}>
                        <div className={`font-mono text-xs truncate max-w-[20rem] ${muted}`} title={p.userEmail}>{p.userEmail}</div>
                      </td>
                      <td className={`${TD} whitespace-nowrap tabular-nums ${muted}`} title={p.goodsName}>{p.targetYear}년</td>
                      <td className={`${TD} whitespace-nowrap text-right tabular-nums ${muted || 'font-medium text-gray-900 dark:text-gray-100'}`}>
                        {p.amount.toLocaleString('ko-KR')}원
                      </td>
                      <td className={TD}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge tone={status.tone}>{status.label}</Badge>
                          {reasonOf(p)}
                        </div>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-gray-500 dark:text-gray-400 tabular-nums`}>{when(p)}</td>
                      <td className={`${TD} whitespace-nowrap`}>{orderIdButton(p, 'whitespace-nowrap')}</td>
                      <td className={`${TD} pr-4 whitespace-nowrap text-right`}>
                        {/* 폼이 열려도 버튼 자리는 남긴다 — 빼면 행 높이가 버튼만큼 줄어든다. */}
                        {p.status === 'paid' && (
                          <button
                            onClick={() => openCancel(p.orderId)}
                            disabled={busy !== null}
                            className={`${BUTTON_DANGER} ${cancelling === p.orderId ? 'invisible' : ''}`}
                          >
                            결제 취소
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-gray-50 dark:bg-gray-800/40">
                        <td colSpan={7} className="px-4 py-3">{cancelForm(p)}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* md 미만: 주문마다 카드 */}
      {visible.length > 0 && (
        <div className="md:hidden space-y-3">
          {visible.map((p) => {
            const status = statusOf(p);
            const muted = p.status === 'paid' || p.status === 'pending' ? '' : 'text-gray-400 dark:text-gray-500';
            return (
              <Card key={p.orderId} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className={`min-w-0 font-mono text-xs break-all ${muted || 'text-gray-900 dark:text-gray-100'}`}>{p.userEmail}</div>
                  <Badge tone={status.tone} className="shrink-0">{status.label}</Badge>
                </div>
                <div className={`text-sm tabular-nums ${muted}`}>
                  <span className={muted || 'font-medium text-gray-900 dark:text-gray-100'}>{p.amount.toLocaleString('ko-KR')}원</span>
                  <span className="text-gray-400 dark:text-gray-500">{' · '}{p.targetYear}년{' · '}{when(p)}</span>
                </div>
                {reasonOf(p) && <div>{reasonOf(p)}</div>}
                <div>{orderIdButton(p)}</div>
                {p.status === 'paid' && cancelling !== p.orderId && (
                  <button onClick={() => openCancel(p.orderId)} disabled={busy !== null} className={BUTTON_DANGER}>결제 취소</button>
                )}
                {cancelForm(p)}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 취소 패널. 표에서는 그 행 바로 아래 한 줄이다 — 문구는 왼쪽, 사유 입력과 버튼 둘은 오른쪽
// (결제 취소 버튼이 있던 자리 밑). 좁은 화면(카드)에서는 입력 한 줄, 버튼 한 줄로 쌓인다.
// 닫기는 폼과 문구를 함께 지운다.
export function CancelPanel({
  open,
  reason,
  onReason,
  busy,
  message,
  onConfirm,
  onClose,
  onDismiss,
}: {
  open: boolean;
  reason: string;
  onReason: (value: string) => void;
  busy: boolean;
  message: { text: string; tone: 'error' | 'notice' } | null;
  onConfirm: () => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      {message && (
        <p className={`text-xs sm:mr-auto ${message.tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {message.text}
        </p>
      )}
      {open ? (
        <>
          <input
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            maxLength={100}
            placeholder="취소 사유"
            className={`${INPUT} sm:w-64`}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              onClick={onConfirm}
              disabled={busy || !reason.trim()}
              className={`${BUTTON_DANGER} border-red-300 text-red-600 dark:border-red-500/50 dark:text-red-400`}
            >
              {busy ? '취소 중...' : '전액 취소 확정'}
            </button>
            <button onClick={onClose} disabled={busy} className={BUTTON_GHOST}>닫기</button>
          </div>
        </>
      ) : (
        <button onClick={onDismiss} className={BUTTON_GHOST}>닫기</button>
      )}
    </div>
  );
}
