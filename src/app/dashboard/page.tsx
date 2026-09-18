'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { ACCOUNT_DELETE_CONFIRMATION, SUBSCRIPTION_CATEGORIES } from '@/lib/constants';
import { canPurchase, renewalPrompt, renewalTargetYear } from '@/lib/subscription/period';
import { subscriptionStatus, type SubscriptionStatusKey } from '@/lib/subscription/status';
import { formatCalendarDate, formatLocalDateTime } from '@/lib/format';
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
  expired: '미완료',
};

// 상태 배지의 옷. 판정은 lib/subscription/status 가 하고 여기는 색만 고른다 —
// 관리자 화면·서버 집계와 같은 함수라 이 배지가 "수신 중" 이면 실제로 메일이 간다.
const STATUS_STYLE: Record<SubscriptionStatusKey, { dot: string; badge: string }> = {
  receiving: {
    dot: 'bg-green-500',
    badge: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
  },
  unpaid: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  },
  paused: {
    dot: 'bg-gray-400',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  inactive: {
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  },
  // 탈퇴한 계정은 이 화면에 들어오지 못한다. 타입을 채우기 위한 값이다.
  withdrawn: {
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  },
};

// 오류는 일으킨 자리 옆에 보인다. 맨 위 배너 하나로 모으면 아래쪽 토글이 실패했을
// 때 화면 밖에서 조용히 뜬다. scope 는 'load' | 'pay' | 'cta' | 'bulk' | 카테고리 id.
interface ScopedError {
  scope: string;
  message: string;
}

const BUTTON_PRIMARY =
  'text-sm px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const BUTTON_GHOST =
  'text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-blue-300 hover:text-blue-500 active:border-blue-300 active:text-blue-500 dark:hover:border-blue-500/50 dark:hover:text-blue-400 dark:active:border-blue-500/50 dark:active:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const BUTTON_GHOST_DANGER =
  'text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-300 hover:text-red-500 active:border-red-300 active:text-red-500 dark:hover:border-red-500/50 dark:hover:text-red-400 dark:active:border-red-500/50 dark:active:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-800 ${className}`} />;
}

