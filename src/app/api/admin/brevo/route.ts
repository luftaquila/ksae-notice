import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getRemainingCredits } from '@/lib/email/brevo';

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const remaining = await getRemainingCredits();
    return NextResponse.json({ remaining });
  } catch {
    return NextResponse.json({ remaining: null });
  }
}
