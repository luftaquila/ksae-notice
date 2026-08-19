'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';
import { renewalPrompt, renewalTargetYear } from '@/lib/subscription/period';
import { formatLocalDateTime } from '@/lib/format';
import ToggleSwitch from '@/components/ToggleSwitch';

interface Subscription {
  id: number;
  category: string;
  isActive: number;
}

interface Payment {
  orderId: string;
  goodsName: string;
  targetYear: number;
  amount: number;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  cancelledAt: string | null;
  failReason: string | null;
}

// 결제창은 layout.tsx 가 붙인 나이스페이 SDK 가 심어준다.
declare global {
  interface Window {
    AUTHNICE?: { requestPay: (options: Record<string, unknown>) => void };
  }
}

const PAYMENT_STATUS: Record<string, string> = {
  pending: '결제 진행 중',
  paid: '결제 완료',
  failed: '결제 실패',
  cancelled: '결제 취소',
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const [subs, setSubs] = useState<Subscription[]>([]);
  // One expiry for the whole account, not one per category.
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSubs = async () => {
    try {
      const res = await fetch('/api/subscriptions');
      const data = await res.json();
      setSubs(data.subscriptions || []);
      setExpiresAt(data.expiresAt ?? null);
      setPrice(data.price ?? null);
      setPaymentEnabled(!!data.paymentEnabled);
    } catch {
      setError('구독 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
    try {
      const res = await fetch('/api/payments');
      if (!res.ok) return;
      const data = await res.json();
      setPayments(data.payments || []);
    } catch {
      // 결제 내역은 부가 정보다. 구독 관리 자체를 막지 않는다.
    }
  };

  useEffect(() => {
    fetchSubs();
    fetchPayments();
  }, []);

  const subscribeAll = async () => {
    setActionLoading('subscribe_all');
    setError(null);
    try {
      // Keep the first server-side reason — for a user who is not subscribed
      // to anything yet, every category fails for the same reason and it is
      // the only useful message.
      let failure: string | null = null;
      for (const cat of SUBSCRIPTION_CATEGORIES) {
        const sub = subs.find((s) => s.category === cat.id);
        if (!sub?.isActive) {
          const res = await fetch('/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat.id }),
          });
          if (!res.ok && !failure) {
            const data = await res.json().catch(() => null);
            failure = data?.error || '일부 구독에 실패했습니다.';
          }
        }
      }
      await fetchSubs();
      if (failure) setError(failure);
    } catch {
      setError('요청에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const unsubscribeAll = async () => {
    if (!confirm('모든 카테고리의 구독을 해제하시겠습니까?')) return;
    setActionLoading('unsubscribe_all');
    setError(null);
    try {
      let hasError = false;
      for (const cat of SUBSCRIPTION_CATEGORIES) {
        const sub = subs.find((s) => s.category === cat.id);
        if (sub?.isActive) {
          const res = await fetch('/api/subscriptions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat.id }),
          });
          if (!res.ok) hasError = true;
        }
      }
      await fetchSubs();
      if (hasError) setError('일부 구독 해제에 실패했습니다.');
    } catch {
      setError('요청에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSubscription = async (categoryId: string, currentlyActive: boolean) => {
    setActionLoading(categoryId);
    setError(null);

    try {
      const res = await fetch('/api/subscriptions', {
        method: currentlyActive ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '요청에 실패했습니다.');
      } else {
        await fetchSubs();
      }
    } catch {
      setError('요청에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // 금액과 대상 연도는 서버가 정한다. 여기서 만드는 값은 아무것도 없다.
  const startPayment = async () => {
    setActionLoading('pay');
    setError(null);

    try {
      const res = await fetch('/api/payments/orders', { method: 'POST' });
      const order = await res.json();
      if (!res.ok) throw new Error(order.error || '결제를 시작하지 못했습니다.');
      if (!window.AUTHNICE) {
        throw new Error('결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
      }

      // 결제창이 열리고, 인증이 끝나면 서버의 returnUrl 로 넘어간다.
      // fnError 는 SDK 가 필수로 요구한다 — 함수가 아니면 requestPay 가 바로 거부한다.
      // 결제창을 띄우지도 못한 경우만 여기로 오고, 인증 이후의 실패는 returnUrl 로 간다.
      window.AUTHNICE.requestPay({
        clientId: order.clientId,
        method: order.method,
        orderId: order.orderId,
        amount: order.amount,
        goodsName: order.goodsName,
        returnUrl: order.returnUrl,
        buyerName: order.buyerName ?? undefined,
        buyerEmail: order.buyerEmail,
        fnError: (error: { errorMsg?: string; resultMsg?: string }) => {
          setError(error?.errorMsg || error?.resultMsg || '결제를 진행하지 못했습니다.');
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '결제를 시작하지 못했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteAccount = async () => {
    if (!confirm('정말 탈퇴하시겠습니까? 구독 정보와 남은 구독 기간이 삭제되며 환불되지 않습니다.')) return;

    setActionLoading('delete');
    try {
      const res = await fetch('/api/user', { method: 'DELETE' });
      if (res.ok) {
        signOut({ callbackUrl: '/' });
      } else {
        const data = await res.json();
        setError(data.error || '탈퇴에 실패했습니다.');
      }
    } catch {
      setError('탈퇴에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-400 dark:text-gray-500">불러오는 중...</div>
    );
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const hasActiveSubs = subs.some((s) => s.isActive);
  // Shared with the payment order route, so the label below cannot promise a
  // year the server will not write.
  const { show: showRenewal, isExpired } = renewalPrompt(now, expiresAt, hasActiveSubs);
  const targetYear = renewalTargetYear(now, expiresAt);
  // 결제된 기간이 없거나 올해로 끝나면 결제할 것이 남아 있다. 이미 내년 이후까지
  // 덮여 있으면 지금 살 이유가 없으므로 버튼을 내린다.
  const canPay = !expiresAt || Number(expiresAt.slice(0, 4)) <= currentYear;
  const priceLabel = price === null ? '' : ` · ${price.toLocaleString('ko-KR')}원`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">구독 관리</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{session?.user?.email}</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Expiry info */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400">
        {!expiresAt ? (
          <span className="font-medium text-amber-600 dark:text-amber-400">
            아직 결제하지 않았습니다. 결제해야 알림 메일이 발송됩니다.
          </span>
        ) : isExpired ? (
          <span className="font-medium text-red-600 dark:text-red-400">
            구독이 만료되었습니다. 결제 전까지 알림 메일이 발송되지 않습니다.
          </span>
        ) : (
          <>구독 만료일: <span className="font-medium text-gray-900 dark:text-gray-100">{expiresAt.slice(0, 10)}</span></>
        )}
      </div>

      {/* Renewal banner */}
      {showRenewal && expiresAt && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg">
          <div className="font-medium text-amber-800 dark:text-amber-400">구독 갱신 안내</div>
          <div className="text-sm text-amber-600 dark:text-amber-500 mt-1">
            {isExpired
              ? '구독이 만료되었습니다. 아래 버튼을 눌러 갱신하세요.'
              : `현재 구독은 ${currentYear}년 12월 31일에 만료됩니다. 아래 버튼을 눌러 갱신하세요.`}
          </div>
        </div>
      )}

      {/* Subscription toggles */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        {SUBSCRIPTION_CATEGORIES.map((cat) => {
          const sub = subs.find((s) => s.category === cat.id);
          const isActive = sub?.isActive === 1;

          return (
            <div
              key={cat.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{cat.label.replace('공지 - ', '')}</div>
              <ToggleSwitch
                checked={isActive}
                onChange={() => toggleSubscription(cat.id, isActive)}
                disabled={actionLoading === cat.id}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {!hasActiveSubs ? (
          <button
            onClick={subscribeAll}
            disabled={actionLoading === 'subscribe_all'}
            className="text-sm px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-300 hover:text-blue-500 active:border-blue-300 active:text-blue-500 dark:hover:border-blue-500/50 dark:hover:text-blue-400 dark:active:border-blue-500/50 dark:active:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
          >
            {actionLoading === 'subscribe_all' ? '처리 중...' : '전체 구독'}
          </button>
        ) : (
          <button
            onClick={unsubscribeAll}
            disabled={actionLoading === 'unsubscribe_all'}
            className="text-sm px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:border-red-300 hover:text-red-500 active:border-red-300 active:text-red-500 dark:hover:border-red-500/50 dark:hover:text-red-400 dark:active:border-red-500/50 dark:active:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
          >
            {actionLoading === 'unsubscribe_all' ? '처리 중...' : '전체 구독 해제'}
          </button>
        )}

        {paymentEnabled && canPay && (
          <button
            onClick={startPayment}
            disabled={actionLoading === 'pay'}
            className="text-sm px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
          >
            {actionLoading === 'pay' ? '결제창 여는 중...' : `${targetYear}년까지 구독${priceLabel}`}
          </button>
        )}
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="mt-8">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">결제 내역</div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
            {payments.map((payment) => (
              <div key={payment.orderId} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{payment.goodsName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatLocalDateTime(payment.approvedAt || payment.cancelledAt || payment.createdAt)}
                    {' · '}
                    {PAYMENT_STATUS[payment.status] || payment.status}
                  </div>
                  {payment.status === 'failed' && payment.failReason && (
                    <div className="text-xs text-red-500 dark:text-red-400 mt-0.5">{payment.failReason}</div>
                  )}
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 break-all">{payment.orderId}</div>
                </div>
                <div
                  className={`text-sm font-semibold shrink-0 ${
                    payment.status === 'paid'
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-400 dark:text-gray-500 line-through'
                  }`}
                >
                  {payment.amount.toLocaleString('ko-KR')}원
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            환불은 <a href="/policy" className="underline underline-offset-2">환불규정</a>을 확인한 뒤 주문번호와 함께 문의해 주세요.
          </div>
        </div>
      )}

      <div className="mt-8 px-5 py-4 rounded-lg bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">안내사항</div>
        <ul className="list-disc list-outside pl-5 text-sm text-gray-500 dark:text-gray-400 space-y-1.5 leading-relaxed">
          <li>카테고리 선택은 무료이며, 알림 메일은 구독 기간이 남아 있을 때만 발송됩니다.</li>
          <li>매일 발송 가능한 이메일 수가 한정되어 있습니다.
            <ul className="list-disc list-outside pl-5 mt-1.5 space-y-1.5">
              <li>하루에 3개 이상의 공지가 올라오는 경우 알림이 누락될 수 있습니다.</li>
              <li>졸업 등으로 알림이 불필요한 경우 후배들을 위해 구독을 해제해 주세요.</li>
            </ul>
          </li>
          <li>구독은 매년 12월 31일에 만료되며, 12월에 갱신 안내 메일이 발송됩니다.</li>
        </ul>
      </div>

      {/* Account deletion (not for admin) */}
      {!session?.user?.isAdmin && (
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={deleteAccount}
            disabled={actionLoading === 'delete'}
            className="text-sm text-red-400 hover:text-red-600 active:text-red-600 dark:hover:text-red-300 dark:active:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
          >
            {actionLoading === 'delete' ? '처리 중...' : '회원 탈퇴'}
          </button>
        </div>
      )}
    </div>
  );
}
