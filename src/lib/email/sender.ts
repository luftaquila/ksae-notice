import { eq, and, sql, gte, isNull } from 'drizzle-orm';
import { getDb } from '../db';
import { users, subscriptions, emailLogs } from '../db/schema';
import { NOTICE_CATEGORY_CODES, type BoardType } from '../constants';
import { sendEmail } from './brevo';
import { newPostNotification } from './templates';

interface NewPost {
  postNumber: number;
  title: string;
  category: string | null;
  date: string;
  url: string;
  isPinned: boolean;
  boardType: BoardType;
}

function getSubscriptionCategory(post: NewPost): string | null {
  if (post.boardType === 'rule') {
    return 'rule';
  }
  // For notice board, map category label to subscription ID
  if (post.category) {
    const code = NOTICE_CATEGORY_CODES[post.category];
    if (code) return `notice_${code}`;
  }
  return null;
}

function getTodayEmailCount(): number {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(emailLogs)
    .where(and(
      gte(emailLogs.sentAt, today),
      eq(emailLogs.status, 'sent'),
    ))
    .get();
  return result?.count || 0;
}

const DAILY_LIMIT = 300;

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

export async function notifyNewPosts(newPosts: NewPost[]): Promise<void> {
  const db = getDb();

  // Group new posts by subscription category
  const postsBySubCategory = new Map<string, NewPost[]>();
  for (const post of newPosts) {
    const subCat = getSubscriptionCategory(post);
    if (!subCat) continue;
    if (!postsBySubCategory.has(subCat)) postsBySubCategory.set(subCat, []);
    postsBySubCategory.get(subCat)!.push(post);
  }

  if (postsBySubCategory.size === 0) return;

  // Find all users with active subscriptions for the affected categories
  const categories = [...postsBySubCategory.keys()];
  const now = new Date().toISOString();

  // Get all active subscriptions for affected categories
  const activeSubscriptions = db
    .select({
      userId: subscriptions.userId,
      category: subscriptions.category,
      email: users.email,
      name: users.name,
    })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .where(and(
      eq(subscriptions.isActive, 1),
      gte(subscriptions.expiresAt, now),
      isNull(users.deletedAt),
    ))
    .all()
    .filter((s) => categories.includes(s.category));

  // Group by user: collect all relevant posts for each user
  const userPosts = new Map<number, { email: string; name: string | null; posts: NewPost[] }>();

  for (const sub of activeSubscriptions) {
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

  // Send one email per user
  let todayCount = getTodayEmailCount();

  for (const [userId, userData] of userPosts) {
    if (todayCount >= DAILY_LIMIT) {
      console.warn(`[Email] Daily limit (${DAILY_LIMIT}) reached, skipping remaining notifications`);
      // Log skipped emails
      db.insert(emailLogs).values({
        userId,
        type: 'notification',
        status: 'failed',
        error: 'Daily email limit reached',
      }).run();
      continue;
    }

    try {
      const htmlContent = newPostNotification(
        userData.posts.map((p) => ({
          title: p.title,
          category: p.category,
          date: p.date,
          url: p.url,
          boardType: p.boardType,
        })),
        SITE_URL,
      );

      await sendEmail({
        to: { email: userData.email, name: userData.name || undefined },
        subject: `[KSAE 공지봇] 새 게시글 ${userData.posts.length}건`,
        htmlContent,
      });

      // Log success for each post
      for (const post of userData.posts) {
        db.insert(emailLogs).values({
          userId,
          postId: post.postNumber,
          type: 'notification',
          status: 'sent',
        }).run();
      }

      todayCount++;
      console.log(`[Email] Notification sent to ${userData.email} (${userData.posts.length} posts)`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      db.insert(emailLogs).values({
        userId,
        type: 'notification',
        status: 'failed',
        error: errMsg,
      }).run();
      console.error(`[Email] Failed to send to ${userData.email}:`, errMsg);
    }
  }
}
