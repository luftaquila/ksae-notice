'use client';

import { useEffect, useState } from 'react';

// 전자상거래법 제10조 표시사항은 홈페이지 하단에 있어야 한다. 값은 관리자 설정에
// 있으므로 정적으로 박지 않고 /api/policy 에서 읽는다.
interface Business {
  bizName: string;
  bizOwner: string;
  bizRegNo: string;
  bizMailOrderNo: string;
  bizAddress: string;
  bizTel: string;
  bizEmail: string;
}

export default function SiteFooter() {
  const [business, setBusiness] = useState<Business | null>(null);

  useEffect(() => {
    fetch('/api/policy')
      .then((res) => res.json())
      .then((data) => setBusiness(data.business))
      .catch(() => {});
  }, []);

  const or = (value?: string) => value || '미등록';

  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-6">
      <div className="max-w-6xl mx-auto px-4 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
        <div className="text-sm text-gray-500 dark:text-gray-400">KSAE 대학생 자작자동차대회 공지사항 알림봇</div>

        {business && (
          <div className="mt-3 space-y-0.5">
            <div>
              상호 {or(business.bizName)} · 대표자 {or(business.bizOwner)} · 사업자등록번호 {or(business.bizRegNo)}
            </div>
            <div>통신판매업신고 {or(business.bizMailOrderNo)}</div>
            <div>주소 {or(business.bizAddress)}</div>
            <div>
              전화 {or(business.bizTel)} · 이메일{' '}
              {business.bizEmail ? (
                <a href={`mailto:${business.bizEmail}`} className="underline underline-offset-2">
                  {business.bizEmail}
                </a>
              ) : (
                '미등록'
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          <a href="/policy" className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300 transition">
            이용약관
          </a>
          <a href="/policy#privacy" className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300 transition">
            개인정보처리방침
          </a>
          <a href="/policy#refund" className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300 transition">
            취소·환불규정
          </a>
        </div>
      </div>
    </footer>
  );
}
