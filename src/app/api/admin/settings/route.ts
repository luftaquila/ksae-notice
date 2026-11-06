import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { BUSINESS_SETTING_KEYS } from '@/lib/payment/pricing';
import { parseRenewalOpenMonth } from '@/lib/subscription/period';
import { parseBrevoReserve } from '@/lib/email/limits';

// 읽는 쪽이 해석하는 값은 저장할 때 같은 해석으로 맞춰 둔다. 범위 밖 값이 저장되면
// 화면(셀렉트·입력칸)과 서버가 서로 다른 값으로 읽는다.
function normalize(key: string, value: unknown): string {
  switch (key) {
    case 'renewalOpenMonth':
      return String(parseRenewalOpenMonth(String(value)));
    case 'brevoReserve':
      return String(parseBrevoReserve(String(value)));
    case 'unlimitedSubscribers':
      return value === true || value === 'true' ? 'true' : 'false';
    case 'notifyPostUpdates':
      return value === false || value === 'false' ? 'false' : 'true';
    default:
      return String(value);
  }
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const allSettings = db.select().from(settings).all();

  const result: Record<string, string> = {};
  for (const s of allSettings) {
    result[s.key] = s.value;
  }

  return NextResponse.json(result);
}

export async function PUT(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const db = getDb();

  const allowedKeys = [
    'maxSubscribers',
    'unlimitedSubscribers',
    'renewalOpenMonth',
    'registrationOpen',
    'maxEmailsPerUserPerDay',
    'subscriptionPrice',
    'brevoReserve',
    'notifyPostUpdates',
    ...BUSINESS_SETTING_KEYS,
  ];

  for (const [key, value] of Object.entries(body)) {
    if (!allowedKeys.includes(key)) continue;
    const stored = normalize(key, value);

    db.insert(settings)
      .values({ key, value: stored })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: stored },
      })
      .run();
  }

  return NextResponse.json({ ok: true });
}
