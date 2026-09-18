'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ALERT_CATEGORIES, CATEGORY_COLORS, getCategoryLabel } from '@/lib/constants';
import { formatCalendarDate } from '@/lib/format';
import { alertSummary, subscriptionState, type SubscriptionStateKey } from '@/lib/subscription/status';
import { Badge, BUTTON_DANGER, BUTTON_GHOST, Card, INPUT, Spinner, TH, type BadgeTone } from '@/components/ui';
import type { UserAction, UserInfo } from './types';

// 유저 표. 모든 정보와 조작이 한 행에 보인다 — 접지 않는다.
//
// lg 이상은 진짜 <table> 이다: 열이 표 전체에서 정렬되고(행마다 그리드를 따로 두면 행끼리
// 어긋난다), 좁은 열은 w-[1%] 로 내용 폭만 차지하고, 남는 폭은 유저·알림 두 열이 나눈다.
// lg 미만은 유저마다 카드 하나로 쌓는다 — 같은 정보를 세 줄에 나눠 담고 아무것도 숨기지 않는다.

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

const TD = 'py-3 pr-4 align-middle';

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
    setBusy(`${userId}:${action}:${category ?? ''}`);
    setRowError(null);
    const message = await onPatch(userId, action, category);
    if (message) setRowError({ userId, message });
    setBusy(null);
    if (action === 'delete' && !message) setConfirmingDelete(null);
  };

  const isBusy = (userId: number, action: UserAction, category?: string) =>
    busy === `${userId}:${action}:${category ?? ''}`;

  // 칩이 곧 켬/끔 버튼이다. 배달이 막힌 상태(모두 꺼짐·일시중지)면 그 이유를 앞에 단다.
  const chips = (user: UserInfo, delivering: boolean, label: string): ReactNode => (
    <>
      {!delivering && <Badge tone="amber">{label}</Badge>}
      {ALERT_CATEGORIES.map((cat) => {
        const on = user.alerts.find((a) => a.category === cat.id)?.isActive === 1;
        const name = getCategoryLabel(cat.id);
        const pending = isBusy(user.id, on ? 'disable_alert' : 'enable_alert', cat.id);
        return (
          <button
            key={cat.id}
            onClick={() => act(user.id, on ? 'disable_alert' : 'enable_alert', cat.id)}
            disabled={busy !== null}
            title={on ? '끄기' : '켜기'}
            className={`text-[11px] px-1.5 py-0.5 rounded transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait ${pending ? 'animate-pulse' : ''} ${
              on
                ? (CATEGORY_COLORS[name]?.chipHover || 'bg-blue-100 text-blue-700 hover:bg-blue-200')
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 active:bg-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700 dark:active:bg-gray-700'
            }`}
          >
            {name}
          </button>
        );
      })}
    </>
  );

  const actions = (user: UserInfo, isAdmin: boolean): ReactNode => {
    if (confirmingDelete === user.id) {
      return (
        <>
          <span className="text-xs text-red-600 dark:text-red-400">탈퇴 처리하고 좌석을 거둡니다.</span>
          <button onClick={() => act(user.id, 'delete')} disabled={busy !== null} className={`${BUTTON_DANGER} border-red-300 text-red-600 dark:border-red-500/50 dark:text-red-400`}>
            {isBusy(user.id, 'delete') ? '처리 중...' : '삭제 확정'}
          </button>
          <button onClick={() => setConfirmingDelete(null)} className={BUTTON_GHOST}>취소</button>
        </>
      );
    }
    return (
      <>
        {user.alerts.some((a) => a.isActive) ? (
          <button onClick={() => act(user.id, 'disable_all_alerts')} disabled={busy !== null} className={BUTTON_DANGER}>
            {isBusy(user.id, 'disable_all_alerts') ? '처리 중...' : '알림 모두 끄기'}
          </button>
        ) : (
          <button onClick={() => act(user.id, 'enable_all_alerts')} disabled={busy !== null} className={BUTTON_GHOST}>
            {isBusy(user.id, 'enable_all_alerts') ? '처리 중...' : '알림 모두 켜기'}
          </button>
        )}
        {user.subscriptionExpiresAt ? (
          <button onClick={() => act(user.id, 'revoke_period')} disabled={busy !== null} className={BUTTON_DANGER}>
            {isBusy(user.id, 'revoke_period') ? '처리 중...' : '좌석 회수'}
          </button>
        ) : (
          <button onClick={() => act(user.id, 'grant_year')} disabled={busy !== null} className={BUTTON_GHOST}>
            {isBusy(user.id, 'grant_year') ? '처리 중...' : '1년 부여'}
          </button>
        )}
        {isAdmin ? (
          <span className="text-xs text-gray-400 dark:text-gray-500 px-1" title="관리자 본인은 삭제할 수 없습니다">본인</span>
        ) : (
          <button onClick={() => setConfirmingDelete(user.id)} disabled={busy !== null} className={BUTTON_DANGER}>삭제</button>
        )}
      </>
    );
  };

  const subscriptionDate = (user: UserInfo, withdrawn: boolean) =>
    withdrawn && user.deletedAt
      ? formatCalendarDate(user.deletedAt)
      : user.subscriptionExpiresAt
        ? `~ ${formatCalendarDate(user.subscriptionExpiresAt)}`
        : null;

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

      {visible.length === 0 && (
        <Card className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
          {query ? '검색 결과가 없습니다.' : '해당하는 유저가 없습니다.'}
        </Card>
      )}

      {/* lg 이상: 표 */}
      {visible.length > 0 && (
        <Card className="hidden lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className={`${TH} pl-4 pt-3 w-[1%]`}>유저</th>
                <th className={`${TH} pt-3 w-[1%]`}>구독</th>
                <th className={`${TH} pt-3`}>알림</th>
                <th className={`${TH} pt-3 w-[1%] text-right`}>발송 / 생략</th>
                <th className={`${TH} pt-3 w-[1%]`}>가입</th>
                <th className={`${TH} pt-3 pr-4 w-[1%]`}>관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {visible.map(({ user, state, summary }) => {
                const withdrawn = state.key === 'withdrawn';
                const isAdmin = user.email === adminEmail;
                const muted = withdrawn ? 'text-gray-400 dark:text-gray-600' : '';
                const rowBusy = busy?.startsWith(`${user.id}:`) ?? false;
                const date = subscriptionDate(user, withdrawn);
                return (
                  <tr key={user.id} className={`${rowBusy ? 'opacity-70' : ''} transition-opacity`}>
                    <td className={`${TD} pl-4 whitespace-nowrap`}>
                      <div className="flex items-center gap-3">
                        <Avatar name={user.name} email={user.email} muted={withdrawn} />
                        <div className="min-w-0 max-w-[16rem]">
                          <div className={`font-medium truncate ${muted || 'text-gray-900 dark:text-gray-100'}`}>
                            {user.name || <span className="text-gray-400 dark:text-gray-500">이름 없음</span>}
                            {isAdmin && <Badge tone="blue" className="ml-1.5">관리자</Badge>}
                          </div>
                          <div className={`text-xs font-mono truncate ${muted || 'text-gray-500 dark:text-gray-400'}`} title={user.email}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <Badge tone={STATE_TONE[state.key]}>{state.label}</Badge>
                      {date && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums">{date}</div>}
                    </td>
                    <td className={TD}>
                      {withdrawn ? (
                        <span className="text-xs text-gray-400 dark:text-gray-600">-</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">{chips(user, summary.delivering, summary.label)}</div>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right tabular-nums ${muted}`}>
                      {user.emailsSent}
                      <span className="text-gray-400 dark:text-gray-500">{' / '}{user.emailsSkipped}</span>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-xs tabular-nums ${muted || 'text-gray-500 dark:text-gray-400'}`}>
                      {formatCalendarDate(user.createdAt)}
                    </td>
                    <td className={`${TD} pr-4 whitespace-nowrap`}>
                      {!withdrawn && (
                        <div className="flex items-center gap-1.5">
                          {actions(user, isAdmin)}
                          {rowBusy && <Spinner />}
                        </div>
                      )}
                      {rowError?.userId === user.id && (
                        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 whitespace-normal max-w-[16rem]">{rowError.message}</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* lg 미만: 유저마다 카드 */}
      {visible.length > 0 && (
        <div className="lg:hidden space-y-3">
          {visible.map(({ user, state, summary }) => {
            const withdrawn = state.key === 'withdrawn';
            const isAdmin = user.email === adminEmail;
            const muted = withdrawn ? 'text-gray-400 dark:text-gray-600' : '';
            const rowBusy = busy?.startsWith(`${user.id}:`) ?? false;
            const date = subscriptionDate(user, withdrawn);
            return (
              <Card key={user.id} className={`p-4 space-y-3 ${rowBusy ? 'opacity-70' : ''} transition-opacity`}>
                <div className="flex items-start gap-3">
                  <Avatar name={user.name} email={user.email} muted={withdrawn} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium truncate ${muted || 'text-gray-900 dark:text-gray-100'}`}>
                      {user.name || <span className="text-gray-400 dark:text-gray-500">이름 없음</span>}
                      {isAdmin && <Badge tone="blue" className="ml-1.5">관리자</Badge>}
                    </div>
                    <div className={`text-xs font-mono break-all ${muted || 'text-gray-500 dark:text-gray-400'}`}>{user.email}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={STATE_TONE[state.key]}>{state.label}</Badge>
                    {date && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums">{date}</div>}
                  </div>
                </div>

                {!withdrawn && (
                  <div className="flex flex-wrap items-center gap-1">{chips(user, summary.delivering, summary.label)}</div>
                )}

                <div className={`text-xs tabular-nums ${muted || 'text-gray-500 dark:text-gray-400'}`}>
                  가입 {formatCalendarDate(user.createdAt)} · 발송 {user.emailsSent} · 생략 {user.emailsSkipped}
                </div>

                {!withdrawn && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-800">
                    {actions(user, isAdmin)}
                    {rowBusy && <Spinner />}
                  </div>
                )}
                {rowError?.userId === user.id && (
                  <p className="text-xs text-red-600 dark:text-red-400">{rowError.message}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
