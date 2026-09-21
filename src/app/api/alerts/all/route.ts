import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { enableAllAlerts } from '@/lib/alerts/preferences';

// 카테고리 전체를 한 번에 켠다. 대시보드가 카테고리마다 요청을 따로 보내던 때는
// 여덟 번 왕복하는 동안 버튼이 멈춰 있었고, 중간에 하나가 실패하면 반쯤 바뀐 채
// 끝났다. "전체 끔" 은 없다 — 잠시 안 받고 싶으면 일시중지(pause/)가 설정을 지우지
// 않고 멈춘다.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  enableAllAlerts(session.user.id);
  return NextResponse.json({ ok: true });
}
