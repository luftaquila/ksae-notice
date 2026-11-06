import { randomUUID } from 'crypto';
import { eq, and, sql, gte, isNull, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { users, alertPreferences, emailLogs, emailQueue } from '../db/schema';
import { NOTICE_CATEGORY_CODES, ALERT_CATEGORIES, type BoardType } from '../constants';
import { getSetting, holdsSeat } from '../subscription/capacity';
import { sendEmail, getRemainingCredits } from './brevo';
import { parseBrevoReserve } from './limits';
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

// 메일 로그의 type. 유저별 일일 상한은 그날의 실시간 알림(LIVE)만 센다 — 다음 날로 넘겨
// 보낸 알림(BACKLOG)은 어제 몫이라, 오늘 몫을 차지하면 오늘 새 글이 생략돼 영영 사라진다.
const LIVE = 'notification';
const BACKLOG = 'notification_backlog';

// 큐 행을 몇 번 실패할 때까지 다시 보내 볼지. 넘으면 버린다 — 주소가 잘못된 사람
// 하나가 큐 맨 앞에서 영영 다른 사람을 막지 않도록.
export const MAX_QUEUE_ATTEMPTS = 3;

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
  return parseInt(getSetting('maxEmailsPerUserPerDay', db) || '2', 10);
}

function getBrevoReserve(db: Db): number {
  return parseBrevoReserve(getSetting('brevoReserve', db));
}

// 게시글 제목이 바뀐 것(수정)도 알리는지. 끄면 새 글만 보낸다.
function notifiesPostUpdates(db: Db): boolean {
  return getSetting('notifyPostUpdates', db) !== 'false';
}

// 오늘 이 사람에게 나간 실시간 알림 메일 수. 한 통이 batch_id 하나다.
function sentTodayCount(db: Db, userId: number): number {
  const today = new Date().toISOString().slice(0, 10);
  const row = db
    .select({ count: sql<number>`count(distinct ${emailLogs.batchId})` })
    .from(emailLogs)
    .where(and(
      eq(emailLogs.userId, userId),
      eq(emailLogs.type, LIVE),
      eq(emailLogs.status, 'sent'),
      gte(emailLogs.sentAt, today),
    ))
    .get();
  return row?.count || 0;
}

// ── Brevo 잔량 ────────────────────────────────────────────────

// 방금 보낸 메일이 Brevo 잔량에 곧바로 반영된다는 보장이 없다. 큐 처리와 새 글 발송이
// 연달아 잔량을 읽으면 같은 몫을 두 번 쓸 수 있으므로, 마지막으로 쓴 잔량과 그 뒤 여기서
// 보낸 통수를 기억해 둔다. 새로 읽은 값이 마지막 값보다 크지 않으면 둘 중 작은 쪽을 쓴다.
// 더 크면 한도가 초기화됐거나 크레딧을 산 것이므로 새 값을 믿는다.
let ledger: { remaining: number; sentSince: number } | null = null;

async function readRemainingCredits(): Promise<number> {
  const fresh = await getRemainingCredits();
  const remaining = ledger && fresh <= ledger.remaining
    ? Math.min(fresh, ledger.remaining - ledger.sentSince)
    : fresh;
  ledger = { remaining, sentSince: 0 };
  return remaining;
}

// 테스트용 — 프로세스 안에 남는 잔량 기억을 지운다.
export function resetCreditLedger(): void {
  ledger = null;
}

// 한 사람에게 한 통. 결과는 글마다 남기고 같은 batchId 가 그 한 통을 가리킨다.
// 보냈으면 true. 실패해도 잔량 기억에는 한 통으로 센다 — 실패가 한도를 먹었는지 알 수 없다.
async function deliver(
  db: Db,
  batchId: string,
  type: typeof LIVE | typeof BACKLOG,
  userId: number,
  to: { email: string; name: string | null },
  posts: NewPost[],
): Promise<boolean> {
  if (ledger) ledger.sentSince++;
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
      db.insert(emailLogs).values({ userId, postId: post.id, batchId, type, status: 'sent' }).run();
    }

    console.log(`[Email] Notification sent to ${to.email} (${posts.length} posts${type === BACKLOG ? ', queued' : ''})`);
    return true;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    db.insert(emailLogs).values({ userId, batchId, type, status: 'failed', error: errMsg }).run();
    console.error(`[Email] Failed to send to ${to.email}:`, errMsg);
    return false;
  }
}

