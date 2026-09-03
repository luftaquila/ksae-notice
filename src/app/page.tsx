'use client';

import { useState, useEffect } from 'react';
import PostTable from '@/components/PostTable';

interface Stats {
  activeSubscribers: number;
  maxSubscribers: number;
  registrationOpen: boolean;
  lastCrawl: { finishedAt: string; boardType: string; newPostsCount: number } | null;
}

function getRelativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function getTickInterval(dateStr: string): number {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 1000;
  if (diff < 3600) return 60_000;
  if (diff < 86400) return 3600_000;
  return 86400_000;
}

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetch('/api/stats')
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const finishedAt = stats?.lastCrawl?.finishedAt;
    if (!finishedAt) return;
    const id = setTimeout(() => setTick((t) => t + 1), getTickInterval(finishedAt));
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
            {stats?.lastCrawl?.finishedAt
              ? getRelativeTime(stats.lastCrawl.finishedAt)
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
            {stats?.lastCrawl?.finishedAt
              ? getRelativeTime(stats.lastCrawl.finishedAt)
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
      <PostTable />
    </div>
  );
}
