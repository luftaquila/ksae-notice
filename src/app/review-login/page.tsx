import Link from 'next/link';
import { notFound } from 'next/navigation';
import { reviewLoginEnabled } from '@/lib/review';
import ReviewLoginForm from './ReviewLoginForm';

// 환경변수를 읽으므로 미리 그릴 수 없다.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'KSAE 공지봇 · 심사용 로그인',
  robots: { index: false, follow: false },
};

// 나이스페이·카드사 심사용 ID/PW 로그인. 자격증명이 배포 환경에 없으면 404 —
// 평시에는 존재하지 않는 경로다 (lib/review.ts).
export default function ReviewLoginPage() {
  if (!reviewLoginEnabled()) notFound();

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">심사용</p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">아이디 로그인</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        결제 심사를 위해 제공되는 로그인 경로입니다. 일반 이용자는{' '}
        <Link href="/" className="underline underline-offset-2">첫 화면</Link>에서 Google 계정으로 로그인해 주세요.
      </p>

      <ReviewLoginForm />
    </div>
  );
}
