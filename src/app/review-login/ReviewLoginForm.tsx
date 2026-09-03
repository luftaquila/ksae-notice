'use client';

import { useState } from 'react';

const INPUT =
  'mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function ReviewLoginForm() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/review-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '로그인에 실패했습니다.');

      // 서버가 세션 쿠키를 내려줬다. 구독 관리로 보내면 된다.
      window.location.replace(data.redirect || '/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '네트워크 오류로 로그인하지 못했습니다.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} autoComplete="off" className="mt-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">
        아이디
        <input
          type="text"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          required
          autoCapitalize="off"
          spellCheck={false}
          className={INPUT}
        />
      </label>
      <label className="block mt-4 text-sm font-medium text-gray-600 dark:text-gray-300">
        비밀번호
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={INPUT}
        />
      </label>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="text-sm px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
        >
          {busy ? '확인 중...' : '로그인'}
        </button>
      </div>
    </form>
  );
}
