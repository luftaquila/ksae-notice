'use client';

import { useState, useEffect } from 'react';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/constants';

interface UserInfo {
  id: number;
  email: string;
  name: string | null;
  createdAt: string;
  subscriptions: { category: string; isActive: number; expiresAt: string }[];
  emailsSent: number;
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

  const toggleUser = async (userId: number, currentlyActive: boolean) => {
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: currentlyActive ? 'deactivate' : 'activate' }),
      });
      await fetchAll();
    } catch {}
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

      {/* Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">설정</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="mt-4 px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving ? '저장 중...' : '설정 저장'}
        </button>
      </div>

      {/* Recent crawls */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 크롤링</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 pr-4">게시판</th>
                <th className="pb-2 pr-4">시작</th>
                <th className="pb-2 pr-4">종료</th>
                <th className="pb-2 pr-4">신규</th>
                <th className="pb-2">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats?.recentCrawls.map((crawl) => (
                <tr key={crawl.id}>
                  <td className="py-2 pr-4">{crawl.boardType === 'notice' ? '공지' : '규정'}</td>
                  <td className="py-2 pr-4 text-gray-400">
                    {new Date(crawl.startedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  </td>
                  <td className="py-2 pr-4 text-gray-400">
                    {crawl.finishedAt
                      ? new Date(crawl.finishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                      : '-'}
                  </td>
                  <td className="py-2 pr-4">{crawl.newPostsCount}</td>
                  <td className="py-2">
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
                <th className="pb-2 pr-4">이메일</th>
                <th className="pb-2 pr-4">이름</th>
                <th className="pb-2 pr-4">가입일</th>
                <th className="pb-2 pr-4">구독 카테고리</th>
                <th className="pb-2 pr-4">발송</th>
                <th className="pb-2">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((user) => {
                const hasActive = user.subscriptions.some((s) => s.isActive);
                return (
                  <tr key={user.id}>
                    <td className="py-3 pr-4 font-mono text-xs">{user.email}</td>
                    <td className="py-3 pr-4">{user.name || '-'}</td>
                    <td className="py-3 pr-4 text-gray-400">{user.createdAt.slice(0, 10)}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {user.subscriptions.map((s) => (
                          <span
                            key={s.category}
                            className={`text-xs px-2 py-0.5 rounded ${
                              s.isActive
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-400 line-through'
                            }`}
                          >
                            {catLabel(s.category)}
                          </span>
                        ))}
                        {user.subscriptions.length === 0 && (
                          <span className="text-xs text-gray-300">없음</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{user.emailsSent}건</td>
                    <td className="py-3">
                      <button
                        onClick={() => toggleUser(user.id, hasActive)}
                        className={`text-xs px-3 py-1 rounded transition ${
                          hasActive
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {hasActive ? '구독 중단' : '구독 활성화'}
                      </button>
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
