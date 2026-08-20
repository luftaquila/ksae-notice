# KSAE 공지봇

KSAE 대학생 자작자동차대회 공지사항 및 규정 페이지를 크롤링하여 구독자에게 이메일 알림을 보내는 서비스.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Database**: SQLite (Drizzle ORM + better-sqlite3)
- **Auth**: next-auth v5 beta (Google OAuth, JWT session)
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
│   ├── go/[id]/route.ts    # 게시글 리다이렉트 (모바일 UA 감지)
│   └── api/
│       ├── auth/           # NextAuth + 가입 동의 (signup-consent, signup-cancel)
│       ├── user/           # 계정 삭제 API
│       ├── posts/          # 게시글 조회 API
│       ├── subscriptions/  # 구독 카테고리 관리 API (무료)
│       ├── payments/       # 결제 (orders/ return/ webhook/) + 내 결제 내역
│       ├── stats/          # 공개 통계 API
│       └── admin/          # 관리자 전용 API (settings, users, stats, test-email, payments)
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
│   ├── signup/
│   │   └── pending.ts      # 동의 전 프로필을 담는 HMAC 봉인 쿠키
│   ├── payment/
│   │   ├── nicepay.ts      # 나이스페이 API 클라이언트 + 서명
│   │   ├── orders.ts       # 주문 원장, 멱등 지급/회수
│   │   ├── flow.ts         # 인증 검증 → 승인 → 지급, 웹훅, 관리자 취소
│   │   └── pricing.ts      # 구독료·판매자 정보 (settings)
│   └── subscription/
│       ├── renewal.ts      # 12월 구독 갱신 리마인더
│       ├── period.ts       # 기간 규칙 (한 번의 결제 = 한 해)
│       └── upsert.ts       # 카테고리 upsert 유틸리티
├── components/             # React 컴포넌트
├── __tests__/              # vitest API 단위 테스트
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
npm run test       # vitest 단위 테스트
```

## 크롤링 대상

| 게시판 | URL 코드 | 카테고리 |
|--------|----------|---------|
| 공지사항 | `J_notice` | 공통(Z), Baja(A), Formula(B), EV(C), 자율주행(D) |
| 규정 | `J_rule` | (전체 단일 구독) |

- 크롤링 주기: 5분 (`*/5 7-18 * * *`, KST)
- 게시글 중복 방지: `(boardType, postNumber)` unique index + SELECT→UPDATE/INSERT upsert
- 공지(상단고정) 게시글: `notice.png` 아이콘으로 감지, 별도 isPinned 플래그

## 구독 카테고리 ID

`notice_Z`, `notice_A`, `notice_B`, `notice_C`, `notice_D`, `rule`

## 회원가입 동의 흐름

**계정 행은 개인정보 동의를 받은 뒤에 만든다.** signIn 콜백은 신규 프로필을 보면 DB에
아무것도 쓰지 않고, 프로필을 HMAC으로 봉인한 httpOnly 쿠키에 담아 `/signup/consent`로
리다이렉트한다(문자열을 반환하면 Auth.js가 세션 없이 그 주소로 보낸다).

- `POST /api/auth/signup-consent`가 실제 생성자다 — 쿠키를 풀어 users 행 + 카테고리 6개 +
  `privacyConsentAt`/`privacyConsentVersion`을 쓰고 쿠키를 버린다. 구독 기간은 주지 않는다
- 이미 계정이 있으면(버튼 두 번 눌림 등) 동의만 기록하고 카테고리는 건드리지 않는다 —
  다시 깔면 사용자가 끈 것을 되살린다
- `POST /api/auth/signup-cancel`은 쿠키만 버린다. 계정이 없으니 지울 것도 없다
- 동의 후 클라이언트가 `signIn('google', { callbackUrl: '/dashboard' })`로 한 번 더 다녀와
  세션을 만들고, **가입 직후에는 구독 설정 화면으로 떨어진다**
- 봉인은 `AUTH_SECRET` HMAC + 10분 만료다. 뚫리면 남의 이메일로 가입시킬 수 있으므로
  서명 비교는 `timingSafeEqual`, 만료는 서명이 맞아도 거부한다
- 이 흐름 이전에 만들어진 계정은 `privacyConsentAt`이 NULL로 남는다 (소급 동의를 받지 않는다)

## Payments (NicePay 결제창 서버승인)

구독은 **유료**다. 카테고리 선택은 무료이고, 이메일은 `subscriptionExpiresAt`이 남아 있는
계정에만 나간다. **기간을 쓰는 곳은 결제 정산(`lib/payment/orders.ts`)과 관리자 수동 부여
둘뿐이다** — 가입도, 카테고리 토글도 기간을 만들지 않는다.

- 흐름: `POST /api/payments/orders`(서버가 금액·대상연도 확정) → `AUTHNICE.requestPay()`
  → `POST /api/payments/return`(브라우저 POST) → 승인 API → 기간 연장 → `/payments/result` 303
- **returnUrl 핸들러는 로그인 세션을 읽지 않는다.** 나이스페이 도메인에서 넘어오는 top-level
  cross-site POST라 SameSite=Lax인 next-auth 세션 쿠키가 실려 오지 않는다. 소유자는 주문 행의
  `userId`로만 판단한다
- 지급·회수는 `WHERE status = ?` 조건부 UPDATE의 `changes`로 한 번만 통과시키고 users 행
  변경을 같은 트랜잭션에 넣는다. returnUrl과 웹훅이 겹쳐도 기간이 두 번 늘어나지 않는다
- 서명: returnUrl은 `sha256(authToken + clientId + amount + secretKey)`,
  승인응답·웹훅은 `sha256(tid + amount + ediDate + secretKey)`
- 승인 API가 끊기면 승인 성립 여부를 알 수 없으므로 **망취소**(`/v1/payments/netcancel`,
  1시간 이내)를 던지고 주문을 failed로 내린다
- 웹훅은 본문에 `OK`가 없으면 나이스페이가 재전송한다. 처리 중 예외는 삼키지 않는다
- **카드 최소 승인금액은 1,000원**(오류코드 3041). 그보다 낮은 `subscriptionPrice` 설정값은
  저장돼 있어도 쓰지 않는다
- 취소는 관리자 전액 취소만이다. `grantedFrom`/`grantedTo`로 결제 직전 만료일을 복원하되,
  그 사이 다른 결제가 기간을 더 늘렸으면 되돌리지 않고 `rolledBack: false`로 알린다
- 결제창을 열었다 닫기만 해도 주문은 `pending`으로 남는다. `scheduler.ts`의 시간당 크론이
  1시간 지난 `pending`을 `expired`로 내린다 — 그래야 "`pending`으로 오래 남은 건 = 지급 누락"을
  운영 신호로 쓸 수 있다. **만료는 정리용 라벨이지 승인 게이트가 아니다**: 지급·실패 기록은
  `expired`에서도 통과시켜야 하고(`GRANTABLE`), 아니면 만료 직후 완료된 결제가 청구만 되고
  구독 기간이 안 늘어난다
- 시각 비교는 SQLite `datetime('now', ...)` 안에서 한다. `created_at`은 `datetime('now')`
  형식("2026-08-19 11:53:00")이고 JS ISO 문자열은 10번째 글자가 `T`라, 문자열 비교로 섞으면
  같은 날짜의 모든 행이 컷오프보다 작게 나온다
- 정원(`maxSubscribers`)과 접수 중단(`registrationOpen`)은 **주문 생성 시점**에만 본다.
  결제창이 떠 있는 사이 만석이 되어도 지급은 강행한다 — 돈을 이미 받았기 때문이다
- 구독료와 판매자 정보는 `settings`에 있고 `/admin`에서 바꾼다. `/policy`가 그 값을 렌더한다

## Environment Variables

`.env.example`을 `.env.local`로 복사한 후 값을 채워서 사용.

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
NICEPAY_CLIENT_ID    # 나이스페이 상점 ID (브라우저로 나가는 공개값)
NICEPAY_SECRET_KEY   # 나이스페이 시크릿 키 (서버 전용 — 저장소는 public 이므로 커밋 금지)
NICEPAY_API_BASE     # 기본 https://api.nicepay.co.kr (샌드박스는 sandbox-api...)
```

## Commit Convention

English conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, etc.

## Key Design Decisions

- **관리자 판별**: DB에 저장하지 않고 `ADMIN_EMAIL` 환경변수와 런타임 비교
- **구독 만료**: 매년 12/31, 12월에 두 차례 갱신 리마인더 (userId % 7로 주간 분산)
- **유료 구독**: 기간을 발급하는 경로는 결제 정산과 관리자 수동 부여뿐. 가입과 카테고리
  토글은 기간을 만들지 않는다 (그래야 결제를 우회할 수 없다)
- **이메일 제한**: Brevo 일 300통 제한, 발송 전 당일 카운트 체크
- **최대 구독자**: settings 테이블에서 관리자가 동적으로 변경 가능. 슬롯을 차지하는 것은
  결제된 기간이므로, 미결제 계정은 아무리 많아도 정원을 먹지 않는다
- **커스텀 서버**: server.ts에서 Next.js + node-cron 통합, 서버 시작 시 자동 마이그레이션 + 초기 크롤링
