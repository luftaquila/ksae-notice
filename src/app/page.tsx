'use client';

import { useState, useEffect } from 'react';
import PostTable from '@/components/PostTable';

interface Stats {
  activeSubscribers: number;
  maxSubscribers: number;
  registrationOpen: boolean;
  lastCrawl: { finishedAt: string; boardType: string; newPostsCount: number } | null;
}

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Stats banner */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8 sm:hidden">
        <div className="mb-3">
          <div className="text-sm text-gray-500">구독자</div>
          <div className="text-lg font-bold text-gray-900 mt-1">
            {stats ? `${stats.activeSubscribers} / ${stats.maxSubscribers}` : '-'}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">최근 새로고침</div>
          <div className="text-lg font-bold text-gray-900 mt-1">
            {stats?.lastCrawl?.finishedAt
              ? new Date(stats.lastCrawl.finishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
              : '-'}
          </div>
          <div className="text-xs text-gray-400 mt-1">7AM ~ 7PM / 5분 주기</div>
        </div>
      </div>
      <div className="hidden sm:grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">구독자</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {stats ? `${stats.activeSubscribers} / ${stats.maxSubscribers}` : '-'}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">최근 새로고침</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {stats?.lastCrawl?.finishedAt
              ? new Date(stats.lastCrawl.finishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
              : '-'}
          </div>
          <div className="text-xs text-gray-400 mt-1">7AM ~ 7PM / 5분 주기</div>
        </div>
      </div>

      {/* Post list */}
      <PostTable />
    </div>
  );
}
