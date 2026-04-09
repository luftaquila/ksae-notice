'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [perPage, setPerPage] = useState(25);
  const [pinnedFirst, setPinnedFirst] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pinnedFirst') !== 'false';
    }
    return true;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const isMobile = useIsMobile();

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();

    const hasRule = selectedCategories.includes('규정');
    const noticeCategories = selectedCategories.filter((c) => c !== '규정');

    if (selectedCategories.length > 0 && !hasRule && noticeCategories.length > 0) {
      params.set('board', 'notice');
      if (noticeCategories.length === 1) params.set('category', noticeCategories[0]);
    } else if (hasRule && noticeCategories.length === 0) {
      params.set('board', 'rule');
    }

    if (search) params.set('search', search);
    if (!pinnedFirst) params.set('pinnedFirst', 'false');
    params.set('page', String(page));
    params.set('limit', String(perPage));

    try {
      const res = await fetch(`/api/posts?${params}`);
      const data = await res.json();
      let filtered = data.posts;

      if (selectedCategories.length > 0) {
        filtered = filtered.filter((p: Post) => {
          if (p.boardType === 'rule') return hasRule;
          return noticeCategories.length === 0 || (p.category && noticeCategories.includes(p.category));
        });
      }

      setPosts(filtered);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch {
      console.error('Failed to fetch posts');
    } finally {
      setLoading(false);
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
    debounceRef.current = setTimeout(() => setSearch(value), 300);
  };

  return (
    <div>
      {/* Category filter */}
      <div className="mb-3">
        <CategoryFilter
          categories={ALL_CATEGORIES}
          selected={selectedCategories}
          onChange={setSelectedCategories}
        />
      </div>

      {/* Search + pinned toggle */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="제목 검색"
          className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => {
            const next = !pinnedFirst;
            setPinnedFirst(next);
            localStorage.setItem('pinnedFirst', String(next));
          }}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition ${
            pinnedFirst
              ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}
          title={pinnedFirst ? '공지 상단 고정 중 (클릭하면 시간순)' : '시간순 정렬 중 (클릭하면 공지 고정)'}
        >
          <span className="text-base leading-none">{pinnedFirst ? '\u{1F4CC}' : '\u{1F552}'}</span>
          <span className="hidden sm:inline">{pinnedFirst ? '고정' : '시간순'}</span>
        </button>
      </div>

      {/* Post list */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden" style={{ minHeight: loading ? 400 : undefined }}>
        {loading ? (
          <div className="p-8 text-center text-gray-400">불러오는 중...</div>
        ) : posts.length === 0 ? (
          <div className="p-8 text-center text-gray-400">게시글이 없습니다.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-sm text-gray-500">
                <th className="px-4 py-3 whitespace-nowrap text-center" style={{ width: '1%' }}>분류</th>
                <th className="px-4 py-3">제목</th>
                <th className="px-4 py-3 w-28 hidden sm:table-cell">등록일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {posts.map((post) => {
                const chipLabel = post.boardType === 'rule' ? '규정' : (post.category || '공통');
                const chipColor = post.boardType === 'rule'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700';
                return (
                  <tr
                    key={`${post.boardType}-${post.postNumber}`}
                    className={`hover:bg-gray-50 transition ${post.isPinned ? 'bg-blue-50/50' : ''}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded whitespace-nowrap ${chipColor}`}>
                        {chipLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={isMobile ? getMobileUrl(post) : post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-900 hover:text-blue-600 transition"
                      >
                        {post.title}
                      </a>
                      <div className="text-xs text-gray-400 mt-0.5 sm:hidden">{post.date}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 hidden sm:table-cell">{post.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row justify-center items-center gap-2 mt-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 disabled:opacity-50 hover:bg-gray-50 transition"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 sm:hidden">
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
                  className={`px-3 py-1.5 text-sm rounded border transition ${
                    p === page
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 disabled:opacity-50 hover:bg-gray-50 transition"
          >
            다음
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded bg-white"
          >
            <option value={10}>10개</option>
            <option value={25}>25개</option>
            <option value={50}>50개</option>
          </select>
          <span className="text-sm text-gray-400">총 {total}건</span>
        </div>
      </div>
    </div>
  );
}
