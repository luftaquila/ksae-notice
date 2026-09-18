# KSAE 공지봇

KSAE 대학생 자작자동차대회 공지사항·규정·경기결과·양식 게시판을 크롤링하여 구독자에게 이메일 알림을 보내는 서비스.

## 개념: 구독과 알림 설정은 다른 축이다

**구독**은 하나다 — 결제(또는 관리자 부여)로 생기는 **연간 좌석**. `users.subscription_expires_at`
한 값이고 상태는 `없음 / 이용 중 / 만료`(+탈퇴) 셋뿐이다 (`lib/subscription/status.ts`
`subscriptionState()`). **알림 설정**은 그 구독이 어느 게시판의 글을 배달할지 정하는 사용자
설정이다 — 카테고리 여덟 개의 켬/끔(`subscriptions` 테이블, 코드에서는 `alertPreferences`)과
계정 단위 **일시중지**(`users.alerts_paused_at`). 켜고 끄는 데 돈이 들지 않고, 구독 상태와
**곱하지 않는다**(`alertSummary()`가 따로 접는다: 모두 켜짐 / n/8 켜짐 / 모두 꺼짐 / 일시중지).

- **메일 수신자** = 좌석(기간 유효·미탈퇴) ∩ 해당 카테고리 켬 ∖ 일시중지 (`lib/email/sender.ts`)
- **정원**(`maxSubscribers`)은 **좌석 수**만 센다 (`getSeatCount()`). 알림을 전부 꺼 두었거나
  일시중지한 사람도 좌석은 가지고 있다. 예전에는 "켜진 카테고리가 있는 결제 계정"을 셌는데,
  그러면 토글 하나가 정원을 흔들었다 — 결제한 사람이 다 끄면 자리가 비고 남이 들어오고,
  다시 켜면 정원 초과인 채로 수신했다. 미결제 계정은 카테고리를 아무리 켜도 좌석이 없다
- **실제 수신인**(`getRecipientCount()` = 좌석 ∩ 알림 하나 이상 켬 ∖ 일시중지)은 좌석과 별도로
  센다. 메인은 구독자(좌석)만, 관리자 화면은 `구독자 / 수신인`을 나란히 보여준다
- **가입**은 계정 + 알림 설정 전부 켬을 준다. 좌석은 주지 않는다 — 가입 직후는 `구독 없음`
- **탈퇴**는 좌석을 거두고 알림을 끈다. 재가입도 좌석은 주지 않는다
- 어휘: 코드·화면·메일 어디서도 카테고리 켬/끔을 "구독"이라 부르지 않는다. "구독"은 좌석이다.
  API 는 `/api/alerts`(`/api/subscriptions` 는 한 릴리스 shim), 상수는 `ALERT_CATEGORIES`,
  라이브러리는 `lib/alerts/preferences.ts`

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Database**: SQLite (Drizzle ORM + better-sqlite3)
- **Auth**: next-auth v5 beta (Google OAuth, JWT session)
- **Email**: Brevo API (일 300통 무료 제한)
- **Crawling**: cheerio + node-cron
- **UI**: Tailwind CSS v4

