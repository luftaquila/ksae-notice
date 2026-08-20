import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { PENDING_SIGNUP_COOKIE } from '@/lib/signup/pending';

// 동의를 거부하면 봉인한 쿠키만 버린다. 계정은 아직 만들어지지 않았으므로
// 지울 것도 없다.
export async function POST() {
  (await cookies()).delete(PENDING_SIGNUP_COOKIE);
  return NextResponse.json({ ok: true });
}
