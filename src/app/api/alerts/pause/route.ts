import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { setAlertsPaused } from '@/lib/alerts/preferences';

// 알림 일시중지. 카테고리 설정은 그대로 두고 배달만 멈춘다. 좌석(구독)도 그대로다 —
// 산 것을 잠시 안 쓰는 것뿐이라 정원이 흔들리지 않는다.

// POST: 일시중지
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  setAlertsPaused(session.user.id, true);
  return NextResponse.json({ ok: true });
}

// DELETE: 재개
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  setAlertsPaused(session.user.id, false);
  return NextResponse.json({ ok: true });
}
