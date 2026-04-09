'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CATEGORY_COLORS } from '@/lib/constants';
import CategoryFilter from './CategoryFilter';

interface Post {
  id: number;
  boardType: string;
  postNumber: number;
  title: string;
  category: string | null;
  date: string;
  isPinned: number;
  url: string;
}

const ALL_CATEGORIES = [
  { id: '공통', label: '공통' },
  { id: 'Baja', label: 'Baja' },
  { id: 'Formula', label: 'Formula' },
  { id: 'EV', label: 'EV' },
  { id: '자율주행', label: '자율주행' },
  { id: '규정', label: '규정' },
];

function getMobileUrl(post: Post): string {
  const code = post.boardType === 'notice' ? 'J_notice' : 'J_rule';
  return `https://www.ksae.org/jajak/mobile/bbs/view.php?number=${post.postNumber}&page=1&code=${code}`;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

export default function PostTable() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [pinnedFirst, setPinnedFirst] = useState(true);

  useEffect(() => {
    const savedPerPage = localStorage.getItem('perPage');
    if (savedPerPage) setPerPage(Number(savedPerPage));
    const savedPinned = localStorage.getItem('pinnedFirst');
    if (savedPinned !== null) setPinnedFirst(savedPinned === 'true');
  }, []);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const isMobile = useIsMobile();

  const isInitialLoad = useRef(true);

  const fetchPosts = useCallback(async () => {
    if (isInitialLoad.current) setLoading(true);
    const params = new URLSearchParams();

    if (selectedCategories.length > 0) {
      params.set('categories', selectedCategories.join(','));
    }

    if (search) params.set('search', search);
    if (!pinnedFirst) params.set('pinnedFirst', 'false');
    params.set('page', String(page));
    params.set('limit', String(perPage));

    try {
      const res = await fetch(`/api/posts?${params}`);
      const data = await res.json();
      setPosts(data.posts);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch {
      console.error('Failed to fetch posts');
    } finally {
      setLoading(false);
      isInitialLoad.current = false;
    }
  }, [selectedCategories, search, page, perPage, pinnedFirst]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    setPage(1);
  }, [selectedCategories, search, perPage, pinnedFirst]);

  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 150);
  };

  return (
    <div>
      <div className="sticky top-14 z-10 bg-gray-50 dark:bg-gray-950 pt-4 pb-4 -mx-4 px-4">
      {/* Category filter */}
      <div className="mb-3">
        <CategoryFilter
          categories={ALL_CATEGORIES}
          selected={selectedCategories}
          onChange={setSelectedCategories}
        />
      </div>

      {/* Search + pinned toggle */}
      <div className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="제목 검색"
          className="flex-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => {
            const next = !pinnedFirst;
            setPinnedFirst(next);
            localStorage.setItem('pinnedFirst', String(next));
          }}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
            pinnedFirst
              ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30 dark:hover:bg-blue-500/20'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700'
          }`}
          title={pinnedFirst ? '고정 공지 우선 정렬 (클릭하면 시간순)' : '시간순 정렬 (클릭하면 고정 공지 우선)'}
        >
          <span className="text-base leading-none">{pinnedFirst ? '\u{1F4CC}' : '\u{1F552}'}</span>
        </button>
      </div>
      </div>

      {/* Post list */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">불러오는 중...</div>
        ) : posts.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">게시글이 없습니다.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-left text-sm text-gray-500 dark:text-gray-400">
                <th className="pl-4 pr-2 py-3 whitespace-nowrap text-center w-[1%]">분류</th>
                <th className="px-2 py-3">제목</th>
                <th className="px-4 py-3 w-28 hidden sm:table-cell">등록일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {posts.map((post) => {
                const chipLabel = post.boardType === 'rule' ? '규정' : (post.category || '공통');
                const chipColor = CATEGORY_COLORS[chipLabel]?.chip || 'bg-gray-100 text-gray-700';
                return (
                  <tr
                    key={`${post.boardType}-${post.postNumber}`}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                  >
                    <td className="pl-4 pr-2 py-3 whitespace-nowrap text-center">
                      <span className={`inline-block text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${chipColor}`}>
                        {chipLabel}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <a
                        href={isMobile ? getMobileUrl(post) : post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition"
                      >
                        {post.isPinned ? <span className="mr-1">📌</span> : null}
                        {(() => { const d = new Date(post.date); const now = new Date(); return (now.getTime() - d.getTime()) < 3 * 86400000 ? <span className="mr-1">💡</span> : null; })()}
                        {post.title}
                      </a>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 sm:hidden">{post.date}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 hidden sm:table-cell">{post.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col items-center gap-2 mt-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400 sm:hidden">
            {page} / {totalPages}
          </span>
          <div className="hidden sm:flex gap-1">
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 4, totalPages - 9));
              const p = start + i;
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-9 py-1.5 text-sm text-center rounded border transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                    p === page
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer"
          >
            다음
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 dark:text-gray-500">총 {total}건</span>
          <select
            value={perPage}
            onChange={(e) => { const v = Number(e.target.value); setPerPage(v); localStorage.setItem('perPage', String(v)); }}
            className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 dark:text-gray-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <option value={10}>10개</option>
            <option value={25}>25개</option>
            <option value={50}>50개</option>
          </select>
        </div>
      </div>
    </div>
  );
}
