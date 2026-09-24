import { NextResponse } from 'next/server';
import { GET as getAlerts } from '../alerts/route';

// 구 경로. 카테고리 켬/끔은 "구독" 이 아니라 알림 설정이라 /api/alerts 로 옮겼다.
// 배포 사이에 열려 있던 대시보드가 깨지지 않도록 한 릴리스 동안 그대로 넘겨준다.
export { POST, DELETE } from '../alerts/route';

// 구 대시보드는 GET 응답에서 `subscriptions` 를 읽는다. 새 이름(`alerts`)만 주면 열려 있던
// 탭의 토글이 전부 꺼진 것으로 보이므로, 같은 목록을 옛 이름으로도 얹어 준다.
export async function GET() {
  const res = await getAlerts();
  if (!res.ok) return res;
  const body = await res.json();
  return NextResponse.json({ ...body, subscriptions: body.alerts });
}