## Project Structure

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── page.tsx            # 메인 페이지 (공개, 게시글 목록 + 필터)
│   ├── dashboard/page.tsx  # 구독 관리 (로그인 필요): 구독 카드 + 알림 설정
│   ├── admin/              # 관리자: page.tsx 가 자료를 읽고 탭(URL 해시)을 고른다
│   │   ├── OverviewTab.tsx #   개요 — 오늘 발송·좌석·Brevo 잔량·마지막 크롤 신호 + 크롤/실패 로그
│   │   ├── UsersTab.tsx    #   유저 — 검색·상태 필터·정렬, 한 행에 칩·조작 전부 (그리드 트랙, 접힘 없음)
│   │   ├── PaymentsTab.tsx #   결제 — 상태 필터, 인라인 취소 폼
│   │   └── SettingsTab.tsx #   설정 — dirty 체크
│   ├── signup/consent/     # 가입 동의 화면 (계정은 여기서 동의한 뒤에 생긴다)
│   ├── review-login/       # 심사용 ID/PW 로그인 (환경변수 없으면 404)
│   ├── go/[id]/route.ts    # 게시글 리다이렉트 (모바일 UA 감지)
│   └── api/
│       ├── auth/           # NextAuth + 가입 동의 (signup-consent, signup-cancel)
│       ├── review-login/   # 심사용 로그인 API
│       ├── user/           # 계정 삭제 API
│       ├── posts/          # 게시글 조회 API
│       ├── alerts/         # 알림 설정 API (카테고리 켬·끔, all/ 전체 켬, pause/ 일시중지)
│       ├── subscriptions/  # 구 경로 shim → alerts/ (한 릴리스 유지)
│       ├── payments/       # 결제 (orders/ return/ webhook/) + 내 결제 내역
│       ├── stats/          # 공개 통계 API
│       └── admin/          # 관리자 전용 API (settings, users, stats, test-email, payments)
├── lib/
│   ├── db/
│   │   ├── schema.ts       # Drizzle 스키마 (users, alertPreferences(=subscriptions 테이블), posts, emailLogs, crawlLogs, settings, payments)
│   │   ├── index.ts        # DB 싱글톤
│   │   └── migrate.ts      # 마이그레이션 + 기본 설정 시드
│   ├── auth.ts             # Auth.js 설정
│   ├── session.ts          # Auth.js 세션 쿠키 직접 발급 (가입 동의·심사용 로그인)
│   ├── review.ts           # 심사용 계정: 자격증명 검증, 계정 생성, 시도 제한
│   ├── constants.ts        # 게시판 목록(BOARDS), 카테고리 매핑, 구독 카테고리 정의, 라벨·색상
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
│   ├── alerts/
│   │   └── preferences.ts  # 알림 설정 쓰기: 카테고리 켬·끔, 전체 켬·끔, 일시중지
│   └── subscription/
│       ├── capacity.ts     # 좌석 수·정원·접수 (getSeatCount, holdsSeat)
│       ├── status.ts       # subscriptionState(없음/이용 중/만료) + alertSummary
│       ├── renewal.ts      # 12월 구독 갱신 리마인더 (좌석 기준)
│       └── period.ts       # 기간 규칙 (한 번의 결제 = 한 해)
├── components/             # React 컴포넌트 (ui.tsx: Badge·Spinner·Skeleton·Card·버튼/입력 클래스)
├── __tests__/              # vitest 단위 테스트 (fixtures/ 에 실제 게시판 HTML 발췌)
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

| 게시판 | boardType | URL 코드 | 카테고리 |
|--------|-----------|----------|---------|
| 공지사항 | `notice` | `J_notice` | 공통(Z), Baja(A), Formula(B), EV(C), 자율주행(D) |
| 규정 | `rule` | `J_rule` | (전체 단일 구독) |
| 경기결과 | `result` | `J_result` | (전체 단일 구독) |
| 양식 | `form` | `J_form` | (전체 단일 구독) |

게시판 목록은 `lib/constants.ts`의 `BOARDS` 하나다. 크롤러·URL 코드·라벨·목록 정렬 순서가
전부 거기서 나온다. **게시판을 추가하면 `ALERT_CATEGORIES`(id = boardType)와
`CATEGORY_COLORS`(key = label)도 같이 늘려야 한다** — `constants.test.ts`가 셋의 짝을 확인한다.

- 테이블 열은 게시판마다 다르다. 카테고리 열은 공지에만 있고, 경기결과는 공지처럼 6열이지만
  2번째 열이 제목(3번째는 등록자)이다. 파서는 열 개수가 아니라 boardType 으로 분기한다
- 크롤링 주기: 5분 (`*/5 7-18 * * *`, KST)
- **저장된 글이 하나도 없는 게시판은 증분 수집 전에 전체 수집으로 채운다**
  (`boardsNeedingInitialCrawl()`). 빈 DB 뿐 아니라 게시판을 새로 붙인 배포도 여기 걸린다.
  전체 수집이 실패해 빈 채로 `crawlLatest`에 도달하면 첫 페이지를 저장만 하고 알림은 내지
  않는다 — 아니면 옛 글 20건이 "새 글"로 구독자에게 나간다
