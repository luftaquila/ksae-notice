'use client';

import { Fragment, useMemo, useState } from 'react';
import { ALERT_CATEGORIES, CATEGORY_COLORS, getCategoryLabel } from '@/lib/constants';
import { formatCalendarDate } from '@/lib/format';
import { alertSummary, subscriptionState, type SubscriptionStateKey } from '@/lib/subscription/status';
import { Badge, BUTTON_DANGER, BUTTON_GHOST, Card, INPUT, Spinner, TD, TH, type BadgeTone } from '@/components/ui';
import type { UserAction, UserInfo } from './types';

// 유저 표는 훑는 표가 아니라 찾는 도구다. 한 행에는 판단에 필요한 것만 — 누구인지, 좌석이
// 있는지, 알림이 나가는지 — 두고, 카테고리 칩 여덟 개와 조작 버튼은 행을 펼쳤을 때 나온다.
// 예전에는 행마다 클릭할 것이 열한 개였고 검색도 필터도 없었다.
//
// 표는 가로 스크롤을 만들지 않는다: table-fixed 로 첫 열(유저)이 남는 폭을 전부 받아
// 이메일을 말줄임하고, 판단에 덜 필요한 열(가입·발송)은 좁은 화면에서 숨긴다 — 그 값은
// 행을 펼치면 보인다.

const STATE_TONE: Record<SubscriptionStateKey, BadgeTone> = {
  active: 'blue',
  none: 'amber',
  expired: 'gray',
  withdrawn: 'gray',
};

type Filter = 'all' | SubscriptionStateKey;
type Sort = 'expiry' | 'joined' | 'name';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '이용 중' },
  { id: 'none', label: '구독 없음' },
  { id: 'expired', label: '만료' },
  { id: 'withdrawn', label: '탈퇴' },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: 'expiry', label: '만료 임박순' },
  { id: 'joined', label: '최근 가입순' },
  { id: 'name', label: '이름순' },
];

