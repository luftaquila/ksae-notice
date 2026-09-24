import { randomUUID } from 'crypto';
import { eq, and, sql, gte, isNull } from 'drizzle-orm';
import { getDb } from '../db';
import { users, alertPreferences, emailLogs, settings } from '../db/schema';
import { NOTICE_CATEGORY_CODES, ALERT_CATEGORIES, type BoardType } from '../constants';
import { sendEmail, getRemainingCredits } from './brevo';
import { newPostNotification } from './templates';

interface NewPost {
  id: number;
  postNumber: number;
  title: string;
  category: string | null;
  date: string;
  url: string;
  isPinned: boolean;
  boardType: BoardType;
  previousTitle?: string;
}

function getAlertCategory(post: NewPost): string | null {
  if (post.boardType !== 'notice') {
    // 공지 밖의 게시판은 게시판 type 이 곧 알림 카테고리 ID 다 (rule, result, form).
    return ALERT_CATEGORIES.some((c) => c.id === post.boardType) ? post.boardType : null;
  }
  // For notice board, map category label to alert category ID
  if (post.category) {
    const code = NOTICE_CATEGORY_CODES[post.category];
    if (code) return `notice_${code}`;
  }
  return null;
}

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

export async function notifyNewPosts(newPosts: NewPost[]): Promise<void> {
  const db = getDb();

  // Group new posts by alert category
  const postsBySubCategory = new Map<string, NewPost[]>();
  for (const post of newPosts) {
    const subCat = getAlertCategory(post);
    if (!subCat) continue;
    if (!postsBySubCategory.has(subCat)) postsBySubCategory.set(subCat, []);
    postsBySubCategory.get(subCat)!.push(post);
  }

  if (postsBySubCategory.size === 0) return;

  // 수신자 = 좌석(기간 유효·미탈퇴) ∩ 해당 카테고리를 켠 사람 ∖ 알림 일시중지.
  // 좌석 조건은 lib/subscription/capacity 의 getSeatCount 와 같다 — 정원이 세는
  // 사람보다 많은 사람에게 메일이 나갈 수는 없다. 카테고리와 일시중지는 그 위에
  // 얹히는 사용자 설정이다.
  const categories = [...postsBySubCategory.keys()];
  const now = new Date().toISOString();

  const recipients = db
    .select({
      userId: alertPreferences.userId,
      category: alertPreferences.category,
      email: users.email,
      name: users.name,
    })
    .from(alertPreferences)
    .innerJoin(users, eq(alertPreferences.userId, users.id))
    .where(and(
      eq(alertPreferences.isActive, 1),
      gte(users.subscriptionExpiresAt, now),
      isNull(users.deletedAt),
      isNull(users.alertsPausedAt),
    ))
    .all()
    .filter((s) => categories.includes(s.category));

  // Group by user: collect all relevant posts for each user
  const userPosts = new Map<number, { email: string; name: string | null; posts: NewPost[] }>();

  for (const sub of recipients) {
    const postsForCategory = postsBySubCategory.get(sub.category) || [];
    if (postsForCategory.length === 0) continue;

    if (!userPosts.has(sub.userId)) {
      userPosts.set(sub.userId, { email: sub.email, name: sub.name, posts: [] });
    }

    const userData = userPosts.get(sub.userId)!;
    for (const post of postsForCategory) {
      // Avoid duplicate posts if user subscribes to multiple matching categories
      if (!userData.posts.some((p) => p.postNumber === post.postNumber && p.boardType === post.boardType)) {
        userData.posts.push(post);
      }
    }
  }

  const recipientCount = userPosts.size;
  if (recipientCount === 0) return;

  // Check Brevo remaining credits before sending
  let remaining: number;
  try {
    remaining = await getRemainingCredits();
  } catch (error) {
    console.error('[Email] Failed to check Brevo remaining credits:', error);
    return;
  }

  const batchId = randomUUID();

  if (remaining < recipientCount) {
    console.warn(`[Email] Brevo remaining credits (${remaining}) < recipients (${recipientCount}), skipping all notifications`);
    for (const [userId] of userPosts) {
      db.insert(emailLogs).values({
        userId,
        batchId,
        type: 'notification',
        status: 'failed',
        error: `Insufficient Brevo credits: ${remaining} remaining, ${recipientCount} needed`,
      }).run();
    }
    return;
  }

  // Get per-user daily email limit (counted in distinct emails sent, not posts)
  const maxPerUserSetting = db.select().from(settings).where(eq(settings.key, 'maxEmailsPerUserPerDay')).get();
  const maxEmailsPerUserPerDay = parseInt(maxPerUserSetting?.value || '2', 10);
  const today = new Date().toISOString().slice(0, 10);

  // Send one email per user
  for (const [userId, userData] of userPosts) {
    // Count distinct emails sent today (one batch_id per email)
    const todaySentCount = db
      .select({ count: sql<number>`count(distinct ${emailLogs.batchId})` })
      .from(emailLogs)
      .where(and(eq(emailLogs.userId, userId), eq(emailLogs.status, 'sent'), gte(emailLogs.sentAt, today)))
      .get();

    if ((todaySentCount?.count || 0) >= maxEmailsPerUserPerDay) {
      for (const post of userData.posts) {
        db.insert(emailLogs).values({
          userId,
          postId: post.id,
          batchId,
          type: 'notification',
          status: 'skipped',
          error: `Daily per-user limit reached: ${maxEmailsPerUserPerDay}`,
        }).run();
      }
      console.log(`[Email] Skipped ${userData.email}: daily limit (${maxEmailsPerUserPerDay}) reached`);
      continue;
    }

    try {
      const htmlContent = newPostNotification(
        userData.posts.map((p) => ({
          id: p.id,
          title: p.title,
          category: p.category,
          date: p.date,
          boardType: p.boardType,
          previousTitle: p.previousTitle,
        })),
        SITE_URL,
      );

      const newCount = userData.posts.filter((p) => !p.previousTitle).length;
      const updatedCount = userData.posts.filter((p) => p.previousTitle).length;
      const subjectParts: string[] = [];
      if (newCount > 0) subjectParts.push(`새 게시글 ${newCount}건`);
      if (updatedCount > 0) subjectParts.push(`수정된 게시글 ${updatedCount}건`);

      await sendEmail({
        to: { email: userData.email, name: userData.name || undefined },
        subject: `[KSAE 공지봇] ${subjectParts.join(', ')}`,
        htmlContent,
      });

      // Log success for each post (shared batchId identifies the single email)
      for (const post of userData.posts) {
        db.insert(emailLogs).values({
          userId,
          postId: post.id,
          batchId,
          type: 'notification',
          status: 'sent',
        }).run();
      }

      console.log(`[Email] Notification sent to ${userData.email} (${userData.posts.length} posts)`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      db.insert(emailLogs).values({
        userId,
        batchId,
        type: 'notification',
        status: 'failed',
        error: errMsg,
      }).run();
      console.error(`[Email] Failed to send to ${userData.email}:`, errMsg);
    }
  }
}
