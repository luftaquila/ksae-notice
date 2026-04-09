'use client';

import { useState, useEffect, useCallback } from 'react';
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

const BOARD_FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'notice', label: '공지사항' },
  { id: 'rule', label: '규정' },
];

const NOTICE_CATEGORIES = [
  { id: '공통', label: '공통' },
  { id: 'Baja', label: 'Baja' },
  { id: 'Formula', label: 'Formula' },
  { id: 'EV', label: 'EV' },
  { id: '자율주행', label: '자율주행' },
];

export default function PostTable() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (board !== 'all') params.set('board', board);
    if (selectedCategories.length === 1) params.set('category', selectedCategories[0]);
    params.set('page', String(page));
    params.set('limit', '30');

    try {
      const res = await fetch(`/api/posts?${params}`);
      const data = await res.json();
      let filtered = data.posts;
      if (selectedCategories.length > 1) {
        filtered = filtered.filter((p: Post) => p.category && selectedCategories.includes(p.category));
      }
      setPosts(filtered);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch {
      console.error('Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  }, [board, selectedCategories, page]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    setPage(1);
  }, [board, selectedCategories]);

  return (
    <div>
      {/* Board type tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {BOARD_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setBoard(f.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              board === f.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Category filter (only for notice board or all) */}
      {board !== 'rule' && (
        <div className="mb-4">
          <CategoryFilter
            categories={NOTICE_CATEGORIES}
            selected={selectedCategories}
            onChange={setSelectedCategories}
          />
        </div>
      )}

      {/* Post list */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">불러오는 중...</div>
        ) : posts.length === 0 ? (
          <div className="p-8 text-center text-gray-400">게시글이 없습니다.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-sm text-gray-500">
                <th className="px-4 py-3 w-16">구분</th>
                <th className="px-4 py-3 w-20">분류</th>
                <th className="px-4 py-3">제목</th>
                <th className="px-4 py-3 w-28 hidden sm:table-cell">등록일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {posts.map((post) => (
                <tr
                  key={`${post.boardType}-${post.postNumber}`}
                  className={`hover:bg-gray-50 transition ${post.isPinned ? 'bg-blue-50/50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block text-xs px-2 py-0.5 rounded ${
                        post.boardType === 'notice'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {post.boardType === 'notice' ? '공지' : '규정'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{post.category || '-'}</td>
                  <td className="px-4 py-3">
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-900 hover:text-blue-600 transition"
                    >
                      {post.isPinned ? (
                        <span className="text-blue-600 font-medium mr-1">[공지]</span>
                      ) : null}
                      {post.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 hidden sm:table-cell">{post.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1 mt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 disabled:opacity-50 hover:bg-gray-50 transition"
          >
            이전
          </button>
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
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 disabled:opacity-50 hover:bg-gray-50 transition"
          >
            다음
          </button>
        </div>
      )}

      <div className="text-center text-sm text-gray-400 mt-2">
        총 {total}건
      </div>
    </div>
  );
}