function Avatar({ name, email, muted }: { name: string | null; email: string; muted: boolean }) {
  const initial = Array.from(name || email)[0] ?? '?';
  return (
    <span
      className={`w-8 h-8 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center ${
        muted
          ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
      }`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export default function UsersTab({
  users,
  maxSubscribers,
  adminEmail,
  onPatch,
}: {
  users: UserInfo[];
  maxSubscribers: number;
  adminEmail: string | null;
  onPatch: (userId: number, action: UserAction, category?: string) => Promise<string | null>;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('expiry');
  const [expanded, setExpanded] = useState<number | null>(null);
  // 진행 중인 조작 하나. `${userId}:${action}:${category}` 로 어느 칩·버튼인지 가린다.
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ userId: number; message: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  const rows = useMemo(() => users.map((user) => {
    const state = subscriptionState({ deletedAt: user.deletedAt, subscriptionExpiresAt: user.subscriptionExpiresAt });
    const activeCount = user.alerts.filter((a) => a.isActive).length;
    const summary = alertSummary({ activeCount, total: ALERT_CATEGORIES.length, paused: !!user.alertsPausedAt });
    return { user, state, activeCount, summary };
  }), [users]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, active: 0, none: 0, expired: 0, withdrawn: 0 };
    for (const r of rows) {
      c[r.state.key] += 1;
      if (r.state.key !== 'withdrawn') c.all += 1;
    }
    return c;
  }, [rows]);

  const seats = counts.active;
  const recipients = rows.filter((r) => r.state.holdsSeat && r.summary.delivering).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      // "전체" 는 탈퇴를 뺀 전체다. 탈퇴는 필터로만 본다.
      if (filter === 'all' ? r.state.key === 'withdrawn' : r.state.key !== filter) return false;
      if (!q) return true;
      return (r.user.name || '').toLowerCase().includes(q) || r.user.email.toLowerCase().includes(q);
    });
    list.sort((a, b) => {
      if (sort === 'name') return (a.user.name || a.user.email).localeCompare(b.user.name || b.user.email, 'ko');
      if (sort === 'joined') return b.user.createdAt.localeCompare(a.user.createdAt);
      // 만료 임박순: 기간 있는 사람이 먼저, 가까운 날짜부터. 기간 없는 사람은 뒤에.
      const ae = a.user.subscriptionExpiresAt;
      const be = b.user.subscriptionExpiresAt;
      if (ae && be) return ae.localeCompare(be);
      if (ae) return -1;
      if (be) return 1;
      return b.user.createdAt.localeCompare(a.user.createdAt);
    });
    return list;
  }, [rows, query, filter, sort]);

  const act = async (userId: number, action: UserAction, category?: string) => {
    const key = `${userId}:${action}:${category ?? ''}`;
    setBusy(key);
    setRowError(null);
    const message = await onPatch(userId, action, category);
    if (message) setRowError({ userId, message });
    setBusy(null);
    if (action === 'delete' && !message) {
      setConfirmingDelete(null);
      setExpanded(null);
    }
  };

  const isBusy = (userId: number, action: UserAction, category?: string) =>
    busy === `${userId}:${action}:${category ?? ''}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">유저</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
            구독자 <b className="text-gray-900 dark:text-gray-100">{seats}</b> / {maxSubscribers || '-'} · 수신인 <b className="text-gray-900 dark:text-gray-100">{recipients}</b>
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·이메일 검색"
            className={`${INPUT} sm:w-64`}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${INPUT} sm:w-36`}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                active
                  ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700 dark:hover:border-gray-500'
              }`}
            >
              {f.label} <span className={`tabular-nums ${active ? 'opacity-70' : 'text-gray-400 dark:text-gray-500'}`}>{counts[f.id]}</span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className={`${TH} pl-4 pt-3`}>유저</th>
              <th className={`${TH} pt-3 w-36`}>구독</th>
              <th className={`${TH} pt-3 w-28`}>알림</th>
              <th className={`${TH} pt-3 w-24 text-right hidden lg:table-cell`}>발송 / 생략</th>
              <th className={`${TH} pt-3 w-28 hidden md:table-cell`}>가입</th>
              <th className={`${TH} pt-3 pr-4 w-10`} aria-label="펼치기" />
            </tr>
          </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                    {query ? '검색 결과가 없습니다.' : '해당하는 유저가 없습니다.'}
                  </td>
                </tr>
              )}
              {visible.map(({ user, state, summary }) => {
                const withdrawn = state.key === 'withdrawn';
                const isAdmin = user.email === adminEmail;
                const open = expanded === user.id;
                const muted = withdrawn ? 'text-gray-400 dark:text-gray-600' : '';
                return (
                  <Fragment key={user.id}>
                    <tr
                      onClick={() => !withdrawn && setExpanded(open ? null : user.id)}
                      className={`${withdrawn ? '' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40'} ${open ? 'bg-gray-50 dark:bg-gray-800/40' : ''} transition-colors`}
                    >
                      <td className={`${TD} pl-4`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar name={user.name} email={user.email} muted={withdrawn} />
                          <div className="min-w-0">
                            <div className={`font-medium truncate ${muted || 'text-gray-900 dark:text-gray-100'}`}>
                              {user.name || <span className="text-gray-400 dark:text-gray-500">이름 없음</span>}
                              {isAdmin && <Badge tone="blue" className="ml-1.5">관리자</Badge>}
                            </div>
                            <div className={`text-xs font-mono truncate ${muted || 'text-gray-500 dark:text-gray-400'}`}>{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <Badge tone={STATE_TONE[state.key]}>{state.label}</Badge>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                          {withdrawn && user.deletedAt
                            ? formatCalendarDate(user.deletedAt)
                            : user.subscriptionExpiresAt
                              ? `~ ${formatCalendarDate(user.subscriptionExpiresAt)}`
                              : ''}
                        </div>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {withdrawn ? (
                          <span className="text-xs text-gray-400 dark:text-gray-600">-</span>
                        ) : (
                          <Badge tone={summary.delivering ? 'gray' : 'amber'}>{summary.label}</Badge>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right tabular-nums hidden lg:table-cell ${muted}`}>
                        {user.emailsSent}
                        <span className="text-gray-400 dark:text-gray-500"> / {user.emailsSkipped}</span>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-xs tabular-nums hidden md:table-cell ${muted || 'text-gray-500 dark:text-gray-400'}`}>
                        {formatCalendarDate(user.createdAt)}
                      </td>
                      <td className={`${TD} pr-4 text-right`}>
                        {!withdrawn && (
                          <svg
                            className={`inline-block w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        )}
                      </td>
                    </tr>

                    {open && (
                      <tr className="bg-gray-50 dark:bg-gray-800/40">
                        <td colSpan={6} className="px-4 pb-5 pt-1">
                          <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                            {/* 알림 설정 — 카테고리 칩은 켬/끔 버튼이다. */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">알림 카테고리</span>
                                {user.alertsPausedAt && <Badge tone="amber">일시중지 중</Badge>}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {ALERT_CATEGORIES.map((cat) => {
                                  const on = user.alerts.find((a) => a.category === cat.id)?.isActive === 1;
                                  const label = getCategoryLabel(cat.id);
                                  const pending = isBusy(user.id, on ? 'disable_alert' : 'enable_alert', cat.id);
                                  return (
                                    <button
                                      key={cat.id}
                                      onClick={(e) => { e.stopPropagation(); act(user.id, on ? 'disable_alert' : 'enable_alert', cat.id); }}
                                      disabled={busy !== null}
                                      title={on ? '끄기' : '켜기'}
                                      className={`text-xs px-2 py-0.5 rounded transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait ${pending ? 'opacity-50' : ''} ${
                                        on
                                          ? (CATEGORY_COLORS[label]?.chipHover || 'bg-blue-100 text-blue-700 hover:bg-blue-200')
                                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200 active:bg-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700 dark:active:bg-gray-700 line-through decoration-gray-300 dark:decoration-gray-600'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="mt-2 flex gap-1.5">
                                <button onClick={(e) => { e.stopPropagation(); act(user.id, 'enable_all_alerts'); }} disabled={busy !== null} className={BUTTON_GHOST}>
                                  {isBusy(user.id, 'enable_all_alerts') ? '처리 중...' : '모두 켜기'}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); act(user.id, 'disable_all_alerts'); }} disabled={busy !== null} className={BUTTON_DANGER}>
                                  {isBusy(user.id, 'disable_all_alerts') ? '처리 중...' : '모두 끄기'}
                                </button>
                              </div>
                            </div>

                            {/* 구독(좌석)과 계정 — 다른 축이라 따로 묶는다. */}
                            <div className="flex flex-col gap-3 lg:items-end">
                              <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                                가입 {formatCalendarDate(user.createdAt)} · 발송 {user.emailsSent} · 생략 {user.emailsSkipped}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">구독</span>
                                {user.subscriptionExpiresAt ? (
                                  <button onClick={(e) => { e.stopPropagation(); act(user.id, 'revoke_period'); }} disabled={busy !== null} className={BUTTON_DANGER}>
                                    {isBusy(user.id, 'revoke_period') ? '처리 중...' : '좌석 회수'}
                                  </button>
                                ) : (
                                  <button onClick={(e) => { e.stopPropagation(); act(user.id, 'grant_year'); }} disabled={busy !== null} className={BUTTON_GHOST}>
                                    {isBusy(user.id, 'grant_year') ? '처리 중...' : '1년 부여 (결제 없이)'}
                                  </button>
                                )}
                              </div>
                              {!isAdmin && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">계정</span>
                                  {confirmingDelete === user.id ? (
                                    <>
                                      <span className="text-xs text-red-600 dark:text-red-400">탈퇴 처리하고 좌석을 거둡니다.</span>
                                      <button onClick={(e) => { e.stopPropagation(); act(user.id, 'delete'); }} disabled={busy !== null} className={`${BUTTON_DANGER} border-red-300 text-red-600 dark:border-red-500/50 dark:text-red-400`}>
                                        {isBusy(user.id, 'delete') ? '처리 중...' : '삭제 확정'}
                                      </button>
                                      <button onClick={(e) => { e.stopPropagation(); setConfirmingDelete(null); }} className={BUTTON_GHOST}>취소</button>
                                    </>
                                  ) : (
                                    <button onClick={(e) => { e.stopPropagation(); setConfirmingDelete(user.id); }} disabled={busy !== null} className={BUTTON_DANGER}>
                                      삭제
                                    </button>
                                  )}
                                </div>
                              )}
                              {busy?.startsWith(`${user.id}:`) && <Spinner className="lg:self-end" />}
                            </div>
                          </div>
                          {rowError?.userId === user.id && (
                            <p className="mt-3 text-xs text-red-600 dark:text-red-400">{rowError.message}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
        </table>
      </Card>
    </div>
  );
}
