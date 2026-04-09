import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedUser, seedSubscription, type TestDb } from '../helpers';
import { eq } from 'drizzle-orm';
import { users, subscriptions } from '@/lib/db/schema';

let db: TestDb;
let mockSessionValue: any = null;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  auth: () => mockSessionValue,
}));

const { DELETE } = await import('@/app/api/user/route');

describe('DELETE /api/user', () => {
  beforeEach(() => {
    db = createTestDb();
    mockSessionValue = null;
  });

  it('returns 401 when not authenticated', async () => {
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it('soft deletes user and deactivates subscriptions', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'test@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    seedSubscription(db, userId, 'rule');

    mockSessionValue = { user: { id: userId, email: 'test@test.com' } };
    const res = await DELETE();
    const data = await res.json();
    expect(data.ok).toBe(true);

    const user = db.select().from(users).where(eq(users.id, userId)).get();
    expect(user!.deletedAt).not.toBeNull();

    const subs = db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all();
    expect(subs.every(s => s.isActive === 0)).toBe(true);
  });

  it('returns 401 when session has no user id', async () => {
    mockSessionValue = { user: { email: 'test@test.com' } };
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it('soft deletes user even with no subscriptions', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'test@test.com' });
    mockSessionValue = { user: { id: userId, email: 'test@test.com' } };

    const res = await DELETE();
    const data = await res.json();
    expect(data.ok).toBe(true);

    const user = db.select().from(users).where(eq(users.id, userId)).get();
    expect(user!.deletedAt).not.toBeNull();
  });
});
