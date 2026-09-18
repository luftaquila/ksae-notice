'use client';

import { useState } from 'react';
import { CATEGORY_COLORS, getBoardLabel } from '@/lib/constants';
import { formatLocalDateTime, formatRelativeTime } from '@/lib/format';
import { Badge, BUTTON_GHOST, Card, TD, TH, type BadgeTone } from '@/components/ui';
import type { AdminStats } from './types';

// 첫 화면에서 읽어야 할 네 가지: 오늘 발송이 정상인가, 정원이 얼마나 찼나, Brevo 잔량이
// 다음 발송을 감당하나, 크롤러가 살아 있나. 누적 카운터는 계속 늘기만 해서 판단에 쓰이지
// 않으므로 카드에서 뺐다.

const CRAWL_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  completed: { label: '완료', tone: 'gray' },
  running: { label: '진행 중', tone: 'blue' },
  failed: { label: '실패', tone: 'red' },
};

function Signal({
  label,
  value,
  sub,
  tone = 'default',
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'default' | 'warn' | 'bad';
  children?: React.ReactNode;
}) {
  const border = tone === 'bad'
    ? 'border-red-300 dark:border-red-500/40'
    : tone === 'warn'
      ? 'border-amber-300 dark:border-amber-500/40'
      : 'border-gray-200 dark:border-gray-800';
  const valueColor = tone === 'bad'
    ? 'text-red-600 dark:text-red-400'
    : tone === 'warn'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-gray-900 dark:text-gray-100';
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg border p-4 ${border}`}>
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${valueColor}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
      {children}
    </div>
  );
}

export default function OverviewTab({
  stats,
  brevoRemaining,
  maxSubscribers,
  onTestEmail,
}: {
  stats: AdminStats | null;
  brevoRemaining: number | null;
  maxSubscribers: number;
  onTestEmail: () => Promise<string>;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const emails = stats?.emails;
  const seats = stats?.seats ?? 0;
  const recipients = stats?.recipients ?? 0;
  const failedToday = emails?.todayFailed ?? 0;

  // 잔량이 "수신인 전원에게 한 번" 을 감당하는지. 글 한 건이 뜨면 그만큼 나간다.
  const brevoShort = brevoRemaining !== null && recipients > 0 && brevoRemaining < recipients;

  const latest = stats?.recentCrawls?.[0] ?? null;
  const latestStatus = latest ? CRAWL_STATUS[latest.status] ?? { label: latest.status, tone: 'gray' as BadgeTone } : null;

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestResult(await onTestEmail());
    setTesting(false);
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Signal
          label="오늘 발송"
          value={emails?.todaySent ?? 0}
          tone={failedToday > 0 ? 'bad' : 'default'}
          sub={
            <>
              생략 {emails?.todaySkipped ?? 0} ·{' '}
              <span className={failedToday > 0 ? 'font-semibold text-red-600 dark:text-red-400' : ''}>실패 {failedToday}</span>
            </>
          }
        >
          <div className="mt-3 flex items-center gap-2">
            <button onClick={runTest} disabled={testing} className={BUTTON_GHOST}>
              {testing ? '발송 중...' : '테스트 메일'}
            </button>
            {testResult && <span className="text-[11px] text-gray-500 dark:text-gray-400">{testResult}</span>}
          </div>
        </Signal>

        <Signal
          label="구독자"
          value={<>{seats} <span className="text-base font-medium text-gray-400 dark:text-gray-500">/ {maxSubscribers || '-'}</span></>}
          tone={maxSubscribers > 0 && seats >= maxSubscribers ? 'warn' : 'default'}
          sub={<>수신인 {recipients}명 · 미구독 {(stats?.totalUsers ?? 0) - seats - (stats?.deletedUsers ?? 0)} · 탈퇴 {stats?.deletedUsers ?? 0}</>}
        >
          <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-all"
              style={{ width: `${maxSubscribers > 0 ? Math.min(100, (seats / maxSubscribers) * 100) : 0}%` }}
            />
          </div>
        </Signal>

        <Signal
          label="Brevo 잔량"
          value={brevoRemaining ?? '...'}
          tone={brevoShort ? 'warn' : 'default'}
          sub={
            brevoRemaining === null
              ? '잔량을 읽는 중'
              : recipients === 0
                ? '수신인이 없습니다'
                : brevoShort
                  ? `수신인 ${recipients}명에게 한 번 보낼 분량이 안 됩니다`
                  : `수신인 ${recipients}명 × 글 1건 = ${recipients}통 확보`
          }
        />

        <Signal
          label="마지막 크롤링"
          value={latest ? formatRelativeTime(latest.finishedAt || latest.startedAt) : '-'}
          tone={latest?.status === 'failed' ? 'bad' : 'default'}
          sub={
            latest && latestStatus ? (
              <span className="inline-flex items-center gap-1.5">
                <Badge tone={latestStatus.tone}>{latestStatus.label}</Badge>
                {getBoardLabel(latest.boardType)} · 신규 {latest.newPostsCount}
              </span>
            ) : '기록 없음'
          }
        />
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">최근 크롤링</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className={TH}>게시판</th>
                <th className={TH}>상태</th>
                <th className={TH}>시작</th>
                <th className={`${TH} text-right`}>소요</th>
                <th className={`${TH} text-right`}>신규</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {stats?.recentCrawls.map((crawl) => {
                const status = CRAWL_STATUS[crawl.status] ?? { label: crawl.status, tone: 'gray' as BadgeTone };
                const boardLabel = getBoardLabel(crawl.boardType);
                const chip = crawl.boardType === 'notice'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                  : CATEGORY_COLORS[boardLabel]?.chip || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
                return (
                  <tr key={crawl.id} className={crawl.status === 'failed' ? 'bg-red-50/50 dark:bg-red-500/5' : ''}>
                    <td className={`${TD} whitespace-nowrap`}>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${chip}`}>{boardLabel}</span>
                    </td>
                    <td className={`${TD} whitespace-nowrap`}><Badge tone={status.tone}>{status.label}</Badge></td>
                    <td className={`${TD} whitespace-nowrap text-gray-500 dark:text-gray-400 tabular-nums`}>{formatLocalDateTime(crawl.startedAt)}</td>
                    <td className={`${TD} whitespace-nowrap text-right text-gray-500 dark:text-gray-400 tabular-nums`}>
                      {crawl.finishedAt
                        ? `${Math.round((new Date(crawl.finishedAt).getTime() - new Date(crawl.startedAt).getTime()) / 1000)}s`
                        : '-'}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>{crawl.newPostsCount}</td>
                  </tr>
                );
              })}
              {(!stats?.recentCrawls || stats.recentCrawls.length === 0) && (
                <tr><td colSpan={5} className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">크롤링 기록 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">최근 발송 실패</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">누적 실패 {emails?.totalFailed ?? 0}건 중 최근 20건</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className={TH}>시각</th>
                <th className={TH}>이메일</th>
                <th className={`${TH} pr-0`}>에러</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(!emails?.recentFailed || emails.recentFailed.length === 0) && (
                <tr><td colSpan={3} className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">실패 기록 없음</td></tr>
              )}
              {emails?.recentFailed?.map((log) => (
                <tr key={log.id}>
                  <td className={`${TD} whitespace-nowrap text-gray-500 dark:text-gray-400 tabular-nums`}>{formatLocalDateTime(log.sentAt)}</td>
                  <td className={`${TD} whitespace-nowrap font-mono text-xs`}>{log.email}</td>
                  <td className={`${TD} pr-0 text-xs text-red-600 dark:text-red-400`}>{log.error || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
