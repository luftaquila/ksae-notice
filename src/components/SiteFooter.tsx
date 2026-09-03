'use client';

import { useEffect, useState } from 'react';

// 전자상거래법 제10조 표시사항은 초기 화면에 있어야 한다. 값은 관리자 설정에
// 있으므로 정적으로 박지 않고 /api/policy 에서 읽는다. 법이 요구하는 건 항목의
// 존재이지 크기가 아니므로, 링크 한 줄과 사업자 정보 한 줄로 접는다.
interface Business {
  bizName: string;
  bizOwner: string;
  bizRegNo: string;
  bizMailOrderNo: string;
  bizAddress: string;
  bizTel: string;
  bizEmail: string;
}

const LINKS = [
  { href: '/policy', label: '이용약관' },
  { href: '/policy#privacy', label: '개인정보처리방침' },
  { href: '/policy#refund', label: '취소·환불규정' },
];

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
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-3">
      <div className="max-w-6xl mx-auto px-4 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hover:text-gray-600 dark:hover:text-gray-300 transition"
            >
              {link.label}
            </a>
          ))}
        </div>

        {business && (
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            <span>{or(business.bizName)}</span>
            <span>대표 {or(business.bizOwner)}</span>
            <span>사업자등록번호 {or(business.bizRegNo)}</span>
            <span>통신판매업신고 {or(business.bizMailOrderNo)}</span>
            <span>{or(business.bizAddress)}</span>
            <span>{or(business.bizTel)}</span>
            <span>
              {business.bizEmail ? (
                <a href={`mailto:${business.bizEmail}`} className="hover:text-gray-600 dark:hover:text-gray-300 transition">
                  {business.bizEmail}
                </a>
              ) : (
                '이메일 미등록'
              )}
            </span>
          </div>
        )}
      </div>
    </footer>
  );
}