// ── 다음 날로 넘긴 알림 ─────────────────────────────────────────

// 큐 행 여럿을 한 통에 담을 글 목록으로 합친다. 같은 글이 여러 번 들어 있으면 제목은
// 가장 나중 것을, 새 글인지·수정 전 제목은 처음 것을 따른다 — 사용자가 마지막으로 본 것은
// 처음 항목 이전의 상태다. 새 글로 들어간 뒤 제목이 바뀌었으면 바뀐 제목의 새 글로 간다.
// 형식이 깨진 행은 빈 것으로 본다(그 행은 보낼 글이 없어 버려진다).
function mergeQueuedPosts(rows: { posts: string }[]): NewPost[] {
  const merged = new Map<string, NewPost>();
  for (const row of rows) {
    let posts: unknown;
    try {
      posts = JSON.parse(row.posts);
    } catch {
      continue;
    }
    if (!Array.isArray(posts)) continue;
    for (const post of posts as NewPost[]) {
      const key = `${post.boardType}:${post.postNumber}`;
      const earlier = merged.get(key);
      merged.set(key, earlier ? { ...post, previousTitle: earlier.previousTitle } : post);
    }
  }
  return [...merged.values()];
}

// 큐에 들어간 날(KST)의 다음 날부터 보낸다. Brevo 무료 한도는 하루 단위라, 같은 날
// 다시 시도해 봐야 여유분까지 쓰게 될 뿐이다. 초기화 시각은 문서에 없으므로 시각을
// 정해 두지 않고, 부를 때마다 실제 잔량을 읽어 여유분을 뺀 만큼만 보낸다 — 모자라면
// 나머지는 그대로 남아 다음 기회(시간마다 도는 크론, 또는 다음 새 글 발송 직전)를 기다린다.
//
// 가장 오래 기다린 사람부터, 한 사람에게 쌓인 것은 한 통으로. 유저별 일일 상한은 보지도
// 세지도 않는다(BACKLOG). 보내기 전에 수신 조건을 다시 본다 — 그사이 탈퇴·만료·일시중지했으면
// 잔량과 무관하게 버리고, 꺼 둔 카테고리의 글과 (수정 알림을 껐으면) 수정 글은 뺀다.
// 실패하면 행을 남겨 다음 회차에 다시 보내고, 이번 회차는 거기서 멈춘다 — 한도·장애처럼
// 모두에게 걸리는 원인일 수 있다. MAX_QUEUE_ATTEMPTS 번 실패한 행은 버린다.
async function runFlush(): Promise<number> {
  const db = getDb();
  const due = db
    .select()
    .from(emailQueue)
    .where(sql`date(${emailQueue.queuedAt}, '+9 hours') < date('now', '+9 hours')`)
    .orderBy(emailQueue.id)
    .all();
  if (due.length === 0) return 0;

  // Map 은 처음 넣은 순서를 지키므로 가장 오래 기다린 사람이 앞에 온다.
  const byUser = new Map<number, typeof due>();
  for (const row of due) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId)!.push(row);
  }

  const includeUpdates = notifiesPostUpdates(db);
  const ready: { userId: number; rows: typeof due; to: { email: string; name: string | null }; posts: NewPost[] }[] = [];
  for (const [userId, rows] of byUser) {
    const account = db
      .select({ email: users.email, name: users.name, pausedAt: users.alertsPausedAt })
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
      if (!includeUpdates && p.previousTitle) return false;
      const category = getAlertCategory(p);
      return category !== null && activeCategories.has(category);
    });

    // 좌석(기간 유효·미탈퇴)은 정원·수신자 집계와 같은 holdsSeat 로 본다.
    if (!account || account.pausedAt || !holdsSeat(userId, db) || posts.length === 0) {
      db.delete(emailQueue).where(inArray(emailQueue.id, rows.map((r) => r.id))).run();
      console.log(`[Email] Dropped queued notification for user ${userId}: no longer a recipient`);
      continue;
    }
    ready.push({ userId, rows, to: { email: account.email, name: account.name }, posts });
  }
  if (ready.length === 0) return 0;

  let budget: number;
  try {
    budget = (await readRemainingCredits()) - getBrevoReserve(db);
  } catch (error) {
    console.error('[Email] Failed to check Brevo remaining credits for the queue:', error);
    return 0;
  }

  let sent = 0;
  const batchId = randomUUID();
  for (const item of ready) {
    if (budget <= 0) break;
    budget--;
    const ids = item.rows.map((r) => r.id);

    if (await deliver(db, batchId, BACKLOG, item.userId, item.to, item.posts)) {
      db.delete(emailQueue).where(inArray(emailQueue.id, ids)).run();
      sent++;
      continue;
    }

    const attempts = Math.max(...item.rows.map((r) => r.attempts)) + 1;
    if (attempts >= MAX_QUEUE_ATTEMPTS) {
      db.delete(emailQueue).where(inArray(emailQueue.id, ids)).run();
      console.warn(`[Email] Dropped queued notification for user ${item.userId} after ${attempts} failed attempts`);
    } else {
      db.update(emailQueue).set({ attempts: sql`${emailQueue.attempts} + 1` }).where(inArray(emailQueue.id, ids)).run();
    }
    break;
  }

  if (sent > 0) console.log(`[Email] Sent ${sent} queued notifications`);
  return sent;
}

