'use client';

import type { ReactNode } from 'react';

// 대시보드와 관리자 화면이 같이 쓰는 작은 조각들. 색과 크기를 한 곳에서 정한다.

export const BUTTON_PRIMARY =
  'text-sm px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const BUTTON_GHOST =
  'text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-blue-300 hover:text-blue-500 active:border-blue-300 active:text-blue-500 dark:hover:border-blue-500/50 dark:hover:text-blue-400 dark:active:border-blue-500/50 dark:active:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const BUTTON_DANGER =
  'text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-300 hover:text-red-500 active:border-red-300 active:text-red-500 dark:hover:border-red-500/50 dark:hover:text-red-400 dark:active:border-red-500/50 dark:active:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const INPUT =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

export type BadgeTone = 'gray' | 'blue' | 'green' | 'amber' | 'red';

const BADGE_TONE: Record<BadgeTone, string> = {
  gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  green: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  red: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
};

export function Badge({ tone = 'gray', children, className = '' }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${BADGE_TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 animate-spin text-gray-400 dark:text-gray-500 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

export function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-800 ${className}`} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 ${className}`}>
      {children}
    </div>
  );
}

// 표 헤더·셀. 관리자 화면의 표마다 같은 밀도로 찍힌다.
export const TH = 'pb-2 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap';
export const TD = 'py-3 pr-4 align-top';
