import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, alertPreferences, emailLogs } from '@/lib/db/schema';
import { ALERT_CATEGORIES } from '@/lib/constants';
import { disableAlert, disableAllAlerts, enableAlert, enableAllAlerts } from '@/lib/alerts/preferences';
import { endOfYear, renewalTargetYear } from '@/lib/subscription/period';

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();

  const allUsers = db.select().from(users).all();
  const allAlerts = db.select().from(alertPreferences).all();
  const emailCounts = db
    .select({ userId: emailLogs.userId, count: sql<number>`count(*)` })
    .from(emailLogs)
    .where(eq(emailLogs.status, 'sent'))
    .groupBy(emailLogs.userId)
    .all();

  const skippedCounts = db
    .select({ userId: emailLogs.userId, count: sql<number>`count(*)` })
    .from(emailLogs)
    .where(eq(emailLogs.status, 'skipped'))
    .groupBy(emailLogs.userId)
    .all();

  const alertsByUser = new Map<number, { category: string; isActive: number }[]>();
  for (const row of allAlerts) {
    if (!alertsByUser.has(row.userId)) alertsByUser.set(row.userId, []);
    alertsByUser.get(row.userId)!.push({ category: row.category, isActive: row.isActive });
  }

  const emailCountMap = new Map(emailCounts.map((e) => [e.userId, e.count]));
  const skippedCountMap = new Map(skippedCounts.map((e) => [e.userId, e.count]));

  const result = allUsers.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    alerts: alertsByUser.get(user.id) || [],
    alertsPausedAt: user.alertsPausedAt,
    emailsSent: emailCountMap.get(user.id) || 0,
    emailsSkipped: skippedCountMap.get(user.id) || 0,
  }));

  result.sort((a, b) => {
    if (a.deletedAt && !b.deletedAt) return 1;
    if (!a.deletedAt && b.deletedAt) return -1;
    return 0;
  });

  return NextResponse.json({ users: result });
}

// 두 축이 따로 있다: 알림 설정(enable_/disable_ 계열)과 구독 기간(grant_year·revoke_period).
// 어느 쪽 손잡이도 다른 축을 건드리지 않는다 — delete 만 예외로 둘 다 거둔다.
export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { userId, action, category } = body;

  if (!userId || !action) {
    return NextResponse.json({ error: 'Missing userId or action' }, { status: 400 });
  }

  const db = getDb();

  if (action === 'disable_all_alerts') {
    disableAllAlerts(userId);
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete') {
    // 사용자 탈퇴와 같은 규칙: 기간까지 거둔다. 남겨두면 재로그인으로 부활한다.
    disableAllAlerts(userId);
    db.update(users)
      .set({ deletedAt: new Date().toISOString(), subscriptionExpiresAt: null })
      .where(eq(users.id, userId))
      .run();
    return NextResponse.json({ ok: true });
  }

  if (action === 'enable_alert' && category) {
    if (!ALERT_CATEGORIES.some((c) => c.id === category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    enableAlert(userId, category);
    return NextResponse.json({ ok: true });
  }

  if (action === 'disable_alert' && category) {
    disableAlert(userId, category);
    return NextResponse.json({ ok: true });
  }

  if (action === 'enable_all_alerts') {
    enableAllAlerts(userId);
    return NextResponse.json({ ok: true });
  }

  // 알림 설정은 무료지만 기간은 아니므로, 카드 없이 좌석을 내줄 손잡이가 필요하다 —
  // 무상 제공이나 계좌이체 정산. 결제와 같은 규칙으로 한 번에 정확히 한 해를 준다.
  if (action === 'grant_year') {
    const account = db
      .select({ expiresAt: users.subscriptionExpiresAt })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!account) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const now = new Date();
    db.update(users)
      .set({
        subscriptionExpiresAt: endOfYear(renewalTargetYear(now, account.expiresAt ?? null)),
        subscriptionRenewedAt: now.toISOString(),
      })
      .where(eq(users.id, userId))
      .run();
    return NextResponse.json({ ok: true });
  }

  if (action === 'revoke_period') {
    db.update(users)
      .set({ subscriptionExpiresAt: null })
      .where(eq(users.id, userId))
      .run();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
