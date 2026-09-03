import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PENDING_SIGNUP_COOKIE, unsealPendingSignup } from '@/lib/signup/pending';
import ConsentForm from './ConsentForm';

// 봉인한 쿠키를 읽으므로 미리 그릴 수 없다.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'KSAE 공지봇 · 개인정보 수집·이용 동의',
};

export default async function ConsentPage() {
  // 이미 로그인된 사람에게는 동의 화면이 의미가 없다.
  if ((await auth())?.user) redirect('/dashboard');

  const pending = unsealPendingSignup((await cookies()).get(PENDING_SIGNUP_COOKIE)?.value);

  if (!pending) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">가입 정보를 확인할 수 없습니다</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          동의 화면에 머무를 수 있는 시간이 지났거나 정보가 유효하지 않습니다. 처음부터 다시 로그인해 주세요.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 text-sm px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition"
        >
          홈으로
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">회원가입</p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">개인정보 수집·이용 동의</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Google 계정 연결이 완료되었습니다. 아래 필수 동의 후 가입을 마칠 수 있습니다.
      </p>

      <div className="mt-6 flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
        {pending.avatar && (
          // 외부 이미지라 next/image 최적화 대상이 아니다.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pending.avatar}
            alt=""
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full"
          />
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {pending.name || pending.email}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{pending.email}</div>
        </div>
      </div>

      <dl className="mt-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
        <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6">
          <dt className="shrink-0 w-28 font-medium text-gray-500 dark:text-gray-400">수집 항목</dt>
          <dd className="text-gray-900 dark:text-gray-100">이름, 이메일, 프로필 사진, 구독 및 알림 발송 기록</dd>
        </div>
        <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6">
          <dt className="shrink-0 w-28 font-medium text-gray-500 dark:text-gray-400">이용 목적</dt>
          <dd className="text-gray-900 dark:text-gray-100">회원 관리와 공지·규정 알림 메일 발송</dd>
        </div>
        <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6">
          <dt className="shrink-0 w-28 font-medium text-gray-500 dark:text-gray-400">보유 기간</dt>
          <dd className="text-gray-900 dark:text-gray-100">회원 탈퇴 시까지. 결제 기록은 관련 법령에 따라 보존합니다.</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        동의를 거부할 수 있으나, 필수 정보이므로 거부 시 회원가입과 알림 수신이 불가합니다.
      </p>

      <ConsentForm />
    </div>
  );
}
