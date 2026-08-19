import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getOrder } from '@/lib/payment/orders';
import { formatLocalDateTime } from '@/lib/format';

// 결과 판정은 이미 returnUrl 핸들러에서 끝났다. 이 화면은 그 결과를 옮겨 적기만 한다.
export const dynamic = 'force-dynamic';

const OUTCOMES: Record<string, { title: string; message: string; tone: string }> = {
  paid: {
    title: '결제가 완료되었습니다',
    message: '구독 기간이 연장되었습니다.',
    tone: 'text-blue-600 dark:text-blue-400',
  },
  failed: {
    title: '결제가 완료되지 않았습니다',
    message: '결제가 취소되었거나 승인이 거절되었습니다. 요금은 청구되지 않습니다.',
    tone: 'text-red-600 dark:text-red-400',
  },
  invalid: {
    title: '결제 정보를 확인할 수 없습니다',
    message: '주문을 찾지 못했습니다. 결제가 진행되었는데 이 화면이 보인다면 문의해 주세요.',
    tone: 'text-red-600 dark:text-red-400',
  },
};

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; order?: string }>;
}) {
  const params = await searchParams;
  const outcome = OUTCOMES[params.result ?? ''] ?? OUTCOMES.invalid;

  // 주문은 본인 것일 때만 보여준다. 주문번호는 결제창을 거쳐 브라우저에 노출된다.
  const session = await auth();
  const order = params.order ? getOrder(params.order) : undefined;
  const owned = order && session?.user?.id === order.userId ? order : undefined;

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className={`text-xl font-bold ${outcome.tone}`}>{outcome.title}</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {owned?.status === 'failed' && owned.failReason
          ? `${owned.failReason} 요금은 청구되지 않습니다.`
          : owned?.status === 'paid' && owned.approvedAt
            ? `${formatLocalDateTime(owned.approvedAt)}에 결제가 완료되었습니다.`
            : outcome.message}
      </p>

      {owned && (
        <dl className="mt-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-gray-500 dark:text-gray-400">상품</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">{owned.goodsName}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-gray-500 dark:text-gray-400">결제금액</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">{owned.amount.toLocaleString('ko-KR')}원</dd>
          </div>
          {owned.grantedTo && (
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-gray-500 dark:text-gray-400">구독 만료일</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">{owned.grantedTo.slice(0, 10)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-gray-500 dark:text-gray-400">주문번호</dt>
            <dd className="text-gray-500 dark:text-gray-400 break-all text-right">{owned.orderId}</dd>
          </div>
        </dl>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          href="/dashboard"
          className="text-sm px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition"
        >
          구독 관리로 돌아가기
        </Link>
        <Link
          href="/policy"
          className="text-sm px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:border-gray-300 active:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition"
        >
          이용약관 · 환불규정
        </Link>
      </div>
    </div>
  );
}
