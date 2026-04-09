import { eq, and, sql, gte, lt, isNull, or } from 'drizzle-orm';
import { getDb } from '../db';
import { users, subscriptions, emailLogs } from '../db/schema';
import { sendEmail } from '../email/brevo';
import { renewalReminder } from '../email/templates';

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

export async function checkAndSendRenewalReminders(): Promise<void> {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  if (month !== 12) return;

  const day = now.getDate();
  const year = now.getFullYear();

  // Window 1: Dec 1-7, Window 2: Dec 14-20
  let windowStart: number | null = null;
  if (day >= 1 && day <= 7) windowStart = 1;
  else if (day >= 14 && day <= 20) windowStart = 14;
  else return; // Not in a reminder window

  const db = getDb();

  // Find users with active subscriptions expiring this year who haven't renewed
  const expiryDate = `${year}-12-31`;
  const nextYearExpiry = `${year + 1}-01-01`;

  const subscribedUsers = db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .innerJoin(subscriptions, eq(users.id, subscriptions.userId))
    .where(and(
      eq(subscriptions.isActive, 1),
      gte(subscriptions.expiresAt, new Date().toISOString()),
      lt(subscriptions.expiresAt, nextYearExpiry),
    ))
    .groupBy(users.id)
    .all();

  const today = now.toISOString().slice(0, 10);

  for (const user of subscribedUsers) {
    // Distribute across the 7-day window using userId % 7
    const assignedDay = windowStart + (user.userId % 7);
    if (day !== assignedDay) continue;

    // Check if we already sent a reminder in this window
    const windowStartDate = `${year}-12-${String(windowStart).padStart(2, '0')}`;
    const windowEndDate = `${year}-12-${String(windowStart + 6).padStart(2, '0')}`;

    const existingReminder = db
      .select({ id: emailLogs.id })
      .from(emailLogs)
      .where(and(
        eq(emailLogs.userId, user.userId),
        eq(emailLogs.type, 'renewal_reminder'),
        gte(emailLogs.sentAt, windowStartDate),
      ))
      .get();

    if (existingReminder) continue;

    try {
      const htmlContent = renewalReminder(user.name || '', SITE_URL);

      await sendEmail({
        to: { email: user.email, name: user.name || undefined },
        subject: '[KSAE 공지봇] 구독 갱신 안내',
        htmlContent,
      });

      db.insert(emailLogs).values({
        userId: user.userId,
        type: 'renewal_reminder',
        status: 'sent',
      }).run();

      console.log(`[Renewal] Reminder sent to ${user.email}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      db.insert(emailLogs).values({
        userId: user.userId,
        type: 'renewal_reminder',
        status: 'failed',
        error: errMsg,
      }).run();
      console.error(`[Renewal] Failed to send to ${user.email}:`, errMsg);
    }
  }
}
