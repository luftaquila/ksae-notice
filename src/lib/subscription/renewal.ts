import { eq, and, sql, gte, lt, isNull, or } from 'drizzle-orm';
import { getDb } from '../db';
import { users, subscriptions, emailLogs } from '../db/schema';
import { sendEmail, getRemainingCredits } from '../email/brevo';
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

  // Filter to today's recipients first
  const todayRecipients = subscribedUsers.filter((user) => {
    const assignedDay = windowStart + (user.userId % 7);
    return day === assignedDay;
  });

  if (todayRecipients.length === 0) return;

  // Check Brevo remaining credits before sending
  let remaining: number;
  try {
    remaining = await getRemainingCredits();
  } catch (error) {
    console.error('[Renewal] Failed to check Brevo remaining credits:', error);
    return;
  }

  if (remaining < todayRecipients.length) {
    console.warn(`[Renewal] Brevo remaining credits (${remaining}) < recipients (${todayRecipients.length}), skipping all reminders`);
    return;
  }

  const windowStartDate = `${year}-12-${String(windowStart).padStart(2, '0')}`;

  for (const user of todayRecipients) {

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
