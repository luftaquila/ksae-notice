import Link from 'next/link';
import { MIN_CARD_AMOUNT } from '@/lib/payment/nicepay';
import { getBusinessInfo, getSubscriptionPrice } from '@/lib/payment/pricing';

// 설정값을 읽으므로 빌드 시점에 미리 그릴 수 없다.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'KSAE 공지봇 · 판매자 정보 및 환불규정',
};

function Section({ id, title, eyebrow, children }: { id?: string; title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    // 하단정보의 링크가 바로 해당 절로 오도록 앵커를 준다.
    <section id={id} className="mb-6 scroll-mt-20">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
      <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
        {children}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="shrink-0 font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-gray-900 dark:text-gray-100 sm:text-right">{value}</dd>
    </div>
  );
}

export default async function PolicyPage() {
  const business = getBusinessInfo();
  const price = getSubscriptionPrice();
  // 값이 비어 있으면 그럴듯한 자리표시자 대신 사실대로 적는다.
  const or = (value: string) => value || '미등록';
  const contact = business.bizEmail ? (
    <a href={`mailto:${business.bizEmail}`} className="underline underline-offset-2">{business.bizEmail}</a>
  ) : (
    '미등록'
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">판매자 정보 및 이용약관</h1>

      <Section eyebrow="전자상거래 고지" title="판매자 정보">
        <dl>
          <Row label="상호" value={or(business.bizName)} />
          <Row label="대표자" value={or(business.bizOwner)} />
          <Row label="사업자등록번호" value={or(business.bizRegNo)} />
          <Row label="통신판매업" value={or(business.bizMailOrderNo)} />
          <Row label="주소" value={or(business.bizAddress)} />
          <Row label="연락처" value={or(business.bizTel)} />
          <Row label="이메일" value={contact} />
        </dl>
      </Section>

      <Section eyebrow="판매 상품" title="연간 구독">
        <dl>
          <Row label="상품" value="KSAE 공지사항·규정 이메일 알림 1년 이용권" />
          <Row label="이용료" value={`${price.toLocaleString('ko-KR')}원 / 1년`} />
          <Row label="이용 기간" value="결제일부터 해당 연도 12월 31일까지" />
          <Row label="결제수단" value="신용·체크카드 및 간편결제" />
          <Row
            label="최소 결제금액"
            value={`${MIN_CARD_AMOUNT.toLocaleString('ko-KR')}원 (카드사 최소 승인금액)`}
          />
        </dl>
        <p className="px-4 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          결제는 나이스페이먼츠(주)를 통해 처리되며, 카드정보는 공지봇 서버에 저장되지 않습니다.
          알림 카테고리 선택은 무료이고, 이메일 발송은 결제된 구독 기간이 남아 있는 동안에만 이루어집니다.
        </p>
      </Section>

      <Section id="refund" eyebrow="환불" title="취소 및 환불 규정">
        <dl>
          <Row label="전액 환불" value="결제 후 7일 이내이고, 그 사이 알림 메일을 한 통도 받지 않은 경우" />
          <Row label="부분 환불" value="지원하지 않습니다. 잔여 기간에 대한 일할 환불은 없습니다." />
          <Row label="처리 기간" value="요청 확인 후 영업일 기준 3일 이내 취소, 카드사 반영까지 최대 7영업일" />
          <Row label="문의" value={contact} />
        </dl>
        <p className="px-4 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          환불이 완료되면 해당 결제로 늘어난 구독 기간은 결제 직전 상태로 되돌아갑니다.
          환불은 위 이메일로 주문번호와 함께 요청해 주세요.
        </p>
      </Section>

      <Section id="terms" eyebrow="이용약관" title="서비스 이용 조건">
        <dl>
          <Row label="사업자" value={`${or(business.bizName)} (대표 ${or(business.bizOwner)})`} />
          <Row label="서비스" value="KSAE 대학생 자작자동차대회 공지사항·규정 게시글 이메일 알림" />
          <Row label="계정" value="Google 계정으로만 가입하며, 계정당 1인이 사용합니다." />
          <Row label="발송 한도" value="일일 발송량이 제한되어 있어 공지가 몰리는 날에는 알림이 누락될 수 있습니다." />
          <Row label="구독자 수" value="발송 한도에 맞춰 유료 구독자 수에 상한이 있으며, 상한에 도달하면 신규 결제가 중단됩니다." />
          <Row label="탈퇴" value="구독 관리 화면에서 즉시 탈퇴할 수 있습니다. 잔여 기간은 환불되지 않습니다." />
        </dl>
        <p className="px-4 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          본 서비스는 KSAE 공식 서비스가 아니며, 원문 공지의 내용과 시점은 KSAE 홈페이지를 기준으로 합니다.
          크롤링 실패나 발송 한도 초과로 알림이 누락될 수 있으므로 중요한 일정은 원문을 확인해 주세요.
        </p>
      </Section>

      <Section id="privacy" eyebrow="개인정보" title="개인정보처리방침">
        <dl>
          <Row label="처리자" value={`${or(business.bizName)} (대표 ${or(business.bizOwner)})`} />
          <Row label="수집 항목" value="이름, 이메일, 프로필 사진, 구독 카테고리, 알림 발송 기록, 결제 기록" />
          <Row label="수집 방법" value="Google 계정 로그인 시 제공되는 정보와 서비스 이용 과정에서 자동 생성되는 기록" />
          <Row label="이용 목적" value="회원 식별과 관리, 공지·규정 알림 메일 발송, 구독료 결제와 환불 처리" />
          <Row
            label="보유 기간"
            value="회원 탈퇴 시까지. 탈퇴 시 구독 기간과 구독 정보는 소멸하며, 대금결제 기록은 관련 법령에 따라 보존합니다."
          />
          <Row
            label="제3자 제공"
            value="결제 처리를 위해 나이스페이먼츠(주)에, 메일 발송을 위해 Brevo(Sendinblue SAS)에 필요한 최소 정보만 제공합니다."
          />
          <Row label="파기" value="보유 기간이 지나거나 처리 목적이 달성되면 지체 없이 삭제합니다." />
          <Row label="이용자의 권리" value="열람·정정·삭제·처리정지를 요구할 수 있으며, 구독 관리 화면에서 즉시 탈퇴할 수 있습니다." />
          <Row label="문의" value={contact} />
        </dl>
        <p className="px-4 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          카드정보는 나이스페이먼츠(주)가 처리하며 공지봇 서버에는 저장되지 않습니다.
          동의를 거부할 수 있으나 필수 정보이므로 거부 시 회원가입과 알림 수신이 불가합니다.
        </p>
      </Section>

      <Link
        href="/"
        className="inline-block text-sm px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:border-gray-300 active:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition"
      >
        홈으로
      </Link>
    </div>
  );
}
