'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';
import { Skeleton } from '@/components/ui';
import type { AdminStats, Payment, Settings, UserAction, UserInfo } from './types';
import OverviewTab from './OverviewTab';
import UsersTab from './UsersTab';
import PaymentsTab from './PaymentsTab';
import SettingsTab from './SettingsTab';

// 관리자 화면은 네 탭이다. 한 페이지에 다 펼쳐 놓았을 때는 설정 열한 칸이 두 번째 블록을
// 차지하고 가장 자주 보는 유저 표가 맨 아래에 있었다. 탭은 URL 해시에 둬서 새로고침해도,
// 링크를 넘겨도 같은 탭이 열린다.
const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'users', label: '유저' },
  { id: 'payments', label: '결제' },
  { id: 'settings', label: '설정' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// 탭 상태는 URL 해시 그 자체다. 서버 렌더에서는 첫 탭으로 그리고, 브라우저에서 해시를 읽는다.
function readTabFromHash(): TabId {
  const fromHash = window.location.hash.slice(1);
  return TABS.some((t) => t.id === fromHash) ? (fromHash as TabId) : 'overview';
}
function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const DEFAULT_SETTINGS: Settings = {
  maxSubscribers: '50',
  registrationOpen: 'true',
  maxEmailsPerUserPerDay: '2',
  subscriptionPrice: '1000',
  bizName: '',
  bizOwner: '',
  bizRegNo: '',
  bizMailOrderNo: '',
  bizAddress: '',
  bizTel: '',
  bizEmail: '',
};

export default function AdminPage() {
  const { data: session } = useSession();
  const tab = useSyncExternalStore(subscribeHash, readTabFromHash, () => 'overview' as TabId);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [brevoRemaining, setBrevoRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // replaceState 는 hashchange 를 내지 않으므로 직접 알린다. 뒤로가기 히스토리는 쌓지 않는다.
  const selectTab = (id: TabId) => {
    window.history.replaceState(null, '', `#${id}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  // 자료마다 읽는 함수를 따로 둔다. 조작 뒤에는 건드린 것만 다시 읽어 표 전체가 깜빡이지
  // 않게 — 예전에는 무엇을 눌러도 fetchAll() 이 loading 을 다시 켜서 페이지가 통째로
  // 언마운트됐고, 그래서 스크롤이 맨 위로 튀었다. loading 은 첫 로드에만 쓴다.
  // 실패는 각자 상단 배너에 적는다 — 넷 중 하나가 막혀도 나머지 탭은 쓸 수 있어야 한다.
  const loadFailed = (what: string) => setError(`${what}을 불러오지 못했습니다.`);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setUsers(data.users || []);
    } catch {
      loadFailed('유저 목록');
    }
  }, []);
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setStats(data);
    } catch {
      loadFailed('통계');
    }
  }, []);
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setSettings((prev) => ({ ...prev, ...data }));
    } catch {
      loadFailed('설정');
    }
  }, []);
  const fetchPayments = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/payments');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setPayments(data.payments || []);
    } catch {
      loadFailed('결제 내역');
    }
  }, []);
  const fetchBrevo = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/brevo');
      const data = await res.json();
      setBrevoRemaining(data.remaining);
    } catch {
      // 잔량은 부가 정보다. 못 읽으면 '...' 로 남는다.
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchUsers(), fetchStats(), fetchSettings(), fetchPayments()]).finally(() => setLoading(false));
    fetchBrevo();
  }, [fetchUsers, fetchStats, fetchSettings, fetchPayments, fetchBrevo]);

  // 실패 문구를 돌려준다(성공이면 null). 표시는 부른 쪽이 그 자리에서 한다.
  const patchUser = async (userId: number, action: UserAction, category?: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, category }),
      });
      const data = await res.json().catch(() => null);
      await Promise.all([fetchUsers(), fetchStats()]);
      return res.ok ? null : data?.error || '요청에 실패했습니다.';
    } catch {
      return '요청에 실패했습니다.';
    }
  };

  // 나이스페이 취소가 성립한 뒤에야 구독 기간이 되돌아간다. 실패하면 아무것도 바뀌지 않는다.
  const cancelPayment = async (orderId: string, reason: string): Promise<{ error?: string; notice?: string }> => {
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, reason }),
      });
      const data = await res.json().catch(() => null);
      await Promise.all([fetchPayments(), fetchUsers(), fetchStats()]);
      if (!res.ok) return { error: data?.error || '결제 취소에 실패했습니다.' };
      if (data?.rolledBack === false) {
        return { notice: '취소는 되었지만 이후 결제가 기간을 더 늘려두어 만료일은 그대로 두었습니다. 직접 확인해주세요.' };
      }
      return {};
    } catch {
      return { error: '결제 취소에 실패했습니다.' };
    }
  };

  const saveSettings = async (next: Settings): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) return '설정 저장에 실패했습니다.';
      await Promise.all([fetchSettings(), fetchStats()]);
      return null;
    } catch {
      return '설정 저장에 실패했습니다.';
    }
  };

  const sendTestEmail = async (): Promise<string> => {
    try {
      const res = await fetch('/api/admin/test-email', { method: 'POST' });
      if (res.ok) return '테스트 메일을 보냈습니다.';
      const data = await res.json().catch(() => null);
      return `발송 실패: ${data?.error || res.status}`;
    } catch {
      return '발송 실패';
    }
  };

  const pendingPayments = payments.filter((p) => p.status === 'pending').length;
  const tabCount: Partial<Record<TabId, number>> = {
    users: users.filter((u) => !u.deletedAt).length,
    payments: pendingPayments || undefined,
  };

  if (loading) {
    return (
      <div className="max-w-screen-xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-10 w-80 mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">관리자</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-sm rounded-lg">{error}</div>
      )}

      <nav className="mb-6 flex gap-1 border-b border-gray-200 dark:border-gray-800" role="tablist">
        {TABS.map((t) => {
          const active = tab === t.id;
          const count = tabCount[t.id];
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(t.id)}
              className={`-mb-px flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-t ${
                active
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
              {count !== undefined && (
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                  t.id === 'payments'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === 'overview' && (
        <OverviewTab
          stats={stats}
          brevoRemaining={brevoRemaining}
          maxSubscribers={parseInt(settings.maxSubscribers, 10) || 0}
          onTestEmail={sendTestEmail}
        />
      )}
      {tab === 'users' && (
        <UsersTab
          users={users}
          maxSubscribers={parseInt(settings.maxSubscribers, 10) || 0}
          adminEmail={session?.user?.email ?? null}
          onPatch={patchUser}
        />
      )}
      {tab === 'payments' && <PaymentsTab payments={payments} onCancel={cancelPayment} />}
      {tab === 'settings' && <SettingsTab settings={settings} onSave={saveSettings} />}
    </div>
  );
}
