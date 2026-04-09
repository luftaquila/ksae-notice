# KSAE 공지봇

KSAE 대학생 자작자동차대회 공지사항 및 규정 페이지를 크롤링하여 구독자에게 이메일 알림을 보내는 서비스.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Database**: SQLite (Drizzle ORM + better-sqlite3)
- **Auth**: Auth.js v5 (Google OAuth, JWT session)
- **Email**: Brevo API (일 300통 무료 제한)
- **Crawling**: cheerio + node-cron
- **UI**: Tailwind CSS v4
- **Deployment**: Podman container

## Project Structure

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── page.tsx            # 메인 페이지 (공개, 게시글 목록 + 필터)
│   ├── dashboard/page.tsx  # 구독 관리 (로그인 필요)
│   ├── admin/page.tsx      # 관리자 대시보드
│   └── api/
│       ├── auth/           # NextAuth
│       ├── posts/          # 게시글 조회 API
│       ├── subscriptions/  # 구독 관리 API
│       ├── stats/          # 공개 통계 API
│       └── admin/          # 관리자 전용 API (settings, users, stats)
├── lib/
│   ├── db/
│   │   ├── schema.ts       # Drizzle 스키마 (users, subscriptions, posts, emailLogs, crawlLogs, settings)
│   │   ├── index.ts        # DB 싱글톤
│   │   └── migrate.ts      # 마이그레이션 + 기본 설정 시드
│   ├── auth.ts             # Auth.js 설정
│   ├── constants.ts        # 보드 URL, 카테고리 매핑, 구독 카테고리 정의
│   ├── crawler/
│   │   ├── parser.ts       # cheerio HTML 파싱
│   │   ├── index.ts        # 크롤 오케스트레이터 (crawlAll, crawlLatest)
│   │   └── scheduler.ts    # node-cron 스케줄러
│   ├── email/
│   │   ├── brevo.ts        # Brevo API 클라이언트
│   │   ├── templates.ts    # 이메일 HTML 템플릿
│   │   └── sender.ts       # 알림 발송 + 로깅
│   └── subscription/
│       └── renewal.ts      # 12월 구독 갱신 리마인더
├── components/             # React 컴포넌트
└── middleware.ts            # /dashboard, /admin 라우트 보호
server.ts                   # 커스텀 서버 (Next.js + node-cron)
drizzle/                    # 자동 생성 마이그레이션 SQL
```

## Commands

```bash
npm run dev        # 개발 서버 (tsx server.ts)
npm run build      # Next.js 빌드
npm run start      # 프로덕션 서버
npm run migrate    # DB 마이그레이션 실행
npm run lint       # ESLint
```

## 크롤링 대상

| 게시판 | URL 코드 | 카테고리 |
|--------|----------|---------|
| 공지사항 | `J_notice` | 공통(Z), Baja(A), Formula(B), EV(C), 자율주행(D) |
| 규정 | `J_rule` | (전체 단일 구독) |

- 크롤링 주기: 5분 (`*/5 7-18 * * *`, KST)
- 게시글 중복 방지: `(boardType, postNumber)` unique index + `INSERT OR IGNORE`
- 공지(상단고정) 게시글: `notice.png` 아이콘으로 감지, 별도 isPinned 플래그

## 구독 카테고리 ID

`notice_Z`, `notice_A`, `notice_B`, `notice_C`, `notice_D`, `rule`

## Environment Variables

```
AUTH_SECRET          # Auth.js 시크릿 (npx auth secret 으로 생성)
AUTH_GOOGLE_ID       # Google OAuth 클라이언트 ID
AUTH_GOOGLE_SECRET   # Google OAuth 시크릿
BREVO_API_KEY        # Brevo API 키
SENDER_EMAIL         # 발신 이메일 주소
SENDER_NAME          # 발신자 이름 (기본: KSAE 공지봇)
ADMIN_EMAIL          # 관리자 이메일 (이 이메일로 로그인하면 /admin 접근 가능)
SITE_URL             # 서비스 URL (이메일 내 링크용)
DATABASE_PATH        # SQLite DB 경로 (기본: ./data/ksae.db)
```

## Key Design Decisions

- **관리자 판별**: DB에 저장하지 않고 `ADMIN_EMAIL` 환경변수와 런타임 비교
- **구독 만료**: 매년 12/31, 12월에 두 차례 갱신 리마인더 (userId % 7로 주간 분산)
- **이메일 제한**: Brevo 일 300통 제한, 발송 전 당일 카운트 체크
- **최대 구독자**: settings 테이블에서 관리자가 동적으로 변경 가능
- **커스텀 서버**: server.ts에서 Next.js + node-cron 통합, 서버 시작 시 자동 마이그레이션 + 초기 크롤링
