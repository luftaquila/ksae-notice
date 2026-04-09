'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';

interface UserInfo {
  id: number;
  email: string;
  name: string | null;
  createdAt: string;
  subscriptions: { category: string; isActive: number; expiresAt: string }[];
  emailsSent: number;
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
  activeSubscribers: number;
  totalPosts: number;
  emails: {
    totalSent: number;
    totalFailed: number;
    todaySent: number;
    dailyLimit: number;
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
}

export default function AdminPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [settings, setSettings] = useState<Settings>({ maxSubscribers: '50', registrationOpen: 'true' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [usersRes, statsRes, settingsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/stats'),
        fetch('/api/admin/settings'),
      ]);
      const usersData = await usersRes.json();
      const statsData = await statsRes.json();
      const settingsData = await settingsRes.json();
      setUsers(usersData.users || []);
      setStats(statsData);
      setSettings(settingsData);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      await fetchAll();
    } catch {}
    setSaving(false);
  };

  const deactivateUser = async (userId: number) => {
    // Optimistic update
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, subscriptions: u.subscriptions.map((s) => ({ ...s, isActive: 0 })) }
          : u,
      ),
    );
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'deactivate' }),
      });
    } catch {
      await fetchAll();
    }
  };

  const deleteUser = async (userId: number) => {
    if (!confirm('이 유저를 삭제하시겠습니까? 모든 데이터가 삭제됩니다.')) return;
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'delete' }),
      });
    } catch {
      await fetchAll();
    }
  };

  const toggleUserSubscription = async (userId: number, category: string, currentlyActive: boolean) => {
    // Optimistic update
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
          subscriptions: [
            ...u.subscriptions,
            { category, isActive: 1, expiresAt: `${new Date().getFullYear()}-12-31T23:59:59.000Z` },
          ],
        };
      }),
    );
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          action: currentlyActive ? 'unsubscribe' : 'subscribe',
          category,
        }),
      });
    } catch {
      await fetchAll();
    }
  };

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-12 text-center text-gray-400">불러오는 중...</div>;
  }

  const catLabel = (id: string) => SUBSCRIPTION_CATEGORIES.find((c) => c.id === id)?.label || id;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">관리자 대시보드</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="전체 유저" value={stats?.totalUsers ?? 0} />
        <StatCard label="활성 구독자" value={stats?.activeSubscribers ?? 0} />
        <StatCard label="총 게시글" value={stats?.totalPosts ?? 0} />
        <StatCard
          label="오늘 발송"
          value={`${stats?.emails.todaySent ?? 0} / ${stats?.emails.dailyLimit ?? 300}`}
        />
      </div>

      {/* Email stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">누적 발송 성공</div>
          <div className="text-xl font-bold text-green-600 mt-1">{stats?.emails.totalSent ?? 0}건</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">누적 발송 실패</div>
          <div className="text-xl font-bold text-red-600 mt-1">{stats?.emails.totalFailed ?? 0}건</div>
        </div>
      </div>

      {/* Failed email logs */}
      {stats && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 발송 실패</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4 whitespace-nowrap" style={{ width: '1%' }}>시각</th>
                  <th className="pb-2 pr-4 whitespace-nowrap" style={{ width: '1%' }}>이메일</th>
                  <th className="pb-2 whitespace-nowrap">에러</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(!stats.emails.recentFailed || stats.emails.recentFailed.length === 0) && (
                  <tr><td colSpan={3} className="py-4 text-center text-gray-400">실패 기록 없음</td></tr>
                )}
                {stats.emails.recentFailed?.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">
                      {new Date(log.sentAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">{log.email}</td>
                    <td className="py-2 text-red-600 text-xs">{log.error || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">설정</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_1fr] gap-4 sm:items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">최대 구독자 수</label>
            <input
              type="number"
              value={settings.maxSubscribers}
              onChange={(e) => setSettings({ ...settings, maxSubscribers: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">신규 구독 접수</label>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() =>
                  setSettings({
                    ...settings,
                    registrationOpen: settings.registrationOpen === 'true' ? 'false' : 'true',
                  })
                }
                className={`relative w-12 h-6 rounded-full transition ${
                  settings.registrationOpen === 'true' ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    settings.registrationOpen === 'true' ? 'translate-x-6' : ''
                  }`}
                />
              </button>
              <span className="text-sm text-gray-600">
                {settings.registrationOpen === 'true' ? '접수 중' : '중단됨'}
              </span>
            </div>
          </div>
          <div className="sm:text-right">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? '저장 중...' : '설정 저장'}
            </button>
          </div>
        </div>
      </div>

      {/* Recent crawls */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 크롤링</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 pr-4 whitespace-nowrap" style={{ width: '1%' }}>게시판</th>
                <th className="pb-2 pr-4 whitespace-nowrap" style={{ width: '1%' }}>시작</th>
                <th className="pb-2 pr-4 whitespace-nowrap" style={{ width: '1%' }}>종료</th>
                <th className="pb-2 pr-4 whitespace-nowrap">신규</th>
                <th className="pb-2 whitespace-nowrap" style={{ width: '1%' }}>상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats?.recentCrawls.map((crawl) => (
                <tr key={crawl.id}>
                  <td className="py-2 pr-4 whitespace-nowrap">{crawl.boardType === 'notice' ? '공지' : '규정'}</td>
                  <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">
                    {new Date(crawl.startedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  </td>
                  <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">
                    {crawl.finishedAt
                      ? new Date(crawl.finishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                      : '-'}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{crawl.newPostsCount}</td>
                  <td className="py-2 whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs ${
                        crawl.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : crawl.status === 'running'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {crawl.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User list */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          유저 목록 ({users.length}명)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 pr-4 whitespace-nowrap" style={{ width: '1%' }}>이메일</th>
                <th className="pb-2 pr-4 whitespace-nowrap" style={{ width: '1%' }}>이름</th>
                <th className="pb-2 pr-4 whitespace-nowrap" style={{ width: '1%' }}>가입일</th>
                <th className="pb-2 pr-4 whitespace-nowrap">구독</th>
                <th className="pb-2 pr-4 whitespace-nowrap" style={{ width: '1%' }}>발송</th>
                <th className="pb-2 whitespace-nowrap" style={{ width: '1%' }}>관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((user) => {
                const hasActive = user.subscriptions.some((s) => s.isActive);
                return (
                  <tr key={user.id}>
                    <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">{user.email}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{user.name || '-'}</td>
                    <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{user.createdAt.slice(0, 10)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <div className="flex gap-1">
                        {SUBSCRIPTION_CATEGORIES.map((cat) => {
                          const sub = user.subscriptions.find((s) => s.category === cat.id);
                          const isActive = sub?.isActive === 1;
                          return (
                            <button
                              key={cat.id}
                              onClick={() => toggleUserSubscription(user.id, cat.id, isActive)}
                              className={`text-xs px-2 py-0.5 rounded transition cursor-pointer ${
                                isActive
                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                              }`}
                            >
                              {catLabel(cat.id)}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">{user.emailsSent}건</td>
                    <td className="py-3 whitespace-nowrap">
                      {user.email === session?.user?.email ? (
                        <span className="text-xs text-gray-400">본인</span>
                      ) : (
                        <div className="flex gap-1">
                          {hasActive && (
                            <button
                              onClick={() => deactivateUser(user.id)}
                              className="text-xs px-3 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition"
                            >
                              구독 중단
                            </button>
                          )}
                          <button
                            onClick={() => deleteUser(user.id)}
                            className="text-xs px-3 py-1 rounded bg-gray-50 text-gray-500 hover:bg-gray-200 transition"
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
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}
