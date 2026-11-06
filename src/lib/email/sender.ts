import { randomUUID } from 'crypto';
import { eq, and, sql, gte, isNull, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { users, alertPreferences, emailLogs, emailQueue, settings } from '../db/schema';
import { NOTICE_CATEGORY_CODES, ALERT_CATEGORIES, type BoardType } from '../constants';
import { sendEmail, getRemainingCredits } from './brevo';
import { newPostNotification } from './templates';

export interface NewPost {
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

// Brevo 잔량 중 새 글 알림에 쓰지 않고 남겨 두는 몫 — 테스트 메일, 갱신 안내 같은 것.
// 잔량에서 이만큼을 뺀 수까지만 보내고, 넘치는 사람은 다음 날로 큐에 넣는다.
export const BREVO_RESERVE = 30;

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

type Db = ReturnType<typeof getDb>;

function getMaxEmailsPerUserPerDay(db: Db): number {
  const row = db.select().from(settings).where(eq(settings.key, 'maxEmailsPerUserPerDay')).get();
  return parseInt(row?.value || '2', 10);
}

// 오늘 이 사람에게 나간 알림 메일 수. 한 통이 batch_id 하나다.
function sentTodayCount(db: Db, userId: number): number {
  const today = new Date().toISOString().slice(0, 10);
  const row = db
    .select({ count: sql<number>`count(distinct ${emailLogs.batchId})` })
    .from(emailLogs)
    .where(and(eq(emailLogs.userId, userId), eq(emailLogs.status, 'sent'), gte(emailLogs.sentAt, today)))
    .get();
  return row?.count || 0;
}

// 한 사람에게 한 통. 결과는 글마다 남기고 같은 batchId 가 그 한 통을 가리킨다.
async function deliver(
  db: Db,
  batchId: string,
  userId: number,
  to: { email: string; name: string | null },
  posts: NewPost[],
): Promise<void> {
  try {
    const htmlContent = newPostNotification(
      posts.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        date: p.date,
        boardType: p.boardType,
        previousTitle: p.previousTitle,
      })),
      SITE_URL,
    );

    const newCount = posts.filter((p) => !p.previousTitle).length;
    const updatedCount = posts.filter((p) => p.previousTitle).length;
    const subjectParts: string[] = [];
    if (newCount > 0) subjectParts.push(`새 게시글 ${newCount}건`);
    if (updatedCount > 0) subjectParts.push(`수정된 게시글 ${updatedCount}건`);

    await sendEmail({
      to: { email: to.email, name: to.name || undefined },
      subject: `[KSAE 공지봇] ${subjectParts.join(', ')}`,
      htmlContent,
    });

    for (const post of posts) {
      db.insert(emailLogs).values({
        userId,
        postId: post.id,
        batchId,
        type: 'notification',
        status: 'sent',
      }).run();
    }

    console.log(`[Email] Notification sent to ${to.email} (${posts.length} posts)`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    db.insert(emailLogs).values({
      userId,
      batchId,
      type: 'notification',
      status: 'failed',
      error: errMsg,
    }).run();
    console.error(`[Email] Failed to send to ${to.email}:`, errMsg);
  }
}

// ── 다음 날로 넘긴 알림 ─────────────────────────────────────────

// 큐 행 여럿을 한 통에 담을 글 목록으로 합친다. 같은 글이 두 번 들어 있으면 나중 것
// (예: 새 글로 넣은 뒤 제목이 바뀌어 다시 들어온 것)을 쓴다.
function mergeQueuedPosts(rows: { posts: string }[]): NewPost[] {
  const merged = new Map<string, NewPost>();
  for (const row of rows) {
    let posts: NewPost[];
    try {
      posts = JSON.parse(row.posts);
    } catch {
      continue;
    }
    for (const post of posts) merged.set(`${post.boardType}:${post.postNumber}`, post);
  }
  return [...merged.values()];
}

export interface FlushResult {
  // 큐를 보내기 전에 읽은 Brevo 잔량과, 그중 이번에 보낸(시도한) 통수.
  remaining: number;
  sent: number;
}

