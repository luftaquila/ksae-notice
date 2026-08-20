'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function ConsentForm() {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = async () => {
    if (!agreed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signup-consent', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '가입을 완료하지 못했습니다.');

      // 계정이 생겼으니 Google 로 한 번 더 다녀오면 세션이 만들어진다. 이미 동의된
      // 계정이라 화면은 그대로 지나가고, 가입 직후에는 구독 설정으로 보낸다.
      await signIn('google', { callbackUrl: '/dashboard' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '가입을 완료하지 못했습니다.');
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/signup-cancel', { method: 'POST' });
    } finally {
      window.location.replace('/');
    }
  };

  return (
    <>
      <label className="mt-5 flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => {
            setAgreed(e.target.checked);
            setError(null);
          }}
          className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          <b className="text-blue-600 dark:text-blue-400">[필수]</b> 개인정보 수집·이용에 동의하며,{' '}
          <b>만 14세 이상</b>입니다.
        </span>
      </label>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
      )}

      <div className="mt-6 flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="text-sm px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:border-gray-300 active:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={complete}
          disabled={busy || !agreed}
          className="text-sm px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition cursor-pointer disabled:opacity-50"
        >
          {busy ? '처리 중...' : '가입 완료'}
        </button>
      </div>
    </>
  );
}