// 크론과 새 글 발송이 같은 시각에 겹쳐도 같은 행을 두 번 보내지 않도록 한 번에 하나만.
// 둘 다 커스텀 서버(server.ts)의 모듈 그래프 안에서 부르므로 모듈 변수로 충분하다.
// 겹치지 않고 연달아 부를 때의 잔량 중복 사용은 위의 잔량 기억(ledger)이 막는다.
let flushInFlight: Promise<number> | null = null;

// 큐에서 보낸 통수를 돌려준다.
export function flushEmailQueue(): Promise<number> {
  flushInFlight ??= runFlush().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

// ── 새 글 알림 ─────────────────────────────────────────────────

export async function notifyNewPosts(newPosts: NewPost[]): Promise<void> {
  const db = getDb();

  // 수정 알림을 꺼 두었으면 제목이 바뀐 글은 알리지 않는다.
  const notifiable = notifiesPostUpdates(db) ? newPosts : newPosts.filter((p) => !p.previousTitle);

  // Group new posts by alert category
  const postsBySubCategory = new Map<string, NewPost[]>();
  for (const post of notifiable) {
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

  // 어제까지 밀린 알림이 오늘 새 글보다 먼저 나간다. 큐 처리가 어떤 이유로 실패해도
  // 오늘 새 글 알림은 이어 간다.
  try {
    await flushEmailQueue();
  } catch (error) {
    console.error('[Email] Queue flush failed:', error);
  }

  // 잔량에서 여유분을 뺀 만큼만 지금 보내고, 넘치는 사람은 다음 날로 큐에 넣는다.
  // 예전에는 잔량이 수신인 수보다 적으면 이 글의 알림을 전원에게 통째로 건너뛰었다.
  // 잔량을 못 읽으면 보낼 수 있는지 알 수 없으므로 전원을 큐에 넣는다 — 버리지 않는다.
  let remaining: number | null;
  try {
    remaining = await readRemainingCredits();
  } catch (error) {
    console.error('[Email] Failed to check Brevo remaining credits, queueing every notification:', error);
    remaining = null;
  }
  const reserve = getBrevoReserve(db);
  let budget = remaining === null ? 0 : remaining - reserve;
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
          type: LIVE,
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

    await deliver(db, batchId, LIVE, userId, userData, userData.posts);
    budget--;
  }

  if (queued > 0) {
    console.warn(`[Email] Brevo remaining ${remaining ?? 'unknown'} (reserve ${reserve}): queued ${queued} notifications for tomorrow`);
  }
}