- 게시글 중복 방지: `(boardType, postNumber)` unique index + SELECT→UPDATE/INSERT upsert
- 공지(상단고정) 게시글: `notice.png` 아이콘으로 감지, 별도 isPinned 플래그

## 알림 카테고리 ID

`notice_Z`, `notice_A`, `notice_B`, `notice_C`, `notice_D`, `rule`, `result`, `form`

공지 밖의 게시판은 boardType 이 곧 알림 카테고리 ID 다. 가입·재가입·심사 계정은 전부 켜서
시작한다. **이미 있는 계정에는 새 카테고리가 저절로 켜지지 않는다** — 경기결과·양식
(2026-09-03 추가)은 `drizzle/0007_enable_result_form_categories.sql`이 한 번 켰다. 대상은
탈퇴하지 않았고 켜진 카테고리가 하나라도 있는 계정만이다 (전부 끈 계정은 알림을 원치
않는다고 밝힌 것). 데이터만 만지는 1회성 작업은 이렇게 custom 마이그레이션으로 둔다
(`npx drizzle-kit generate --custom --name=...`) — migrator 의 journal 이 재실행을 막아 준다.

## 회원가입 동의 흐름

**계정 행은 개인정보 동의를 받은 뒤에 만든다.** signIn 콜백은 신규 프로필이나 **탈퇴한
계정**을 보면 DB에 아무것도 쓰지 않고, 프로필을 HMAC으로 봉인한 httpOnly 쿠키에 담아
`/signup/consent`로 리다이렉트한다(문자열을 반환하면 Auth.js가 세션 없이 그 주소로 보낸다).

- `POST /api/auth/signup-consent`가 실제 생성자다 — 쿠키를 풀어 users 행 + 카테고리 6개 +
  `privacyConsentAt`/`privacyConsentVersion`을 쓰고 쿠키를 버린다. 구독 기간은 주지 않는다
- 이미 계정이 있으면(버튼 두 번 눌림 등) 동의만 기록하고 카테고리는 건드리지 않는다 —
  다시 깔면 사용자가 끈 것을 되살린다
- `POST /api/auth/signup-cancel`은 쿠키만 버린다. 계정이 없으니 지울 것도 없다
- **세션도 동의 라우트가 바로 만든다.** Google 로 다시 다녀오지 않는다 — 예전에는 동의 뒤
  `signIn('google')`을 한 번 더 불러서 사용자에게 로그인이 두 번으로 보였다. 응답의
  `redirect`(`/dashboard`)로 클라이언트가 이동하고, **가입 직후에는 대시보드 맨 위의 구독 카드
  ("구독을 시작하세요" + 결제 버튼)에 떨어진다** — 알림 설정은 그 아래다
- 세션 발급은 `lib/session.ts`가 한다. Auth.js 가 읽는 것과 같은 쿠키를 `@auth/core/jwt`의
  `encode`로 만든다 — 쿠키 이름(`authjs.session-token`, https 면 `__Secure-` 접두어)이 곧
  salt 이고, https 판단은 `AUTH_URL` → `x-forwarded-proto` → 기본 https 순으로 Auth.js 의
  `createActionURL`과 같다. 어긋나면 발급은 되는데 `auth()`가 아무것도 못 읽는 조용한 실패가
  되므로 `session.test.ts`가 Auth.js 의 `decode`로 되읽어 확인한다
- **탈퇴한 계정의 재로그인도 동의 화면을 다시 거친다.** 방침의 보유 기간이 "탈퇴 시까지"라
  예전 동의는 끝났고, 재가입은 새 가입이다. 동의 라우트가 행을 되살린다 — `deletedAt` 해제,
  프로필 갱신, 카테고리 전부 켬(빠진 것은 채움), 동의 시각·버전 갱신 — 그러나 **기간은 주지
  않는다**(탈퇴는 기간을 포기하는 것). 되살리기가 signIn 콜백에 있던 시절에는 동의 화면이
  생략돼, 탈퇴 후 재로그인하면 곧바로 대시보드로 들어갔다
