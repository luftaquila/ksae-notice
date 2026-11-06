import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb, seedUser, seedAlertPreference, seedSetting, EXPIRED, type TestDb } from '../helpers';
import { emailLogs, emailQueue, settings, users } from '@/lib/db/schema';
import { DEFAULT_BREVO_RESERVE as RESERVE } from '@/lib/email/limits';

let db: TestDb;
// 목 Brevo 잔량은 보내도 줄지 않는다 — 잔량 반영이 늦는 경우와 같다.
let remaining = 300;
let creditsDown = false;
let failFor = new Set<string>();
const sent: { to: string; subject: string; html: string }[] = [];

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/email/brevo', () => ({
  getRemainingCredits: vi.fn(async () => {
    if (creditsDown) throw new Error('Brevo account API error 503');
    return remaining;
  }),
  sendEmail: vi.fn(async (params: { to: { email: string }; subject: string; htmlContent: string }) => {
    if (failFor.has(params.to.email)) throw new Error('Brevo API error 400');
    sent.push({ to: params.to.email, subject: params.subject, html: params.htmlContent });
    return { messageId: 'm' };
  }),
}));

const { MAX_QUEUE_ATTEMPTS, flushEmailQueue, notifyNewPosts, resetCreditLedger } = await import('@/lib/email/sender');
type NewPost = Parameters<typeof notifyNewPosts>[0][number];

function post(postNumber: number, overrides: Partial<NewPost> = {}): NewPost {
  return {
    id: postNumber,
    postNumber,
    title: `공지 ${postNumber}`,
    category: '공통',
    date: '2026-11-06',
    url: `https://example.test/${postNumber}`,
    isPinned: false,
    boardType: 'notice',
    ...overrides,
  };
}

// 공통 공지를 켠 구독자 n 명. userId 순으로 a0, a1, ...
function subscribers(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const id = seedUser(db, { googleId: `g${i}`, email: `a${i}@test.com` });
    seedAlertPreference(db, id, 'notice_Z');
    return id;
  });
}

function queueRows() {
  return db.select().from(emailQueue).all();
}

// 큐에 들어간 날을 하루 앞으로 — "다음 날"이 된 것으로 만든다.
function ageQueue() {
  db.update(emailQueue).set({ queuedAt: sql`datetime('now', '-1 day')` }).run();
}

function logs(status: string) {
  return db.select().from(emailLogs).where(eq(emailLogs.status, status)).all();
}

function setSetting(key: string, value: string) {
  db.update(settings).set({ value }).where(eq(settings.key, key)).run();
}

beforeEach(() => {
  db = createTestDb();
  remaining = 300;
  creditsDown = false;
  failFor = new Set();
  sent.length = 0;
  resetCreditLedger();
  seedSetting(db, 'maxEmailsPerUserPerDay', '2');
});

describe('notifyNewPosts — Brevo 잔량', () => {
  it('sends to everyone while the credits cover them and the reserve', async () => {
    subscribers(3);
    await notifyNewPosts([post(1)]);

    expect(sent.map((s) => s.to)).toEqual(['a0@test.com', 'a1@test.com', 'a2@test.com']);
    expect(queueRows()).toHaveLength(0);
  });

  // 예전에는 잔량 < 수신인이면 전원을 건너뛰었다. 이제 여유분을 남기고 보낼 만큼 보낸다.
  it('keeps the reserve, sends what fits and queues the rest instead of dropping everyone', async () => {
    const ids = subscribers(5);
    remaining = RESERVE + 2;

    await notifyNewPosts([post(1)]);

    expect(sent.map((s) => s.to)).toEqual(['a0@test.com', 'a1@test.com']);
    expect(queueRows().map((r) => r.userId)).toEqual(ids.slice(2));
    expect(logs('failed')).toHaveLength(0);
  });

  it('sends nothing now when only the reserve is left', async () => {
    subscribers(2);
    remaining = RESERVE;

    await notifyNewPosts([post(1)]);

    expect(sent).toHaveLength(0);
    expect(queueRows()).toHaveLength(2);
  });

  it('takes the reserve from the settings', async () => {
    subscribers(3);
    seedSetting(db, 'brevoReserve', '0');
    remaining = 2;

    await notifyNewPosts([post(1)]);

    expect(sent).toHaveLength(2);
    expect(queueRows()).toHaveLength(1);
  });

  // 일일 상한에 걸린 사람은 잔량을 쓰지 않고, 큐에도 들어가지 않는다 (예전과 같은 생략).
  it('skips a user at the per-user daily limit without spending or queueing', async () => {
    const [capped] = subscribers(2);
    setSetting('maxEmailsPerUserPerDay', '1');
    db.insert(emailLogs).values({ userId: capped, batchId: 'earlier', type: 'notification', status: 'sent' }).run();
    remaining = RESERVE + 1;

    await notifyNewPosts([post(1)]);

    expect(sent.map((s) => s.to)).toEqual(['a1@test.com']);
    expect(queueRows()).toHaveLength(0);
    expect(logs('skipped').map((l) => l.userId)).toEqual([capped]);
  });

  // 목 잔량은 보내도 줄지 않는다. 마지막 잔량에서 보낸 만큼 빼 둔 값을 써야 같은 몫을 두 번 쓰지 않는다.
  it('does not spend the same credits twice while Brevo has not caught up', async () => {
    subscribers(5);
    remaining = RESERVE + 3;

    await notifyNewPosts([post(1)]);
    await notifyNewPosts([post(2)]);

    // 첫 글: 세 명에게 보내고 둘은 큐로. 둘째 글: 남은 몫이 여유분뿐이라 다섯 명 모두 큐로.
    expect(sent).toHaveLength(3);
    expect(queueRows()).toHaveLength(7);
  });

  it('trusts a higher reading once the daily limit has reset', async () => {
    subscribers(2);
    remaining = RESERVE;
    await notifyNewPosts([post(1)]);
    remaining = 300;

    await notifyNewPosts([post(2)]);

    expect(sent).toHaveLength(2);
  });

  it('queues everyone instead of dropping the post when the credits cannot be read', async () => {
    subscribers(2);
    creditsDown = true;

    await notifyNewPosts([post(1)]);

    expect(sent).toHaveLength(0);
    expect(queueRows()).toHaveLength(2);
  });

  it('leaves out title changes while update alerts are off', async () => {
    subscribers(1);
    seedSetting(db, 'notifyPostUpdates', 'false');

    await notifyNewPosts([post(1), post(2, { title: '공지 2 (수정)', previousTitle: '공지 2' })]);
    await notifyNewPosts([post(3, { title: '공지 3 (수정)', previousTitle: '공지 3' })]);

    expect(sent.map((s) => s.subject)).toEqual(['[KSAE 공지봇] 새 게시글 1건']);
  });
});

