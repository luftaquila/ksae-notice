'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';

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

    for (const sub of subs.filter((s) => s.isActive)) {
      try {
        await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: sub.category }),
        });
      } catch {}
    }

    await fetchSubs();
    setActionLoading(null);
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
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-400">불러오는 중...</div>
    );
  }

  const currentYear = new Date().getFullYear();
  const isDecember = new Date().getMonth() === 11;
  const hasActiveSubs = subs.some((s) => s.isActive);
  const expiresAt = subs.find((s) => s.isActive)?.expiresAt;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">구독 관리</h1>
      <p className="text-sm text-gray-500 mb-6">
        {session?.user?.email} 계정으로 로그인됨
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Expiry info */}
      {hasActiveSubs && expiresAt && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
          구독 만료일: <span className="font-medium text-gray-900">{expiresAt.slice(0, 10)}</span>
        </div>
      )}

      {/* Renewal banner */}
      {isDecember && hasActiveSubs && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium text-amber-800">구독 갱신 안내</div>
              <div className="text-sm text-amber-600 mt-1">
                현재 구독은 {currentYear}년 12월 31일에 만료됩니다. 아래 버튼을 눌러 갱신하세요.
              </div>
            </div>
            <button
              onClick={renewAll}
              disabled={actionLoading === 'renew'}
              className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
            >
              {actionLoading === 'renew' ? '갱신 중...' : '전체 갱신'}
            </button>
          </div>
        </div>
      )}

      {/* Subscription toggles */}
      <div className="space-y-3">
        {SUBSCRIPTION_CATEGORIES.map((cat) => {
          const sub = subs.find((s) => s.category === cat.id);
          const isActive = sub?.isActive === 1;

          return (
            <div
              key={cat.id}
              className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200"
            >
              <div className="font-medium text-gray-900">{cat.label}</div>
              <button
                onClick={() => toggleSubscription(cat.id, isActive)}
                disabled={actionLoading === cat.id}
                className={`relative w-12 h-6 rounded-full transition ${
                  isActive ? 'bg-blue-600' : 'bg-gray-300'
                } ${actionLoading === cat.id ? 'opacity-50' : ''}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    isActive ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-sm text-gray-400 text-center">
        구독은 매년 12월 31일에 만료되며, 12월에 갱신 안내 메일이 발송됩니다.
      </div>

      {/* Account deletion */}
      <div className="mt-12 pt-6 border-t border-gray-200">
        <button
          onClick={deleteAccount}
          disabled={actionLoading === 'delete'}
          className="text-sm text-red-400 hover:text-red-600 transition disabled:opacity-50"
        >
          {actionLoading === 'delete' ? '처리 중...' : '회원 탈퇴'}
        </button>
      </div>
    </div>
  );
}
