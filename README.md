# KSAE 공지봇

KSAE 대학생 자작자동차대회 공지사항 및 규정 페이지를 크롤링하여 구독자에게 이메일 알림을 보내는 서비스.

## 주요 기능

- 공지사항/규정 게시판 자동 크롤링 (5분 주기, 매일 07:00-18:55 KST)
- 카테고리별 구독 (공통, Baja, Formula, EV, 자율주행, 규정)
- 신규 게시글 이메일 알림 (Brevo API)
- Google 로그인 기반 구독 관리
- 관리자 대시보드

## 시작하기

### 환경 변수 설정

```bash
cp .env.example .env.local
```

`.env.local`에 값을 채워 넣습니다.

| 변수 | 설명 |
|------|------|
| `AUTH_SECRET` | Auth.js 시크릿 (`npx auth secret`으로 생성) |
| `AUTH_GOOGLE_ID` | Google OAuth 클라이언트 ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth 시크릿 |
| `BREVO_API_KEY` | Brevo API 키 |
| `SENDER_EMAIL` | 발신 이메일 주소 |
| `SENDER_NAME` | 발신자 이름 (기본: KSAE 공지봇) |
| `ADMIN_EMAIL` | 관리자 이메일 |
| `SITE_URL` | 서비스 URL (기본: http://localhost:3000) |
| `DATABASE_PATH` | SQLite DB 경로 (기본: ./data/ksae.db) |

### 개발

```bash
npm install
npm run dev        # http://localhost:3000
```

### 빌드 및 실행

```bash
npm run build
npm run start
```

### 기타 명령어

```bash
npm run migrate    # DB 마이그레이션
npm run lint       # ESLint
npm run test       # vitest 단위 테스트
```

## 배포

GitHub Actions에서 `main` 브랜치 푸시 시 컨테이너 이미지를 빌드하여 GHCR에 푸시합니다. Portainer에서 스택 재배포 시 최신 이미지가 적용됩니다.

```bash
# 수동 컨테이너 빌드
podman build -f Containerfile -t ksae-notice .
```