- 봉인은 `AUTH_SECRET` HMAC + 10분 만료다. 뚫리면 남의 이메일로 가입시킬 수 있으므로
  서명 비교는 `timingSafeEqual`, 만료는 서명이 맞아도 거부한다
- 이 흐름 이전에 만들어진 계정은 `privacyConsentAt`이 NULL로 남는다 (소급 동의를 받지 않는다)

## 회원 탈퇴

- `DELETE /api/user`는 본문에 `{ confirmation: '회원탈퇴' }`(`ACCOUNT_DELETE_CONFIRMATION`)를
  요구한다. 화면의 비활성 버튼만 믿지 않는다
- 15분 안에 만들어진 `pending` 주문이 있으면 409 로 막는다 — 결제창이 떠 있는 동안 탈퇴하면
  승인이 도착했을 때 받을 사람이 없다. 방치된 pending 이 영원히 막지 않도록 창을 15분으로 둔다
- soft delete 다. `deletedAt`을 찍고 카테고리를 끄고 **기간을 비운다** — 탈퇴는 기간을 포기하는
  것이라고 /policy 가 말한다. 행을 남기는 이유는 같은 구글 계정이 다시 오면 처음 온 사람과
  구분하기 위해서다. 재가입은 동의 화면부터 다시 시작하고, 그 동의가 행을 되살린다

## 심사용 로그인 (`/review-login`)

나이스페이와 카드사 심사는 "ID/PW, 2차 인증 없음, SNS 로그인 불가" 계정을 요구한다. Google
로그인만 있는 서비스라 이 경로만 예외다 (`lib/review.ts`).

- `REVIEW_LOGIN_ID`·`REVIEW_LOGIN_PASSWORD`가 둘 다 있어야 켜진다. 없으면 페이지도 API 도 404
- 계정은 `users.google_id = 'review-account'`, 이메일 `review@nicepay.example`(RFC 2606 예약
  도메인, 어디로도 배달되지 않는다) 하나다. 없으면 만들고, 탈퇴돼 있으면 기간 없이 되살린다.
  `ADMIN_EMAIL`과 다르므로 관리자가 될 수 없다
- 비교는 해시 후 `timingSafeEqual`, 아이디·비밀번호를 둘 다 끝까지 비교한다
- 시도 제한은 프로세스 안에 둔다(5분 10회). 계정이 하나라 계정별 카운터가 필요 없다
- 성공하면 `lib/session.ts`로 Google 로그인과 같은 세션 쿠키를 내려준다

## Payments (NicePay 결제창 서버승인)

구독(좌석)은 **유료**다. 알림 설정은 무료이고, 이메일은 `subscriptionExpiresAt`이 남아 있는
계정에만 나간다. **기간을 쓰는 곳은 결제 정산(`lib/payment/orders.ts`)과 관리자 수동 부여
둘뿐이다** — 가입도, 알림 토글도 기간을 만들지 않는다.

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
  저장돼 있어도 쓰지 않는다 — 단 **0 은 예외로 "무료"** 다(아래)
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
- **결제는 살 것이 있을 때만 열린다** — `canPurchase()`(`lib/subscription/period.ts`)가 대시보드
  버튼과 주문 라우트를 함께 막는다. 기간이 없거나 지났으면 올해를, 올해로 끝나는 기간은
  **12월에만** 내년을 판다. 이미 내년까지 덮인 계정은 못 산다. 예전에는 기간이 올해로 끝나면
  연중 버튼이 떠서 9월에 내년 구독이 팔렸다 — 조기 갱신은 의도된 것이 아니다
- 정원(`maxSubscribers`)과 접수 중단(`registrationOpen`)은 **주문 생성 시점**에만 본다.
  결제창이 떠 있는 사이 만석이 되어도 지급은 강행한다 — 돈을 이미 받았기 때문이다.
  정원은 좌석(`getSeatCount`)으로 세고, 이미 좌석을 가진 사람(`holdsSeat`)의 갱신은 만석이어도 통과
