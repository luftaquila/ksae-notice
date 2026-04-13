import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { settings } from '@/lib/db/schema';

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

  const allowedKeys = ['maxSubscribers', 'registrationOpen', 'maxEmailsPerUserPerDay'];

  for (const [key, value] of Object.entries(body)) {
    if (!allowedKeys.includes(key)) continue;

    db.insert(settings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: String(value) },
      })
      .run();
  }

  return NextResponse.json({ ok: true });
}
