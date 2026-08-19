'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { SUBSCRIPTION_CATEGORIES, CATEGORY_COLORS, getCategoryLabel } from '@/lib/constants';
import { formatLocalDateTime } from '@/lib/format';
import ToggleSwitch from '@/components/ToggleSwitch';

interface UserInfo {
  id: number;
  email: string;
  name: string | null;
  createdAt: string;
  deletedAt: string | null;
  subscriptionExpiresAt: string | null;
  subscriptions: { category: string; isActive: number }[];
  emailsSent: number;
  emailsSkipped: number;
}

interface FailedEmail {
  id: number;
  userId: number;
  email: string;
  error: string | null;
  sentAt: string;
}

interface AdminStats {
  totalUsers: number;
  deletedUsers: number;
  activeSubscribers: number;
  totalPosts: number;
  emails: {
    totalSent: number;
    totalFailed: number;
    totalSkipped: number;
    todaySent: number;
    todaySkipped: number;
    recentFailed: FailedEmail[];
  };
  recentCrawls: {
    id: number;
    boardType: string;
    startedAt: string;
    finishedAt: string | null;
    newPostsCount: number;
    status: string;
  }[];
}

interface Settings {
  maxSubscribers: string;
  registrationOpen: string;
  maxEmailsPerUserPerDay: string;
  subscriptionPrice: string;
  bizName: string;
  bizOwner: string;
  bizRegNo: string;
  bizMailOrderNo: string;
  bizAddress: string;
  bizTel: string;
  bizEmail: string;
}

interface Payment {
  orderId: string;
  userEmail: string;
  goodsName: string;
  targetYear: number;
  amount: number;
  status: string;
  method: string | null;
  grantedFrom: string | null;
  grantedTo: string | null;
  failReason: string | null;
  cancelReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  cancelledAt: string | null;
}

const PAYMENT_STATUS: Record<string, string> = {
  pending: '진행 중',
  paid: '완료',
  failed: '실패',
  cancelled: '취소',
};

// 판매자 정보 입력칸. 라벨과 설정 키를 한 곳에 묶어 둔다.
const BUSINESS_FIELDS: [keyof Settings, string][] = [
  ['bizName', '상호'],
  ['bizOwner', '대표자'],
  ['bizRegNo', '사업자등록번호'],
  ['bizMailOrderNo', '통신판매업신고번호'],
  ['bizAddress', '사업장 주소'],
  ['bizTel', '연락처'],
  ['bizEmail', '이메일'],
];

