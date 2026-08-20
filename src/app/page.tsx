'use client';

import { useState, useEffect } from 'react';
import PostTable from '@/components/PostTable';

interface Pricing {
  price: number;
  minAmount: number;
}

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
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetch('/api/stats')
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  // 판매가는 로그인 없이도 보여야 한다 — 구매 화면이 대시보드 안에 있어서,
  // 여기가 판매 조건을 확인할 수 있는 유일한 공개 지점이다.
  useEffect(() => {
    fetch('/api/policy')
      .then((res) => res.json())
      .then((data) => setPricing({ price: data.price, minAmount: data.minAmount }))
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

      {/* 서비스·판매 안내 */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-2">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">서비스 안내</div>
        <ul className="mt-2 list-disc list-outside pl-5 text-sm text-gray-500 dark:text-gray-400 space-y-1 leading-relaxed">
          <li>
            KSAE 대학생 자작자동차대회 공지사항·규정 게시글을 크롤링해 구독자에게 이메일로 알립니다.
          </li>
          <li>
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              연간 구독료 {pricing ? `${pricing.price.toLocaleString('ko-KR')}원` : '-'}
            </span>
            {' '}· 결제일부터 해당 연도 12월 31일까지 · 신용·체크카드 및 간편결제
          </li>
          <li>알림 카테고리(공통·Baja·Formula·EV·자율주행·규정) 선택은 무료이며, 구독 기간이 남아 있는 동안 메일이 발송됩니다.</li>
          <li>
            구매·환불 조건은 <a href="/policy" className="underline underline-offset-2">이용약관 및 환불규정</a>에서 확인할 수 있습니다.
          </li>
        </ul>
      </div>

      {/* Post list */}
      <PostTable />
    </div>
  );
}