describe('flushEmailQueue', () => {
  it('leaves what was queued today alone until the next day', async () => {
    subscribers(3);
    remaining = RESERVE + 1;
    await notifyNewPosts([post(1)]);
    sent.length = 0;
    remaining = 300;

    expect(await flushEmailQueue()).toBe(0);
    expect(sent).toHaveLength(0);
    expect(queueRows()).toHaveLength(2);
  });

  it('sends the backlog the next day and logs it as sent', async () => {
    subscribers(3);
    remaining = RESERVE + 1;
    await notifyNewPosts([post(1)]);
    sent.length = 0;
    ageQueue();
    remaining = 300;

    expect(await flushEmailQueue()).toBe(2);
    expect(sent.map((s) => s.to)).toEqual(['a1@test.com', 'a2@test.com']);
    expect(queueRows()).toHaveLength(0);
    expect(logs('sent')).toHaveLength(3);
  });

  // 새 글로 들어간 뒤 제목이 바뀌었으면, 받은 적 없는 글을 "수정"이라 하지 않는다.
  it('merges one person\'s backlog into one mail, keeping a never-seen post new under its latest title', async () => {
    subscribers(1);
    remaining = RESERVE;
    await notifyNewPosts([post(1)]);
    await notifyNewPosts([post(2), post(1, { title: '공지 1 (수정)', previousTitle: '공지 1' })]);
    expect(queueRows()).toHaveLength(2);
    ageQueue();
    remaining = 300;

    await flushEmailQueue();

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('[KSAE 공지봇] 새 게시글 2건');
    expect(sent[0].html).toContain('공지 1 (수정)');
  });

  it('shows a title changed twice against the title the person last saw', async () => {
    subscribers(1);
    remaining = RESERVE;
    await notifyNewPosts([post(1, { title: 'B', previousTitle: 'A' })]);
    await notifyNewPosts([post(1, { title: 'C', previousTitle: 'B' })]);
    ageQueue();
    remaining = 300;

    await flushEmailQueue();

    expect(sent[0].subject).toBe('[KSAE 공지봇] 수정된 게시글 1건');
    expect(sent[0].html).toContain('>A<');
    expect(sent[0].html).toContain('>C<');
    expect(sent[0].html).not.toContain('>B<');
  });

  it('keeps the reserve and leaves the rest for a later run', async () => {
    subscribers(4);
    remaining = RESERVE;
    await notifyNewPosts([post(1)]);
    ageQueue();
    remaining = RESERVE + 1;

    await flushEmailQueue();

    expect(sent.map((s) => s.to)).toEqual(['a0@test.com']);
    expect(queueRows()).toHaveLength(3);
  });

  it('drops a person who left, lapsed or paused, and posts from a category switched off', async () => {
    const [left, lapsed, paused, switchedOff, keeps] = subscribers(5);
    seedAlertPreference(db, keeps, 'rule');
    remaining = RESERVE;
    await notifyNewPosts([post(1), post(2, { boardType: 'rule', category: null })]);
    ageQueue();

    db.update(users).set({ deletedAt: '2026-11-06T00:00:00.000Z' }).where(eq(users.id, left)).run();
    db.update(users).set({ subscriptionExpiresAt: EXPIRED }).where(eq(users.id, lapsed)).run();
    db.update(users).set({ alertsPausedAt: '2026-11-06T00:00:00.000Z' }).where(eq(users.id, paused)).run();
    db.run(sql`UPDATE subscriptions SET is_active = 0 WHERE user_id = ${switchedOff}`);
    db.run(sql`UPDATE subscriptions SET is_active = 0 WHERE user_id = ${keeps} AND category = 'notice_Z'`);
    remaining = 300;

    await flushEmailQueue();

    // keeps 는 규정만 켜 두었으므로 규정 글 한 건만 받는다.
    expect(sent.map(({ to, subject }) => ({ to, subject }))).toEqual([{ to: 'a4@test.com', subject: '[KSAE 공지봇] 새 게시글 1건' }]);
    expect(queueRows()).toHaveLength(0);
  });

  it('drops people who are no longer recipients even with no credits to send', async () => {
    const [left] = subscribers(2);
    remaining = RESERVE;
    await notifyNewPosts([post(1)]);
    ageQueue();
    db.update(users).set({ deletedAt: '2026-11-06T00:00:00.000Z' }).where(eq(users.id, left)).run();

    await flushEmailQueue();

    expect(sent).toHaveLength(0);
    expect(queueRows().map((r) => r.userId)).not.toContain(left);
    expect(queueRows()).toHaveLength(1);
  });

  it('drops queued title changes once update alerts are switched off', async () => {
    subscribers(1);
    remaining = RESERVE;
    await notifyNewPosts([post(1, { title: 'B', previousTitle: 'A' })]);
    ageQueue();
    seedSetting(db, 'notifyPostUpdates', 'false');
    remaining = 300;

    await flushEmailQueue();

    expect(sent).toHaveLength(0);
    expect(queueRows()).toHaveLength(0);
  });

  it('sends yesterday\'s backlog before today\'s posts out of the same credits', async () => {
    subscribers(2);
    remaining = RESERVE;
    await notifyNewPosts([post(1)]);
    ageQueue();

    // 보낼 수 있는 것은 세 통: 밀린 두 통이 먼저, 오늘 글은 한 사람에게만 가고 하나는 다시 큐로.
    remaining = RESERVE + 3;
    await notifyNewPosts([post(2)]);

    expect(sent.map((s) => s.to)).toEqual(['a0@test.com', 'a1@test.com', 'a0@test.com']);
    expect(queueRows().map((r) => JSON.parse(r.posts)[0].postNumber)).toEqual([2]);
  });

  // 밀린 메일은 어제 몫이다. 오늘 상한을 차지하면 오늘 새 글이 생략돼 영영 사라진다.
  it('does not let the backlog use up today\'s per-user limit', async () => {
    subscribers(1);
    setSetting('maxEmailsPerUserPerDay', '1');
    remaining = RESERVE;
    await notifyNewPosts([post(1)]);
    ageQueue();
    remaining = 300;

    await notifyNewPosts([post(2)]);

    expect(sent.map((s) => s.html.includes('공지 2'))).toEqual([false, true]);
    expect(logs('skipped')).toHaveLength(0);
  });

  it('keeps a failed backlog mail queued, retries it, and drops it after the last attempt', async () => {
    const [broken, fine] = subscribers(2);
    remaining = RESERVE;
    await notifyNewPosts([post(1)]);
    ageQueue();
    failFor.add('a0@test.com');
    remaining = 300;

    // 실패하면 이번 회차를 멈춘다 — 뒤에 선 사람은 다음 회차로.
    await flushEmailQueue();
    expect(queueRows().map((r) => [r.userId, r.attempts])).toEqual([[broken, 1], [fine, 0]]);

    for (let i = 1; i < MAX_QUEUE_ATTEMPTS; i++) await flushEmailQueue();
    expect(queueRows().map((r) => r.userId)).toEqual([fine]);
    expect(logs('failed')).toHaveLength(MAX_QUEUE_ATTEMPTS);

    await flushEmailQueue();
    expect(sent.map((s) => s.to)).toEqual(['a1@test.com']);
    expect(queueRows()).toHaveLength(0);
  });

  it('drops a malformed row and still sends today\'s posts', async () => {
    const [userId] = subscribers(1);
    db.insert(emailQueue).values([
      { userId, posts: 'null', queuedAt: '2026-01-01 00:00:00' },
      { userId, posts: '{"not":"a list"}', queuedAt: '2026-01-01 00:00:00' },
      { userId, posts: 'not json', queuedAt: '2026-01-01 00:00:00' },
    ]).run();

    await notifyNewPosts([post(1)]);

    expect(sent.map((s) => s.to)).toEqual(['a0@test.com']);
    expect(queueRows()).toHaveLength(0);
  });
});