export default function AdminPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [settings, setSettings] = useState<Settings>({
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
  });
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [brevoRemaining, setBrevoRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [usersRes, statsRes, settingsRes, paymentsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/stats'),
        fetch('/api/admin/settings'),
        fetch('/api/admin/payments'),
      ]);
      const usersData = await usersRes.json();
      const statsData = await statsRes.json();
      const settingsData = await settingsRes.json();
      const paymentsData = await paymentsRes.json();
      setUsers(usersData.users || []);
      setStats(statsData);
      setSettings((prev) => ({ ...prev, ...settingsData }));
      setPayments(paymentsData.payments || []);
    } catch {
      setError('데이터 로딩에 실패했습니다.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    fetch('/api/admin/brevo').then((r) => r.json()).then((d) => setBrevoRemaining(d.remaining)).catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) setError('설정 저장에 실패했습니다.');
      await fetchAll();
    } catch {
      setError('설정 저장에 실패했습니다.');
    }
    setSaving(false);
  };

  // 무상 제공이나 계좌이체 처리 같은 예외를 다룰 손잡이. 결제와 같은 규칙으로
  // 한 번에 정확히 한 해를 준다.
  const grantYear = async (userId: number) => {
    if (!confirm('이 유저에게 결제 없이 1년 구독을 부여하시겠습니까?')) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'grant_year' }),
      });
      if (!res.ok) setError('구독 기간 부여에 실패했습니다.');
    } finally {
      await fetchAll();
    }
  };

  const revokePeriod = async (userId: number) => {
    if (!confirm('이 유저의 구독 기간을 회수하시겠습니까? 알림 메일이 중단됩니다.')) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'revoke_period' }),
      });
      if (!res.ok) setError('구독 기간 회수에 실패했습니다.');
    } finally {
      await fetchAll();
    }
  };

  // 나이스페이 취소가 성립한 뒤에야 구독 기간이 되돌아간다. 실패하면 아무것도
  // 바뀌지 않으므로 그대로 다시 시도하면 된다.
  const cancelPayment = async (orderId: string) => {
    const reason = prompt('취소 사유를 입력하세요 (100자 이내)', '관리자 취소');
    if (reason === null || !reason.trim()) return;
    if (!confirm('결제를 전액 취소하고 구독 기간을 되돌립니다. 계속하시겠습니까?')) return;

    setCancelling(orderId);
    setError(null);
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '결제 취소에 실패했습니다.');
      } else if (data.rolledBack === false) {
        setError('취소는 되었지만 이후 결제가 기간을 더 늘려두어 만료일은 그대로 두었습니다. 직접 확인해주세요.');
      }
      await fetchAll();
    } catch {
      setError('결제 취소에 실패했습니다.');
    } finally {
      setCancelling(null);
    }
  };

  const deactivateUser = async (userId: number) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, subscriptions: u.subscriptions.map((s) => ({ ...s, isActive: 0 })) }
          : u,
      ),
    );
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'deactivate' }),
      });
      if (!res.ok) await fetchAll();
    } catch {
      await fetchAll();
    }
  };

  const deleteUser = async (userId: number) => {
    if (!confirm('이 유저를 삭제하시겠습니까? 모든 데이터가 삭제됩니다.')) return;
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'delete' }),
      });
      if (!res.ok) await fetchAll();
    } catch {
      await fetchAll();
    }
  };

  const toggleUserSubscription = async (userId: number, category: string, currentlyActive: boolean) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        const existing = u.subscriptions.find((s) => s.category === category);
        if (existing) {
          return {
            ...u,
            subscriptions: u.subscriptions.map((s) =>
              s.category === category ? { ...s, isActive: currentlyActive ? 0 : 1 } : s,
            ),
          };
        }
        return {
          ...u,
          subscriptions: [...u.subscriptions, { category, isActive: 1 }],
        };
      }),
    );
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          action: currentlyActive ? 'unsubscribe' : 'subscribe',
          category,
        }),
      });
      if (!res.ok) await fetchAll();
    } catch {
      await fetchAll();
    }
  };

  const subscribeAll = async (userId: number) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        return {
          ...u,
          subscriptions: SUBSCRIPTION_CATEGORIES.map((cat) => ({
            category: cat.id,
            isActive: 1,
          })),
        };
      }),
    );
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'subscribe_all' }),
      });
      if (!res.ok) await fetchAll();
    } catch {
      await fetchAll();
    }
  };

  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const sendTestEmail = async () => {
    setSendingTestEmail(true);
    try {
      const res = await fetch('/api/admin/test-email', { method: 'POST' });
      if (res.ok) {
        alert('테스트 메일이 발송되었습니다.');
      } else {
        const data = await res.json();
        alert(`발송 실패: ${data.error}`);
      }
    } catch {
      alert('발송 실패');
    }
    setSendingTestEmail(false);
  };

  if (loading) {
    return <div className="max-w-screen-xl mx-auto px-4 py-12 text-center text-gray-400 dark:text-gray-500">불러오는 중...</div>;
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">관리자 대시보드</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-sm rounded-lg">{error}</div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <StatCard label="활성/비활성/탈퇴/전체" value={`${stats?.activeSubscribers ?? 0}/${(stats?.totalUsers ?? 0) - (stats?.activeSubscribers ?? 0) - (stats?.deletedUsers ?? 0)}/${stats?.deletedUsers ?? 0}/${stats?.totalUsers ?? 0}`} />
        <StatCard label="오늘 생략" value={stats?.emails.todaySkipped ?? 0} />
        <StatCard label="오늘 발송" value={stats?.emails.todaySent ?? 0} />
        <StatCard label="Brevo 잔량" value={brevoRemaining ?? '...'} />
      </div>

      {/* Email stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">누적 발송 성공</div>
          <div className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">{stats?.emails.totalSent ?? 0}건</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">누적 발송 생략</div>
          <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{stats?.emails.totalSkipped ?? 0}건</div>
        </div>
        <button
          onClick={() => setShowFailedModal(true)}
          className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 text-left hover:border-red-300 active:border-red-300 dark:hover:border-red-500/50 dark:active:border-red-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer"
        >
          <div className="text-sm text-gray-500 dark:text-gray-400">누적 발송 실패</div>
          <div className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{stats?.emails.totalFailed ?? 0}건</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">클릭하여 상세 보기</div>
        </button>
      </div>

      {/* Failed email modal */}
      {showFailedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowFailedModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">최근 발송 실패</h2>
              <button onClick={() => setShowFailedModal(false)} className="text-gray-400 hover:text-gray-600 active:text-gray-600 dark:hover:text-gray-300 dark:active:text-gray-300 text-xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">&times;</button>
            </div>
            <div className="overflow-auto p-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-800">
                    <th className="pb-2 pr-4 whitespace-nowrap w-[1%]">시각</th>
                    <th className="pb-2 pr-4 whitespace-nowrap w-[1%]">이메일</th>
                    <th className="pb-2 whitespace-nowrap">에러</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {(!stats?.emails.recentFailed || stats.emails.recentFailed.length === 0) && (
                    <tr><td colSpan={3} className="py-4 text-center text-gray-400 dark:text-gray-500">실패 기록 없음</td></tr>
                  )}
                  {stats?.emails.recentFailed?.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-4 text-gray-400 dark:text-gray-500 whitespace-nowrap">
                        {new Date(log.sentAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">{log.email}</td>
                      <td className="py-2 text-red-600 dark:text-red-400 text-xs">{log.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">설정</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_auto_1fr] gap-4 sm:items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">최대 구독자 수</label>
            <input
              type="number"
              value={settings.maxSubscribers}
              onChange={(e) => setSettings({ ...settings, maxSubscribers: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">연간 구독료 (원)</label>
            <input
              type="number"
              min={1000}
              value={settings.subscriptionPrice}
              onChange={(e) => setSettings({ ...settings, subscriptionPrice: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">유저별 일일 최대 발송</label>
            <input
              type="number"
              value={settings.maxEmailsPerUserPerDay}
              onChange={(e) => setSettings({ ...settings, maxEmailsPerUserPerDay: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">신규 구독 접수</label>
            <div className="flex items-center gap-3 h-[38px]">
              <ToggleSwitch
                checked={settings.registrationOpen === 'true'}
                onChange={() =>
                  setSettings({
                    ...settings,
                    registrationOpen: settings.registrationOpen === 'true' ? 'false' : 'true',
                  })
                }
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {settings.registrationOpen === 'true' ? '접수 중' : '중단됨'}
              </span>
            </div>
          </div>
          <div className="sm:text-right flex gap-2 sm:justify-end">
            <button
              onClick={sendTestEmail}
              disabled={sendingTestEmail}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-lg hover:bg-gray-200 active:bg-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
            >
              {sendingTestEmail ? '발송 중...' : '테스트 메일'}
            </button>
            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
            >
              {saving ? '저장 중...' : '설정 저장'}
            </button>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">판매자 정보 (전자상거래 고지)</div>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            /policy 페이지에 그대로 표시됩니다. 비워두면 &quot;미등록&quot;으로 나옵니다.
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BUSINESS_FIELDS.map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                <input
                  type="text"
                  maxLength={200}
                  value={settings[key]}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payments */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">결제 내역</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          취소는 나이스페이 전액 취소를 요청하고, 성공했을 때만 구독 기간을 결제 직전 값으로 되돌립니다.
        </p>
        {payments.length === 0 ? (
          <div className="text-sm text-gray-400 dark:text-gray-500">결제 내역이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-800">
                  <th className="pb-2 pr-4 whitespace-nowrap">구매자</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">상품</th>
                  <th className="pb-2 pr-4 whitespace-nowrap text-right">금액</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">상태</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">일시</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">주문번호</th>
                  <th className="pb-2 whitespace-nowrap w-[1%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {payments.map((payment) => (
                  <tr key={payment.orderId} className={payment.status === 'paid' ? '' : 'text-gray-400 dark:text-gray-500'}>
                    <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">{payment.userEmail}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{payment.goodsName}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-right">{payment.amount.toLocaleString('ko-KR')}원</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {PAYMENT_STATUS[payment.status] || payment.status}
                      {payment.status === 'failed' && payment.failReason && (
                        <span className="block text-xs text-red-400 dark:text-red-500">{payment.failReason}</span>
                      )}
                      {payment.status === 'cancelled' && payment.cancelReason && (
                        <span className="block text-xs text-gray-400 dark:text-gray-500">{payment.cancelReason}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {formatLocalDateTime(payment.approvedAt || payment.cancelledAt || payment.createdAt)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-[11px] text-gray-400 dark:text-gray-500 break-all">{payment.orderId}</td>
                    <td className="py-3 whitespace-nowrap">
                      {payment.status === 'paid' && (
                        <button
                          onClick={() => cancelPayment(payment.orderId)}
                          disabled={cancelling === payment.orderId}
                          className="text-xs px-3 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 dark:active:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
                        >
                          {cancelling === payment.orderId ? '취소 중...' : '결제 취소'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent crawls */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">최근 크롤링</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-800">
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%]">게시판</th>
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%]">상태</th>
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%]">시작</th>
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%]">종료</th>
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%] text-center">소요</th>
                <th className="pb-2 whitespace-nowrap">신규</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {stats?.recentCrawls.map((crawl) => (
                <tr key={crawl.id}>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${
                      crawl.boardType === 'notice' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                    }`}>
                      {crawl.boardType === 'notice' ? '공지' : '규정'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs ${
                        crawl.status === 'completed'
                          ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          : crawl.status === 'running'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                      }`}
                    >
                      {crawl.status === 'completed' ? '완료' : crawl.status === 'running' ? '진행 중' : '실패'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {new Date(crawl.startedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  </td>
                  <td className="py-2 pr-4 text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {crawl.finishedAt
                      ? new Date(crawl.finishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                      : '-'}
                  </td>
                  <td className="py-2 pr-4 text-gray-400 dark:text-gray-500 whitespace-nowrap text-center">
                    {crawl.finishedAt
                      ? `${Math.round((new Date(crawl.finishedAt).getTime() - new Date(crawl.startedAt).getTime()) / 1000)}s`
                      : '-'}
                  </td>
                  <td className="py-2 whitespace-nowrap">{crawl.newPostsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User list */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          유저 목록 ({users.length}명)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-800">
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%]">#</th>
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%]">이메일</th>
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%]">이름</th>
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%]">가입일</th>
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%]">만료일</th>
                <th className="pb-2 pr-4 whitespace-nowrap text-center">구독</th>
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%] text-center">발송</th>
                <th className="pb-2 pr-4 whitespace-nowrap w-[1%] text-center">생략</th>
                <th className="pb-2 whitespace-nowrap w-[1%]">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {users.map((user, index) => {
                const isDeleted = !!user.deletedAt;
                const hasActive = user.subscriptions.some((s) => s.isActive);
                return (
                  <tr key={user.id} className={isDeleted ? 'text-gray-300 dark:text-gray-600 line-through' : ''}>
                    <td className="py-3 pr-4 text-gray-400 dark:text-gray-500 whitespace-nowrap">{index + 1}</td>
                    <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">{user.email}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{user.name || '-'}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{user.createdAt.slice(0, 10)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {user.subscriptionExpiresAt ? (
                        user.subscriptionExpiresAt.slice(0, 10)
                      ) : (
                        <span className="text-xs text-amber-500 dark:text-amber-400">미결제</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-center">
                      {isDeleted ? (
                        <span className="text-xs text-gray-300 dark:text-gray-600">탈퇴 ({user.deletedAt!.slice(0, 10)})</span>
                      ) : (
                        <div className="flex justify-center gap-1.5">
                          {SUBSCRIPTION_CATEGORIES.map((cat) => {
                            const sub = user.subscriptions.find((s) => s.category === cat.id);
                            const isActive = sub?.isActive === 1;
                            const label = getCategoryLabel(cat.id);
                            return (
                              <button
                                key={cat.id}
                                onClick={() => toggleUserSubscription(user.id, cat.id, isActive)}
                                className={`text-xs px-2 py-0.5 rounded transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                                  isActive
                                    ? (CATEGORY_COLORS[label]?.chipHover || 'bg-blue-100 text-blue-700 hover:bg-blue-200')
                                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200 active:bg-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700 dark:active:bg-gray-700'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-center">{user.emailsSent}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-center">{user.emailsSkipped}</td>
                    <td className="py-3 whitespace-nowrap">
                      {isDeleted ? null : user.email === session?.user?.email ? (
                        <span className="text-xs text-gray-400 dark:text-gray-500">관리자</span>
                      ) : (
                        <div className="flex gap-1">
                          {hasActive ? (
                            <button
                              onClick={() => deactivateUser(user.id)}
                              className="text-xs px-3 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 dark:active:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 transition cursor-pointer"
                            >
                              구독 중단
                            </button>
                          ) : (
                            <button
                              onClick={() => subscribeAll(user.id)}
                              className="text-xs px-3 py-1 rounded bg-green-50 text-green-600 hover:bg-green-100 active:bg-green-100 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20 dark:active:bg-green-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 transition cursor-pointer"
                            >
                              전체 구독
                            </button>
                          )}
                          {user.subscriptionExpiresAt ? (
                            <button
                              onClick={() => revokePeriod(user.id)}
                              className="text-xs px-3 py-1 rounded bg-amber-50 text-amber-600 hover:bg-amber-100 active:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 dark:active:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 transition cursor-pointer"
                            >
                              기간 회수
                            </button>
                          ) : (
                            <button
                              onClick={() => grantYear(user.id)}
                              className="text-xs px-3 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 dark:active:bg-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer"
                            >
                              1년 부여
                            </button>
                          )}
                          <button
                            onClick={() => deleteUser(user.id)}
                            className="text-xs px-3 py-1 rounded bg-gray-50 text-gray-500 hover:bg-gray-200 active:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</div>
    </div>
  );
}
