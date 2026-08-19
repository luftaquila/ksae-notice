import type { NextRequest } from 'next/server';

// 프록시 뒤에서 request.url 은 컨테이너 내부 주소다 (HOSTNAME=0.0.0.0, PORT=3000).
// 결제창에 넘기는 returnUrl 과 그 뒤의 리다이렉트 Location 은 둘 다 브라우저가
// 따라가야 하므로 공개 주소로 만들어야 한다 — new URL(path, request.url) 로 만들면
// https://0.0.0.0:3000/... 이 나가고 결제 후 화면이 열리지 않는다.
export function siteOrigin(request: NextRequest): string {
  const configured = process.env.SITE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;

  // SITE_URL 이 없을 때의 차선책. Traefik 이 원래 호스트를 그대로 넘긴다.
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!host) throw new Error('SITE_URL is unset and the request carries no host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}
