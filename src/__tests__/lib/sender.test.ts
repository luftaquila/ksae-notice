import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb, seedUser, seedAlertPreference, seedSetting, EXPIRED, type TestDb } from '../helpers';
import { emailLogs, emailQueue, settings, users } from '@/lib/db/schema';

let db: TestDb;
let remaining = 300;
const sent: { to: string; subject: string }[] = [];

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/email/brevo', () => ({
  getRemainingCredits: vi.fn(async () => remaining),
  sendEmail: vi.fn(async (params: { to: { email: string }; subject: string }) => {
    sent.push({ to: params.to.email, subject: params.subject });
    return { messageId: 'm' };
  }),
}));

const { BREVO_RESERVE, flushEmailQueue, notifyNewPosts } = await import('@/lib/email/sender');
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

beforeEach(() => {
  db = createTestDb();
  remaining = 300;
  sent.length = 0;
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
    remaining = BREVO_RESERVE + 2;

    await notifyNewPosts([post(1)]);

    expect(sent.map((s) => s.to)).toEqual(['a0@test.com', 'a1@test.com']);
    expect(queueRows().map((r) => r.userId)).toEqual(ids.slice(2));
    expect(logs('failed')).toHaveLength(0);
  });

  it('sends nothing now when only the reserve is left', async () => {
    subscribers(2);
    remaining = BREVO_RESERVE;

    await notifyNewPosts([post(1)]);

    expect(sent).toHaveLength(0);
    expect(queueRows()).toHaveLength(2);
  });

  // 일일 상한에 걸린 사람은 잔량을 쓰지 않고, 큐에도 들어가지 않는다 (예전과 같은 생략).
  it('skips a user at the per-user daily limit without spending or queueing', async () => {
    const [capped] = subscribers(2);
    db.update(settings).set({ value: '1' }).where(eq(settings.key, 'maxEmailsPerUserPerDay')).run();
    db.insert(emailLogs).values({ userId: capped, batchId: 'earlier', type: 'notification', status: 'sent' }).run();
    remaining = BREVO_RESERVE + 1;

    await notifyNewPosts([post(1)]);

    expect(sent.map((s) => s.to)).toEqual(['a1@test.com']);
    expect(queueRows()).toHaveLength(0);
    expect(logs('skipped').map((l) => l.userId)).toEqual([capped]);
  });
});

describe('flushEmailQueue', () => {
  it('leaves what was queued today alone until the next day', async () => {
    subscribers(3);
    remaining = BREVO_RESERVE + 1;
    await notifyNewPosts([post(1)]);
    sent.length = 0;
    remaining = 300;

    expect(await flushEmailQueue()).toBeNull();
    expect(sent).toHaveLength(0);
    expect(queueRows()).toHaveLength(2);
  });

  it('sends the backlog the next day and logs it as sent', async () => {
    subscribers(3);
    remaining = BREVO_RESERVE + 1;
    await notifyNewPosts([post(1)]);
    sent.length = 0;
    ageQueue();
    remaining = 300;

    expect(await flushEmailQueue()).toEqual({ remaining: 300, sent: 2 });
    expect(sent.map((s) => s.to)).toEqual(['a1@test.com', 'a2@test.com']);
    expect(queueRows()).toHaveLength(0);
    expect(logs('sent')).toHaveLength(3);
  });

  it('merges several queued batches for one person into a single mail', async () => {
    subscribers(1);
    remaining = BREVO_RESERVE;
    await notifyNewPosts([post(1)]);
    await notifyNewPosts([post(2), post(1, { title: '공지 1 (수정)', previousTitle: '공지 1' })]);
    expect(queueRows()).toHaveLength(2);
    ageQueue();
    remaining = 300;

    await flushEmailQueue();

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('[KSAE 공지봇] 새 게시글 1건, 수정된 게시글 1건');
  });

  it('keeps the reserve and leaves the rest for a later run', async () => {
    subscribers(4);
    remaining = BREVO_RESERVE;
    await notifyNewPosts([post(1)]);
    ageQueue();
    remaining = BREVO_RESERVE + 1;

    await flushEmailQueue();

    expect(sent.map((s) => s.to)).toEqual(['a0@test.com']);
    expect(queueRows()).toHaveLength(3);
  });

  it('drops a person who left, lapsed or paused, and posts from a category switched off', async () => {
    const [left, lapsed, paused, switchedOff, keeps] = subscribers(5);
    seedAlertPreference(db, keeps, 'rule');
    remaining = BREVO_RESERVE;
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
    expect(sent).toEqual([{ to: 'a4@test.com', subject: '[KSAE 공지봇] 새 게시글 1건' }]);
    expect(queueRows()).toHaveLength(0);
  });

  it('sends yesterday\'s backlog before today\'s posts out of the same credits', async () => {
    subscribers(2);
    remaining = BREVO_RESERVE;
    await notifyNewPosts([post(1)]);
    ageQueue();
    sent.length = 0;

    // 보낼 수 있는 것은 세 통: 밀린 두 통이 먼저, 오늘 글은 한 사람에게만 가고 하나는 다시 큐로.
    remaining = BREVO_RESERVE + 3;
    await notifyNewPosts([post(2)]);

    expect(sent.map((s) => s.to)).toEqual(['a0@test.com', 'a1@test.com', 'a0@test.com']);
    expect(queueRows().map((r) => JSON.parse(r.posts)[0].postNumber)).toEqual([2]);
  });
});