// 큐에 들어간 날(KST)의 다음 날부터 보낸다. Brevo 무료 한도는 하루 단위라, 같은 날
// 다시 시도해 봐야 여유분까지 쓰게 될 뿐이다. 초기화 시각은 문서에 없으므로 시각을
// 정해 두지 않고, 부를 때마다 실제 잔량을 읽어 여유분을 뺀 만큼만 보낸다 — 모자라면
// 나머지는 그대로 남아 다음 기회(시간마다 도는 크론, 또는 다음 새 글 발송 직전)를 기다린다.
//
// 가장 오래 기다린 사람부터, 한 사람에게 쌓인 것은 한 통으로. 보내기 전에 수신 조건을
// 다시 본다 — 그사이 탈퇴·만료·일시중지했으면 버리고, 꺼 둔 카테고리의 글은 뺀다.
async function runFlush(): Promise<FlushResult | null> {
  const db = getDb();
  const due = db
    .select()
    .from(emailQueue)
    .where(sql`date(${emailQueue.queuedAt}, '+9 hours') < date('now', '+9 hours')`)
    .orderBy(emailQueue.id)
    .all();
  if (due.length === 0) return null;

  let remaining: number;
  try {
    remaining = await getRemainingCredits();
  } catch (error) {
    console.error('[Email] Failed to check Brevo remaining credits for the queue:', error);
    return null;
  }

  let budget = remaining - BREVO_RESERVE;
  let sent = 0;
  const batchId = randomUUID();
  const maxPerDay = getMaxEmailsPerUserPerDay(db);
  const now = new Date().toISOString();

  // Map 은 처음 넣은 순서를 지키므로 가장 오래 기다린 사람이 앞에 온다.
  const byUser = new Map<number, typeof due>();
  for (const row of due) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId)!.push(row);
  }

  for (const [userId, rows] of byUser) {
    if (budget <= 0) break;
    const ids = rows.map((r) => r.id);

    const account = db
      .select({
        email: users.email,
        name: users.name,
        deletedAt: users.deletedAt,
        expiresAt: users.subscriptionExpiresAt,
        pausedAt: users.alertsPausedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    const activeCategories = new Set(
      db
        .select({ category: alertPreferences.category })
        .from(alertPreferences)
        .where(and(eq(alertPreferences.userId, userId), eq(alertPreferences.isActive, 1)))
        .all()
        .map((r) => r.category),
    );
    const posts = mergeQueuedPosts(rows).filter((p) => {
      const category = getAlertCategory(p);
      return category !== null && activeCategories.has(category);
    });
    const stillRecipient =
      !!account && !account.deletedAt && !account.pausedAt && !!account.expiresAt && account.expiresAt >= now;

    if (!account || !stillRecipient || posts.length === 0) {
      db.delete(emailQueue).where(inArray(emailQueue.id, ids)).run();
      console.log(`[Email] Dropped queued notification for user ${userId}: no longer a recipient`);
      continue;
    }

    // 오늘 몫을 이미 받았으면 남겨 두었다가 다음 기회에.
    if (sentTodayCount(db, userId) >= maxPerDay) continue;

    db.delete(emailQueue).where(inArray(emailQueue.id, ids)).run();
    await deliver(db, batchId, userId, account, posts);
    budget--;
    sent++;
  }

  if (sent > 0) console.log(`[Email] Sent ${sent} queued notifications`);
  return { remaining, sent };
}

// 크론과 새 글 발송이 같은 시각에 겹쳐도 같은 행을 두 번 보내지 않도록 한 번에 하나만.
// 둘 다 커스텀 서버(server.ts)의 모듈 그래프 안에서 부르므로 모듈 변수로 충분하다.
let flushInFlight: Promise<FlushResult | null> | null = null;

export function flushEmailQueue(): Promise<FlushResult | null> {
  flushInFlight ??= runFlush().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

// ── 새 글 알림 ─────────────────────────────────────────────────

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

  if (userPosts.size === 0) return;

  // 어제까지 밀린 알림이 오늘 새 글보다 먼저 나간다. 큐가 잔량을 읽었으면 그 값에서
  // 보낸 만큼을 빼 쓴다 — 방금 보낸 것이 Brevo 잔량에 곧바로 반영된다는 보장이 없다.
  const flushed = await flushEmailQueue();
  let remaining: number;
  if (flushed) {
    remaining = flushed.remaining - flushed.sent;
  } else {
    try {
      remaining = await getRemainingCredits();
    } catch (error) {
      console.error('[Email] Failed to check Brevo remaining credits:', error);
      return;
    }
  }

  // 잔량에서 여유분을 뺀 만큼만 지금 보내고, 넘치는 사람은 다음 날로 큐에 넣는다.
  // 예전에는 잔량이 수신인 수보다 적으면 이 글의 알림을 전원에게 통째로 건너뛰었다.
  let budget = remaining - BREVO_RESERVE;
  const batchId = randomUUID();
  const maxPerDay = getMaxEmailsPerUserPerDay(db);
  let queued = 0;

  // 순서는 userId 순 — 먼저 가입한 사람부터 보내고, 모자라면 뒤쪽이 다음 날로 밀린다.
  const ordered = [...userPosts].sort(([a], [b]) => a - b);
  for (const [userId, userData] of ordered) {
    // 유저별 일일 상한은 잔량과 무관하게 먼저 본다 — 걸린 사람은 큐에도 넣지 않는다.
    if (sentTodayCount(db, userId) >= maxPerDay) {
      for (const post of userData.posts) {
        db.insert(emailLogs).values({
          userId,
          postId: post.id,
          batchId,
          type: 'notification',
          status: 'skipped',
          error: `Daily per-user limit reached: ${maxPerDay}`,
        }).run();
      }
      console.log(`[Email] Skipped ${userData.email}: daily limit (${maxPerDay}) reached`);
      continue;
    }

    if (budget <= 0) {
      db.insert(emailQueue).values({ userId, posts: JSON.stringify(userData.posts) }).run();
      queued++;
      continue;
    }

    await deliver(db, batchId, userId, userData, userData.posts);
    budget--;
  }

  if (queued > 0) {
    console.warn(`[Email] Brevo remaining ${remaining} (reserve ${BREVO_RESERVE}): queued ${queued} notifications for tomorrow`);
  }
}
