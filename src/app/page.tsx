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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">구독자</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {stats ? `${stats.activeSubscribers} / ${stats.maxSubscribers}` : '-'}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">크롤링 주기</div>
          <div className="text-lg font-semibold text-gray-900 mt-1">5분</div>
          <div className="text-xs text-gray-400 mt-1">
            매일 07:00 ~ 19:00 (KST)
            {stats?.lastCrawl?.finishedAt && (
              <div>마지막: {new Date(stats.lastCrawl.finishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</div>
            )}
          </div>
        </div>
      </div>

      {/* Post list */}
      <PostTable />
    </div>
  );
}
