'use client';

import { useState, useEffect } from 'react';
import PostTable from '@/components/PostTable';

interface Stats {
  activeSubscribers: number;
  maxSubscribers: number;
  registrationOpen: boolean;
  lastCrawl: { finishedAt: string; ageMs: number; boardType: string; newPostsCount: number } | null;
  refreshAfterMs: number;
}

// 서버가 준 나이(ageMs)에 응답을 받은 뒤 흐른 시간을 더한다. 브라우저 시계는 쓰지 않는다 —
// finishedAt 을 Date.now() 로 빼면 시계가 틀린 브라우저에서 엉뚱한 값이 나온다.
function ageNow(stats: Stats & { receivedAt: number }): number {
  return (stats.lastCrawl?.ageMs ?? 0) + (Date.now() - stats.receivedAt);
}

function getRelativeTime(ageMs: number): string {
  const diff = Math.floor(ageMs / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function getTickInterval(ageMs: number): number {
  const diff = Math.floor(ageMs / 1000);
  if (diff < 60) return 1000;
  if (diff < 3600) return 60_000;
  if (diff < 86400) return 3600_000;
  return 86400_000;
}

export default function Home() {
  const [stats, setStats] = useState<(Stats & { receivedAt: number }) | null>(null);
  const [tick, setTick] = useState(0);
  // 크롤이 끝났다는 신호마다 올린다. PostTable 이 이걸 보고 목록을 다시 읽는다.
  const [refreshToken, setRefreshToken] = useState(0);

  // 데이터가 바뀌는 순간은 서버가 안다 — 크롤을 도는 게 이 서버라서. /api/events(SSE)로
  // "크롤 끝" 을 받으면 통계와 글 목록을 다시 읽는다. EventSource 가 없거나 끊긴 동안만
  // 서버가 정해준 간격(refreshAfterMs)으로 폴링한다. 탭이 다시 보일 때도 한 번 읽는다.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let live = false; // SSE 연결이 살아 있는가

    // refreshPosts: 글 목록도 다시 읽게 할지. 첫 로드는 PostTable 이 스스로 읽으니 올리지 않는다.
    const load = async (refreshPosts: boolean) => {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) throw new Error(String(res.status));
        const data: Stats = await res.json();
        if (cancelled) return;
        setStats({ ...data, receivedAt: Date.now() });
        if (refreshPosts) setRefreshToken((t) => t + 1);
        if (!live) timer = setTimeout(() => load(true), Math.max(1_000, data.refreshAfterMs ?? 60_000));
      } catch {
        if (!cancelled && !live) timer = setTimeout(() => load(true), 60_000);
      }
    };

    load(false);

    let source: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      source = new EventSource('/api/events');
      source.onopen = () => {
        live = true;
        clearTimeout(timer);
      };
      source.addEventListener('crawl', () => load(true));
      // EventSource 가 스스로 재접속한다. 끊긴 동안은 폴링으로 돌아간다 —
      // 살아 있던 연결이 끊긴 순간에만, 재시도마다 부르지 않게.
      source.onerror = () => {
        if (!live) return;
        live = false;
        load(true);
      };
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      load(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      source?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!stats?.lastCrawl) return;
    const id = setTimeout(() => setTick((t) => t + 1), getTickInterval(ageNow(stats)));
    return () => clearTimeout(id);
  }, [stats, tick]);

  return (
    <div className="max-w-6xl mx-auto px-4 pt-4 pb-8">
      {/* Stats banner */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-2 sm:hidden">
        <div className="mb-3">
          <div className="text-sm text-gray-500 dark:text-gray-400">구독자</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
            {stats ? `${stats.activeSubscribers} / ${stats.maxSubscribers}` : '-'}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400">최근 새로고침</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
            {stats?.lastCrawl
              ? getRelativeTime(ageNow(stats))
              : '-'}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {stats?.lastCrawl?.finishedAt
              ? `${new Date(stats.lastCrawl.finishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (오전 7시 ~ 오후 7시 / 5분 간격)`
              : '오전 7시 ~ 오후 7시 / 5분 간격'}
          </div>
        </div>
      </div>
      <div className="hidden sm:grid grid-cols-2 gap-4 mb-2">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">구독자</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {stats ? `${stats.activeSubscribers} / ${stats.maxSubscribers}` : '-'}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">최근 새로고침</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {stats?.lastCrawl
              ? getRelativeTime(ageNow(stats))
              : '-'}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {stats?.lastCrawl?.finishedAt
              ? `${new Date(stats.lastCrawl.finishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (오전 7시 ~ 오후 7시 / 5분 간격)`
              : '오전 7시 ~ 오후 7시 / 5분 간격'}
          </div>
        </div>
      </div>

      {/* Post list */}
      <PostTable refreshToken={refreshToken} />
    </div>
  );
}
