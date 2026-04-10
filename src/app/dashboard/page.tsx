'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';
import ToggleSwitch from '@/components/ToggleSwitch';

interface Subscription {
  id: number;
  category: string;
  isActive: number;
  expiresAt: string;
  renewedAt: string | null;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSubs = async () => {
    try {
      const res = await fetch('/api/subscriptions');
      const data = await res.json();
      setSubs(data.subscriptions || []);
    } catch {
      setError('구독 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubs();
  }, []);

  const subscribeAll = async () => {
    setActionLoading('subscribe_all');
    setError(null);
    try {
      let hasError = false;
      for (const cat of SUBSCRIPTION_CATEGORIES) {
        const sub = subs.find((s) => s.category === cat.id);
        if (!sub?.isActive) {
          const res = await fetch('/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat.id }),
          });
          if (!res.ok) hasError = true;
        }
      }
      await fetchSubs();
      if (hasError) setError('일부 구독에 실패했습니다.');
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

  const renewAll = async () => {
    setActionLoading('renew');
    setError(null);

    try {
      const res = await fetch('/api/subscriptions/renew', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '갱신에 실패했습니다.');
      }
      await fetchSubs();
    } catch {
      setError('갱신에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteAccount = async () => {
    if (!confirm('정말 탈퇴하시겠습니까? 모든 구독 정보가 삭제됩니다.')) return;

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
  const isDecember = now.getMonth() === 11;
  const hasActiveSubs = subs.some((s) => s.isActive);
  const expiresAt = subs.find((s) => s.isActive)?.expiresAt;
  const isExpired = expiresAt ? new Date(expiresAt) < now : false;
  const showRenewal = hasActiveSubs && (isDecember || isExpired);

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
      {hasActiveSubs && expiresAt && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400">
          {isExpired ? (
            <span className="font-medium text-red-600 dark:text-red-400">구독이 만료되었습니다</span>
          ) : (
            <>구독 만료일: <span className="font-medium text-gray-900 dark:text-gray-100">{expiresAt.slice(0, 10)}</span></>
          )}
        </div>
      )}

      {/* Renewal banner */}
      {showRenewal && (
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

      <div className="mt-4 text-center">
        {!hasActiveSubs ? (
          <button
            onClick={subscribeAll}
            disabled={actionLoading === 'subscribe_all'}
            className="text-sm px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-300 hover:text-blue-500 active:border-blue-300 active:text-blue-500 dark:hover:border-blue-500/50 dark:hover:text-blue-400 dark:active:border-blue-500/50 dark:active:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
          >
            {actionLoading === 'subscribe_all' ? '처리 중...' : '전체 구독'}
          </button>
        ) : showRenewal ? (
          <button
            onClick={renewAll}
            disabled={actionLoading === 'renew'}
            className="text-sm px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:border-amber-300 hover:text-amber-500 active:border-amber-300 active:text-amber-500 dark:hover:border-amber-500/50 dark:hover:text-amber-400 dark:active:border-amber-500/50 dark:active:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
          >
            {actionLoading === 'renew' ? '갱신 중...' : `${currentYear + 1}년까지 구독 갱신`}
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
      </div>

      <div className="mt-8 px-5 py-4 rounded-lg bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">안내사항</div>
        <ul className="list-disc list-outside pl-5 text-sm text-gray-500 dark:text-gray-400 space-y-1.5 leading-relaxed">
          <li>매일 발송 가능한 이메일 수가 한정되어 있습니다.
            <ul className="list-disc list-outside pl-5 mt-1.5 space-y-1.5">
              <li>하루에 3개 이상의 공지가 올라오는 경우 나중 공지는 알림이 누락될 수 있습니다.</li>
              <li>졸업 등으로 알림이 불필요한 경우 구독을 해제해 주세요.</li>
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