function InlineError({ message, className = '' }: { message: string; className?: string }) {
  return <p className={`text-sm text-red-600 dark:text-red-400 ${className}`}>{message}</p>;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [subs, setSubs] = useState<Subscription[]>([]);
  // One expiry for the whole account, not one per category.
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  // 구독료 0원. 버튼 문구와 결제창 호출 여부가 여기서 갈린다.
  const [free, setFree] = useState(false);
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<ScopedError | null>(null);
  // 전체 끄기는 되돌릴 수 있지만 여덟 개가 한 번에 꺼진다. 브라우저 confirm 대신
  // 버튼 자리에서 한 번 더 묻는다.
  const [confirmingUnsubscribeAll, setConfirmingUnsubscribeAll] = useState(false);
  // 주문번호는 환불 문의에만 쓰인다. 펼친 행에서만 보이고, 복사 버튼을 붙인다.
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [copiedOrder, setCopiedOrder] = useState<string | null>(null);
  // 탈퇴는 확인 문구를 그대로 쳐야 한다. 오류도 그 카드 안에서 보여준다.
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchSubs = async () => {
    try {
      const res = await fetch('/api/subscriptions');
      const data = await res.json();
      setSubs(data.subscriptions || []);
      setExpiresAt(data.expiresAt ?? null);
      setPrice(data.price ?? null);
      setFree(!!data.free);
      setPaymentEnabled(!!data.paymentEnabled);
    } catch {
      setError({ scope: 'load', message: '구독 정보를 불러오는데 실패했습니다.' });
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
    // 둘을 같이 기다린다 — 구독만 먼저 그리면 결제 내역이 뒤늦게 튀어나와 화면이 밀린다.
    Promise.all([fetchSubs(), fetchPayments()]).finally(() => setLoading(false));
  }, []);

  // 전체 켬·끔은 왕복 한 번이다. scope 는 어느 버튼에서 눌렀는지 — 오류가 그 옆에 뜬다.
  const setAll = async (active: boolean, scope: 'bulk' | 'cta') => {
    setActionLoading(active ? 'subscribe_all' : 'unsubscribe_all');
    setError(null);
    setConfirmingUnsubscribeAll(false);
    try {
      const res = await fetch('/api/subscriptions/all', { method: active ? 'POST' : 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError({ scope, message: data?.error || '요청에 실패했습니다.' });
      }
      await fetchSubs();
    } catch {
      setError({ scope, message: '요청에 실패했습니다.' });
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
        const data = await res.json().catch(() => null);
        setError({ scope: categoryId, message: data?.error || '요청에 실패했습니다.' });
      } else {
        await fetchSubs();
      }
    } catch {
      setError({ scope: categoryId, message: '요청에 실패했습니다.' });
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

      // 무료 구독은 서버가 주문을 그 자리에서 확정해 돌려준다. 결제창은 없다.
      if (order.free) {
        await Promise.all([fetchSubs(), fetchPayments()]);
        return;
      }

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
        fnError: (cause: { errorMsg?: string; resultMsg?: string }) => {
          setError({ scope: 'pay', message: cause?.errorMsg || cause?.resultMsg || '결제를 진행하지 못했습니다.' });
        },
      });
    } catch (cause) {
      setError({ scope: 'pay', message: cause instanceof Error ? cause.message : '결제를 시작하지 못했습니다.' });
    } finally {
      setActionLoading(null);
    }
  };

  const copyOrderId = async (orderId: string) => {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopiedOrder(orderId);
      setTimeout(() => setCopiedOrder((current) => (current === orderId ? null : current)), 1500);
    } catch {
      // 클립보드가 막힌 환경(권한 거부 등)에서는 번호가 보이는 채로 두면 된다.
    }
  };

  // 확인 문구를 그대로 쳐야 버튼이 살아나므로, 그 위에 confirm() 을 한 번 더 두지 않는다.
  const deleteAccount = async () => {
    if (deleteConfirmation !== ACCOUNT_DELETE_CONFIRMATION) return;

    setActionLoading('delete');
    setDeleteError(null);
    try {
      const res = await fetch('/api/user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      if (res.ok) {
        signOut({ callbackUrl: '/' });
      } else {
        const data = await res.json().catch(() => null);
        setDeleteError(data?.error || '탈퇴에 실패했습니다.');
      }
    } catch {
      setDeleteError('탈퇴에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">구독 관리</h1>
        <Skeleton className="h-16 mb-6" />
        <Skeleton className="h-36 mb-6" />
        <Skeleton className="h-4 w-24 mb-2 ml-1" />
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          {SUBSCRIPTION_CATEGORIES.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between px-4 py-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const activeCount = subs.filter((s) => s.isActive === 1).length;
  const hasActiveSubs = activeCount > 0;

  // 상태는 두 축의 곱이다: 켜진 카테고리가 있는지 × 결제된 기간이 남았는지.
  // 서버의 정원 집계와 같은 판정이라, 여기서 "수신 중" 이면 실제로 메일이 나간다.
  const status = subscriptionStatus(
    { deletedAt: null, subscriptionExpiresAt: expiresAt, hasActiveCategory: hasActiveSubs },
    now,
  );
  const covered = status.key === 'receiving' || status.key === 'paused';
  const style = STATUS_STYLE[status.key];

  // Shared with the payment order route, so the label below cannot promise a
  // year the server will not write.
  const { show: showRenewal } = renewalPrompt(now, expiresAt, hasActiveSubs);
  const targetYear = renewalTargetYear(now, expiresAt);
  // 기간이 없거나 지났을 때, 그리고 12월에 올해로 끝나는 기간만 결제 대상이다.
  // 서버의 주문 라우트와 같은 규칙이라 버튼이 있으면 주문도 열려 있다.
  const canPay = canPurchase(now, expiresAt);
  const coveredThroughNextYear = !!expiresAt && Number(expiresAt.slice(0, 4)) > currentYear;
  const expiryLabel = expiresAt ? formatCalendarDate(expiresAt) : null;
  const priceLabel = price === null ? '' : free ? ' · 무료' : ` · ${price.toLocaleString('ko-KR')}원`;

  // 무료일 때 "미결제" 는 틀린 말이다. 결제할 것이 없으니 신청만 남았다.
  const payVerb = free ? '구독을 신청하기' : '결제하기';
  const statusLabel = free ? status.label.replace('미결제', '미신청') : status.label;

  let headline: string;
  let detail: string;
  switch (status.key) {
    case 'receiving':
      headline = `${activeCount}개 카테고리의 알림을 받고 있습니다`;
      detail = showRenewal
        ? `구독이 ${expiryLabel}에 만료됩니다. 지금 갱신하면 ${targetYear}년 말까지 이어집니다.`
        : coveredThroughNextYear
          ? `${expiryLabel}까지 구독 중입니다.`
          : `${expiryLabel}까지 구독 중입니다. 갱신은 12월부터 가능합니다.`;
      break;
    case 'paused':
      headline = '켜진 카테고리가 없습니다';
      detail = `${expiryLabel}까지 구독 중이지만 알림을 받을 카테고리가 없어 메일이 발송되지 않습니다.`;
      break;
    case 'unpaid':
      headline = expiresAt ? '구독이 만료되었습니다' : '아직 구독을 시작하지 않았습니다';
      detail = `카테고리 ${activeCount}개가 켜져 있지만, ${payVerb} 전까지 알림 메일이 발송되지 않습니다.`;
      break;
    default:
      headline = expiresAt ? '구독이 만료되었고 켜진 카테고리가 없습니다' : '아직 구독을 시작하지 않았습니다';
      detail = `카테고리를 켜고 ${payVerb} 전까지 알림 메일이 발송되지 않습니다.`;
  }

  // 이 상태에서 해야 할 단 하나의 행동. 못 살 때도 버튼은 보이되 눌리지 않는다 —
  // 버튼이 사라지면 "왜 없지" 를 묻게 된다.
  let cta: React.ReactNode = null;
  if (status.key === 'paused') {
    cta = (
      <button onClick={() => setAll(true, 'cta')} disabled={actionLoading === 'subscribe_all'} className={BUTTON_PRIMARY}>
        {actionLoading === 'subscribe_all' ? '처리 중...' : '전체 켜기'}
      </button>
    );
  } else if (canPay) {
    cta = paymentEnabled ? (
      <button onClick={startPayment} disabled={actionLoading === 'pay'} className={BUTTON_PRIMARY}>
        {actionLoading === 'pay'
          ? free
            ? '신청하는 중...'
            : '결제창 여는 중...'
          : `${targetYear}년까지 구독${priceLabel}`}
      </button>
    ) : (
      <span className="text-sm text-gray-500 dark:text-gray-400">결제가 준비되지 않았습니다.</span>
    );
  } else if (!coveredThroughNextYear) {
    cta = (
      <button disabled title="갱신은 12월부터 가능합니다" className={BUTTON_PRIMARY}>
        {targetYear}년까지 갱신
      </button>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">구독 관리</h1>

      {/* 누구의 구독인지. */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
        {session?.user?.image ? (
          // 외부 이미지라 next/image 최적화 대상이 아니다.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.user.image} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded-full" />
        ) : (
          <span className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 text-sm font-semibold flex items-center justify-center" aria-hidden="true">
            {Array.from(session?.user?.name || session?.user?.email || '?')[0]}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {session?.user?.name || session?.user?.email}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{session?.user?.email}</div>
        </div>
      </div>

      {error?.scope === 'load' && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-sm rounded-lg">
          {error.message}
        </div>
      )}

      {/* 상태 카드. 예전의 만료일 상자·갱신 배너·결제 버튼이 여기 한 장으로 접혔다. */}
      <section className="mb-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
            {statusLabel}
          </span>
          {expiryLabel && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {covered ? '만료일' : '만료됨'}{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">{expiryLabel}</span>
            </span>
          )}
        </div>
        <h2 className="mt-3 text-lg font-bold text-gray-900 dark:text-gray-100">{headline}</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{detail}</p>
        {cta && <div className="mt-4">{cta}</div>}
        {(error?.scope === 'pay' || error?.scope === 'cta') && <InlineError message={error.message} className="mt-2" />}
      </section>

      {/* 카테고리 토글. "구독" 은 결제된 기간을 뜻하므로 여기서는 켠다·끈다로 부른다. */}
      <section>
        <div className="mb-2 px-1 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">알림 카테고리</h2>
            {!covered && (
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{payVerb} 전에는 켜 두어도 발송되지 않습니다.</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {confirmingUnsubscribeAll ? (
              <>
                <span className="text-xs text-gray-500 dark:text-gray-400">모두 끌까요?</span>
                <button onClick={() => setAll(false, 'bulk')} className={BUTTON_GHOST_DANGER}>끄기</button>
                <button onClick={() => setConfirmingUnsubscribeAll(false)} className={BUTTON_GHOST}>취소</button>
              </>
            ) : hasActiveSubs ? (
              <button
                onClick={() => setConfirmingUnsubscribeAll(true)}
                disabled={actionLoading === 'unsubscribe_all'}
                className={BUTTON_GHOST_DANGER}
              >
                {actionLoading === 'unsubscribe_all' ? '처리 중...' : '전체 끄기'}
              </button>
            ) : (
              <button
                onClick={() => setAll(true, 'bulk')}
                disabled={actionLoading === 'subscribe_all'}
                className={BUTTON_GHOST}
              >
                {actionLoading === 'subscribe_all' ? '처리 중...' : '전체 켜기'}
              </button>
            )}
          </div>
        </div>
        {error?.scope === 'bulk' && <InlineError message={error.message} className="mb-2 px-1" />}

        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          {SUBSCRIPTION_CATEGORIES.map((cat) => {
            const sub = subs.find((s) => s.category === cat.id);
            const isActive = sub?.isActive === 1;
            const pending = actionLoading === cat.id;

            return (
              <div key={cat.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {cat.label.replace('공지 - ', '')}
                    {pending && <Spinner />}
                  </div>
                  <ToggleSwitch
                    checked={isActive}
                    onChange={() => toggleSubscription(cat.id, isActive)}
                    disabled={pending}
                  />
                </div>
                {error?.scope === cat.id && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error.message}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Payment history */}
      {payments.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700 dark:text-gray-300">결제 내역</h2>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
            {payments.map((payment) => {
              const expanded = expandedOrder === payment.orderId;
              return (
                <div key={payment.orderId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{payment.goodsName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatLocalDateTime(payment.approvedAt || payment.cancelledAt || payment.createdAt)}
                        {' · '}
                        {PAYMENT_STATUS[payment.status] || payment.status}
                        {' · '}
                        <button
                          type="button"
                          onClick={() => setExpandedOrder(expanded ? null : payment.orderId)}
                          className="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
                        >
                          {expanded ? '주문번호 숨기기' : '주문번호'}
                        </button>
                      </div>
                      {payment.status === 'failed' && payment.failReason && (
                        <div className="text-xs text-red-500 dark:text-red-400 mt-0.5">{payment.failReason}</div>
                      )}
                    </div>
                    <div
                      className={`text-sm font-semibold shrink-0 ${
                        payment.status === 'paid'
                          ? 'text-gray-900 dark:text-gray-100'
                          : payment.status === 'pending'
                            ? 'text-gray-500 dark:text-gray-400'
                            : 'text-gray-400 dark:text-gray-500 line-through'
                      }`}
                    >
                      {payment.amount.toLocaleString('ko-KR')}원
                    </div>
                  </div>
                  {expanded && (
                    <div className="mt-2 flex items-center gap-2">
                      <code className="text-[11px] text-gray-500 dark:text-gray-400 break-all">{payment.orderId}</code>
                      <button type="button" onClick={() => copyOrderId(payment.orderId)} className={`${BUTTON_GHOST} shrink-0`}>
                        {copiedOrder === payment.orderId ? '복사됨' : '복사'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            환불은 <a href="/policy" className="underline underline-offset-2">환불규정</a>을 확인한 뒤 주문번호와 함께 문의해 주세요.
          </div>
        </section>
      )}

      {/* Account deletion (not for admin) */}
      {!session?.user?.isAdmin && (
        <div className="mt-10 rounded-lg border border-red-200 dark:border-red-500/30 bg-white dark:bg-gray-900 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">계정 관리</div>
          <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">회원 탈퇴</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            탈퇴하면 구독 정보와 남은 구독 기간이 즉시 소멸되며 환불되지 않습니다.
            재가입 여부 확인에 필요한 계정 식별 정보와 결제 기록은 남습니다.
            진행 중인 결제가 있으면 끝난 뒤에 탈퇴할 수 있습니다.
          </p>
          <label className="block mt-4 text-sm text-gray-600 dark:text-gray-300">
            계속하려면 <b>{ACCOUNT_DELETE_CONFIRMATION}</b>를 입력하세요.
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => {
                setDeleteConfirmation(e.target.value);
                setDeleteError(null);
              }}
              autoComplete="off"
              placeholder={ACCOUNT_DELETE_CONFIRMATION}
              className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </label>
          {deleteError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">{deleteError}</p>
          )}
          <button
            onClick={deleteAccount}
            disabled={actionLoading === 'delete' || deleteConfirmation !== ACCOUNT_DELETE_CONFIRMATION}
            className="mt-3 text-sm px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 active:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === 'delete' ? '처리 중...' : '회원 탈퇴'}
          </button>
        </div>
      )}
    </div>
  );
}
