import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedSubscription, seedPayment, UNEXPIRED, type MockSession, type TestDb } from '../helpers';
import { eq } from 'drizzle-orm';
import { users, subscriptions } from '@/lib/db/schema';
import { ACCOUNT_DELETE_CONFIRMATION } from '@/lib/constants';

let db: TestDb;
let mockSessionValue: MockSession = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  auth: () => mockSessionValue,
}));

const { DELETE } = await import('@/app/api/user/route');

function withdraw(body: unknown = { confirmation: ACCOUNT_DELETE_CONFIRMATION }) {
  return DELETE(new Request('http://localhost/api/user', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('DELETE /api/user', () => {
  beforeEach(() => {
    db = createTestDb();
    mockSessionValue = null;
  });

  it('returns 401 when not authenticated', async () => {
    const res = await withdraw();
    expect(res.status).toBe(401);
  });

  it('soft deletes user and deactivates subscriptions', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'test@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    seedSubscription(db, userId, 'rule');

    mockSessionValue = { user: { id: userId, email: 'test@test.com' } };
    const res = await withdraw();
    const data = await res.json();
    expect(data.ok).toBe(true);

    const user = db.select().from(users).where(eq(users.id, userId)).get();
    expect(user!.deletedAt).not.toBeNull();

    const subs = db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all();
    expect(subs.every(s => s.isActive === 0)).toBe(true);
  });

  it('returns 401 when session has no user id', async () => {
    mockSessionValue = { user: { email: 'test@test.com' } };
    const res = await withdraw();
    expect(res.status).toBe(401);
  });

  it('soft deletes user even with no subscriptions', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'test@test.com' });
    mockSessionValue = { user: { id: userId, email: 'test@test.com' } };

    const res = await withdraw();
    const data = await res.json();
    expect(data.ok).toBe(true);

    const user = db.select().from(users).where(eq(users.id, userId)).get();
    expect(user!.deletedAt).not.toBeNull();
  });
});

// 확인 문구는 서버가 본다. 화면의 비활성 버튼만 믿으면 다른 경로로 지나간다.
describe('DELETE /api/user - confirmation', () => {
  let userId: number;

  beforeEach(() => {
    db = createTestDb();
    userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
  });

  it('refuses without the exact phrase', async () => {
    expect((await withdraw({ confirmation: '회원 탈퇴' })).status).toBe(400);
    expect((await withdraw({ confirmation: '' })).status).toBe(400);
    expect((await withdraw({})).status).toBe(400);
    // 본문이 아예 없는 경우.
    expect((await DELETE(new Request('http://localhost/api/user', { method: 'DELETE' }))).status).toBe(400);

    expect(db.select().from(users).where(eq(users.id, userId)).get()!.deletedAt).toBeNull();
  });

  it('accepts the exact phrase', async () => {
    expect((await withdraw({ confirmation: ACCOUNT_DELETE_CONFIRMATION })).status).toBe(200);
    expect(db.select().from(users).where(eq(users.id, userId)).get()!.deletedAt).not.toBeNull();
  });
});

// 결제창이 떠 있는 동안은 탈퇴를 막는다. 승인이 도착했을 때 받을 사람이 없어진다.
describe('DELETE /api/user - open payment', () => {
  let userId: number;

  beforeEach(() => {
    db = createTestDb();
    userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
  });

  it('refuses while an order opened just now is still pending', async () => {
    seedPayment(db, { userId, userEmail: 'a@test.com', status: 'pending' });

    const res = await withdraw();
    expect(res.status).toBe(409);
    expect(db.select().from(users).where(eq(users.id, userId)).get()!.deletedAt).toBeNull();
  });

  // 방치된 pending 이 영원히 막아서는 안 된다.
  it('ignores a pending order older than fifteen minutes', async () => {
    seedPayment(db, { userId, userEmail: 'a@test.com', status: 'pending', createdAt: '2020-01-01 00:00:00' });

    expect((await withdraw()).status).toBe(200);
  });

  it('ignores settled and failed orders', async () => {
    seedPayment(db, { userId, userEmail: 'a@test.com', status: 'paid' });
    seedPayment(db, { userId, userEmail: 'a@test.com', status: 'failed' });
    seedPayment(db, { userId, userEmail: 'a@test.com', status: 'expired' });

    expect((await withdraw()).status).toBe(200);
  });

  it("ignores someone else's pending order", async () => {
    const other = seedUser(db, { googleId: 'g2', email: 'b@test.com' });
    seedPayment(db, { userId: other, userEmail: 'b@test.com', status: 'pending' });

    expect((await withdraw()).status).toBe(200);
  });
});

// 탈퇴는 남은 구독 기간을 포기하는 것이다 — /policy 와 확인 문구가 그렇게 말한다.
// 기간을 남겨두면 재로그인만으로 결제 없이 되살아난다.
describe('DELETE /api/user - subscription period', () => {
  beforeEach(() => {
    db = createTestDb();
    mockSessionValue = null;
  });

  it('forfeits the remaining period', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: UNEXPIRED });
    seedSubscription(db, userId, 'notice_Z');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    await withdraw();

    const user = db.select().from(users).where(eq(users.id, userId)).get()!;
    expect(user.deletedAt).not.toBeNull();
    expect(user.subscriptionExpiresAt).toBeNull();
  });
});