- 구독료와 판매자 정보는 `settings`에 있고 `/admin`에서 바꾼다. `/policy`가 그 값을 렌더한다
- **`subscriptionPrice = 0` 은 무료 구독이다.** 주문 라우트가 결제창을 열지 않고 주문을 그
  자리에서 확정한다(`settleFreeOrder`) — 거래키 없이 `method = 'free'`, `amount = 0` 인 paid
  주문이 남는다. 지급은 유료와 같은 `settleOrder` 를 지나므로 기간 계산과 멱등성이 같다.
  1~999 는 무료가 아니라 잘못 적힌 값으로 보고 1,000원으로 되돌린다
  - 게이트웨이 키(`isConfigured()`)는 **결제할 때만** 본다. 무료 구독은 키 없이도 돈다
  - **정원·접수 중단·12월 갱신 규칙은 그대로 걸린다.** 정원은 Brevo 발송 한도의 문제라
    돈과 무관하고, 기간 규칙이 느슨해지면 무료로 바꾼 해에만 두 해가 나간다
  - 관리자 취소는 무료 주문이면 게이트웨이를 부르지 않고 기간만 되돌린다 — 되돌릴 승인이
    없고, 부르면 거래키가 없어 실패한 채 주문만 `paid` 로 남는다
  - `/policy` 의 결제수단·최소 결제금액 고지는 무료일 때 내려간다

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
REVIEW_LOGIN_ID      # 심사용 ID/PW 로그인. 둘 다 있어야 /review-login 이 켜진다
REVIEW_LOGIN_PASSWORD
```

## Commit Convention

English conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, etc.

## Key Design Decisions

- **관리자 판별**: DB에 저장하지 않고 `ADMIN_EMAIL` 환경변수와 런타임 비교
- **구독 만료**: 매년 12/31, 12월에 두 차례 갱신 리마인더 (userId % 7로 주간 분산)
- **유료 구독**: 기간(좌석)을 발급하는 경로는 결제 정산(무료 구독의 즉시 확정 포함)과 관리자
  수동 부여뿐. 가입과 알림 토글은 기간을 만들지 않는다 (그래야 결제를 우회할 수 없다)
- **이메일 제한**: Brevo 일 300통 제한, 발송 전 당일 카운트 체크
- **구독 상태와 알림 설정은 곱하지 않는다**: 구독은 `subscriptionState()`(없음/이용 중/만료),
  알림은 `alertSummary()`(모두 켜짐/n 켜짐/모두 꺼짐/일시중지). 예전에는 둘을 곱해 네 칸을
  만들었고 "해제"(돈은 냈는데 아무것도 안 받음)가 구독 상태로 보였다. 관리자 표는 상태 열에
  구독 배지, 알림 열에 카테고리 칩과 (배달이 막힌 경우) 알림 요약을 따로 찍는다.
  **`subscriptionState().holdsSeat` 가 `getSeatCount()`와 어긋나면 배지는 없는 것보다 나쁘다** —
  두 구현이 같은 수를 세는지 테스트로 묶어 뒀다
- **최대 구독자**: settings 테이블에서 관리자가 동적으로 변경 가능. 좌석을 차지하는 것은
  결제된 기간이므로, 미결제 계정은 아무리 많아도 정원을 먹지 않고, 알림을 꺼 둔 결제 계정은
  좌석을 내놓지 않는다
- **알림 일시중지**(`users.alerts_paused_at`): 잠시 안 받고 싶은 사람이 카테고리 여덟 개를 끄고
  나중에 하나씩 되살리는 대신 이 하나를 세운다. 설정과 좌석은 그대로다. 갱신 리마인더는
  일시중지와 무관하게 좌석 기준으로 나간다
- **커스텀 서버**: server.ts에서 Next.js + node-cron 통합, 서버 시작 시 자동 마이그레이션 + 초기 크롤링
