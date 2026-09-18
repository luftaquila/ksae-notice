'use client';

import { CATEGORY_COLORS, getBoardLabel } from '@/lib/constants';
import { formatLocalDateTime, formatRelativeTime } from '@/lib/format';
import { Badge, Card, TD, TH, type BadgeTone } from '@/components/ui';
import SettingsSection from './SettingsSection';
import type { AdminStats, Settings } from './types';

// 개요: 위에서부터 신호 카드 넷 → 설정 → (접힌) 최근 크롤링 → (접힌) 최근 발송 실패.
// 신호는 숫자만이다. 오늘 발송이 정상인가, 정원이 얼마나 찼나, Brevo 잔량, 크롤러가 살아
// 있나 — 설명 문장은 붙이지 않는다.

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
      {sub && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums space-y-0.5">{sub}</div>}
      {children}
    </div>
  );
}

// 접힌 카드. 제목 줄을 누르면 펼쳐진다 — 로그는 필요할 때만 본다.
function Folded({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <details className="group">
        <summary className="flex items-center justify-between gap-3 px-6 py-4 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          <span className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</span>
          <span className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            {meta}
            <svg className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </summary>
        <div className="px-6 pb-6">{children}</div>
      </details>
    </Card>
  );
}

export default function OverviewTab({
  stats,
  brevoRemaining,
  settings,
  onSave,
  onTestEmail,
}: {
  stats: AdminStats | null;
  brevoRemaining: number | null;
  settings: Settings;
  onSave: (next: Settings) => Promise<string | null>;
  onTestEmail: () => Promise<string>;
}) {
  const emails = stats?.emails;
  const seats = stats?.seats ?? 0;
  const recipients = stats?.recipients ?? 0;
  const failedToday = emails?.todayFailed ?? 0;
  const maxSubscribers = parseInt(settings.maxSubscribers, 10) || 0;

  // 잔량이 수신인 전원에게 한 번 보낼 분량이 안 되면 숫자를 경고색으로.
  const brevoShort = brevoRemaining !== null && recipients > 0 && brevoRemaining < recipients;

  const latest = stats?.recentCrawls?.[0] ?? null;

  return (
    <div className="space-y-6">
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
        />

        <Signal
          label="구독자"
          value={<>{seats} <span className="text-base font-medium text-gray-400 dark:text-gray-500">/ {maxSubscribers || '-'}</span></>}
          tone={maxSubscribers > 0 && seats >= maxSubscribers ? 'warn' : 'default'}
          sub={
            <>
              <div>수신인 {recipients} · 알림 꺼짐 {stats?.seatsAlertsOff ?? 0} · 일시중지 {stats?.seatsPaused ?? 0}</div>
              <div>미구독 {(stats?.totalUsers ?? 0) - seats - (stats?.deletedUsers ?? 0)} · 탈퇴 {stats?.deletedUsers ?? 0} · 전체 {stats?.totalUsers ?? 0}</div>
            </>
          }
        >
          <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-all"
              style={{ width: `${maxSubscribers > 0 ? Math.min(100, (seats / maxSubscribers) * 100) : 0}%` }}
            />
          </div>
        </Signal>

        <Signal label="Brevo 잔량" value={brevoRemaining ?? '...'} tone={brevoShort ? 'warn' : 'default'} />

        <Signal
          label="마지막 크롤링"
          value={latest ? formatRelativeTime(latest.finishedAt || latest.startedAt) : '-'}
          tone={latest?.status === 'failed' ? 'bad' : 'default'}
        />
      </div>

      <SettingsSection settings={settings} onSave={onSave} onTestEmail={onTestEmail} />

      <Folded
        title="최근 크롤링"
        meta={latest && latest.status === 'failed' ? <Badge tone="red">실패</Badge> : undefined}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className={`${TH} w-[1%]`}>게시판</th>
              <th className={`${TH} w-[1%]`}>상태</th>
              <th className={TH}>시작</th>
              <th className={`${TH} w-[1%] text-right`}>소요</th>
              <th className={`${TH} w-[1%] pr-0 text-right`}>신규</th>
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
                  <td className={`${TD} pr-0 whitespace-nowrap text-right tabular-nums`}>{crawl.newPostsCount}</td>
                </tr>
              );
            })}
            {(!stats?.recentCrawls || stats.recentCrawls.length === 0) && (
              <tr><td colSpan={5} className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">크롤링 기록 없음</td></tr>
            )}
          </tbody>
        </table>
      </Folded>

      <Folded
        title="최근 발송 실패"
        meta={<span className="tabular-nums">누적 {emails?.totalFailed ?? 0}건</span>}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className={`${TH} w-[1%]`}>시각</th>
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
                <td className={`${TD} font-mono text-xs break-all`}>{log.email}</td>
                <td className={`${TD} pr-0 text-xs text-red-600 dark:text-red-400 break-words`}>{log.error || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Folded>
    </div>
  );
}
