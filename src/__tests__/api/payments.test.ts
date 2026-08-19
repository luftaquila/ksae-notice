import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createTestDb,
  seedUser,
  seedSubscription,
  seedSetting,
  EXPIRED,
  UNEXPIRED,
  type TestDb,
} from '../helpers';
import { users, payments, settings } from '@/lib/db/schema';
import type { NicepayResult } from '@/lib/payment/nicepay';

let db: TestDb;
let mockSessionValue: any = null;

// 나이스페이 호출만 갈아끼운다. 서명 계산은 실제 구현을 그대로 쓴다 — 테스트가
// 자기 서명을 검증하면 아무것도 지켜주지 못한다.
let approveResponse: NicepayResult = {};
let approveError: Error | null = null;
let cancelResponse: NicepayResult = {};
let cancelError: Error | null = null;
const approveCalls: [string, number][] = [];
const netCancelCalls: string[] = [];
const cancelCalls: { tid: string; reason: string; orderId: string }[] = [];

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/auth', () => ({
  auth: () => mockSessionValue,
  requireAdmin: () => (mockSessionValue?.user?.isAdmin ? mockSessionValue : null),
}));

vi.mock('@/lib/payment/nicepay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payment/nicepay')>();
  return {
    ...actual,
    approve: async (tid: string, amount: number) => {
      approveCalls.push([tid, amount]);
      if (approveError) throw approveError;
      return approveResponse;
    },
    netCancel: async (orderId: string) => {
      netCancelCalls.push(orderId);
      return { resultCode: '0000' };
    },
    cancelPayment: async (tid: string, reason: string, orderId: string) => {
      cancelCalls.push({ tid, reason, orderId });
      if (cancelError) throw cancelError;
      return cancelResponse;
    },
  };
});

const { authSignature } = await import('@/lib/payment/nicepay');
const { POST: createOrderRoute } = await import('@/app/api/payments/orders/route');
const { POST: returnRoute } = await import('@/app/api/payments/return/route');
const { POST: webhookRoute } = await import('@/app/api/payments/webhook/route');
const { GET: listRoute } = await import('@/app/api/payments/route');
const { GET: adminListRoute, POST: adminCancelRoute } = await import('@/app/api/admin/payments/route');

function orderReq() {
  return new Request('http://localhost/api/payments/orders', { method: 'POST' }) as any;
}

function returnReq(fields: Record<string, string>) {
  return new Request('http://localhost/api/payments/return', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  }) as any;
}

function webhookReq(payload: Record<string, unknown>) {
  return new Request('http://localhost/api/payments/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as any;
}

function adminCancelReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

function orderOf(orderId: string) {
  return db.select().from(payments).where(eq(payments.orderId, orderId)).get()!;
}

function periodOf(userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get()!.subscriptionExpiresAt;
}

function returnFields(order: { orderId: string; amount: number }, overrides: Record<string, string> = {}) {
  const amount = String(order.amount);
  const authToken = 'authtoken';
  return {
    authResultCode: '0000',
    authResultMsg: '인증 성공',
    tid: 'tid-1',
    clientId: 'R2_testclient',
    orderId: order.orderId,
    amount,
    authToken,
    signature: authSignature(authToken, amount),
    ...overrides,
  };
}

function approved(amount: number): NicepayResult {
  return {
    resultCode: '0000',
    resultMsg: '정상 처리되었습니다',
    status: 'paid',
    tid: 'tid-1',
    amount,
    payMethod: 'card',
    ediDate: '2026-08-19T12:00:00.000+0900',
  };
}

// 결제 한 건을 승인까지 태운다.
async function buyOnce(userId: number, email = 'a@test.com') {
  mockSessionValue = { user: { id: userId, email } };
  const order = await (await createOrderRoute(orderReq())).json();
  approveResponse = approved(order.amount);
  await returnRoute(returnReq(returnFields(order)));
  return order as { orderId: string; amount: number; targetYear: number };
}

beforeEach(() => {
  db = createTestDb();
  mockSessionValue = null;
  approveResponse = {};
  approveError = null;
  cancelResponse = { resultCode: '0000' };
  cancelError = null;
  approveCalls.length = 0;
  netCancelCalls.length = 0;
  cancelCalls.length = 0;

  seedSetting(db, 'registrationOpen', 'true');
  seedSetting(db, 'maxSubscribers', '50');
  seedSetting(db, 'subscriptionPrice', '1000');

  vi.stubEnv('NICEPAY_CLIENT_ID', 'R2_testclient');
  vi.stubEnv('NICEPAY_SECRET_KEY', 'testsecret');
  vi.stubEnv('SITE_URL', 'https://ksae-notice.test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/payments/orders', () => {
  it('returns 401 when not authenticated', async () => {
    expect((await createOrderRoute(orderReq())).status).toBe(401);
  });

  it('returns 503 when the gateway keys are missing', async () => {
    vi.stubEnv('NICEPAY_SECRET_KEY', '');
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    expect((await createOrderRoute(orderReq())).status).toBe(503);
  });

  // 금액은 서버 설정에서만 나온다. 요청 본문에는 금액을 넣을 자리가 없다.
  it('prices the order from settings and never from the client', async () => {
    db.update(settings).set({ value: '3000' }).where(eq(settings.key, 'subscriptionPrice')).run();
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const body = await (await createOrderRoute(orderReq())).json();

    expect(body.amount).toBe(3000);
    expect(body.method).toBe('cardAndEasyPay');
    expect(body.returnUrl).toBe('https://ksae-notice.test/api/payments/return');
    expect(orderOf(body.orderId).status).toBe('pending');
  });

  // 카드 최소 승인금액 밑의 설정값은 저장돼 있어도 쓰지 않는다.
  it('ignores a price below the card minimum', async () => {
    db.update(settings).set({ value: '500' }).where(eq(settings.key, 'subscriptionPrice')).run();
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    expect((await (await createOrderRoute(orderReq())).json()).amount).toBe(1000);
  });

  it('quotes this year for a lapsed account and next year for a covered one', async () => {
    const lapsed = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: EXPIRED });
    mockSessionValue = { user: { id: lapsed, email: 'a@test.com' } };
    expect((await (await createOrderRoute(orderReq())).json()).targetYear).toBe(new Date().getFullYear());

    const covered = seedUser(db, { googleId: 'g2', email: 'b@test.com', subscriptionExpiresAt: UNEXPIRED });
    mockSessionValue = { user: { id: covered, email: 'b@test.com' } };
    expect((await (await createOrderRoute(orderReq())).json()).targetYear).toBe(new Date().getFullYear() + 2);
  });

  it('blocks a new payer when every subscriber slot is taken', async () => {
    db.update(settings).set({ value: '1' }).where(eq(settings.key, 'maxSubscribers')).run();
    const taker = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, taker, 'notice_Z');
    const newcomer = seedUser(db, { googleId: 'g2', email: 'b@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: newcomer, email: 'b@test.com' } };

    const res = await createOrderRoute(orderReq());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('최대 구독자 수에 도달했습니다.');
  });

  it('lets a paid-up subscriber renew even when the limit is reached', async () => {
    db.update(settings).set({ value: '1' }).where(eq(settings.key, 'maxSubscribers')).run();
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    seedSubscription(db, userId, 'notice_Z');
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    expect((await createOrderRoute(orderReq())).status).toBe(200);
  });

  it('gives the real reason when registration is closed rather than the limit', async () => {
    db.update(settings).set({ value: 'false' }).where(eq(settings.key, 'registrationOpen')).run();
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };

    const res = await createOrderRoute(orderReq());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('현재 신규 구독이 중단되었습니다.');
  });
});

describe('POST /api/payments/return', () => {
  it('approves, extends the period, and redirects with 303', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();
    approveResponse = approved(order.amount);

    const res = await returnRoute(returnReq(returnFields(order)));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain(`/payments/result?result=paid&order=${order.orderId}`);
    expect(approveCalls).toEqual([['tid-1', 1000]]);
    expect(periodOf(userId)).toBe(`${new Date().getFullYear()}-12-31T23:59:59.000Z`);

    const stored = orderOf(order.orderId);
    expect(stored.status).toBe('paid');
    expect(stored.grantedFrom).toBeNull();
    expect(stored.grantedTo).toBe(periodOf(userId));
  });

  it('never calls the approval API when the amount was tampered with', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();

    const res = await returnRoute(returnReq(returnFields(order, { amount: '100' })));

    expect(res.headers.get('location')).toContain('result=failed');
    expect(approveCalls).toEqual([]);
    expect(periodOf(userId)).toBeNull();
    expect(orderOf(order.orderId).status).toBe('failed');
  });

  it('never calls the approval API on a bad signature', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();

    await returnRoute(returnReq(returnFields(order, { signature: '0'.repeat(64) })));

    expect(approveCalls).toEqual([]);
    expect(orderOf(order.orderId).failReason).toBe('결제 인증 서명 검증에 실패했습니다');
  });

  it('records the gateway message when the buyer cancels at the window', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();

    await returnRoute(returnReq(returnFields(order, {
      authResultCode: '1001',
      authResultMsg: '사용자가 취소하였습니다',
    })));

    expect(approveCalls).toEqual([]);
    expect(orderOf(order.orderId).failReason).toBe('사용자가 취소하였습니다');
  });

  it('reports an unknown order as invalid without touching anything', async () => {
    const res = await returnRoute(returnReq({ orderId: 'nope', authResultCode: '0000' }));

    expect(res.headers.get('location')).toContain('result=invalid');
    expect(approveCalls).toEqual([]);
  });

  // 승인 성립 여부를 알 수 없는 상태에서는 망취소가 유일한 안전한 수습이다.
  it('net cancels when the approval call never answers', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();
    approveError = new Error('read timeout');

    await returnRoute(returnReq(returnFields(order)));

    expect(netCancelCalls).toEqual([order.orderId]);
    expect(periodOf(userId)).toBeNull();
    expect(orderOf(order.orderId).status).toBe('failed');
  });

  it('does not extend the period when the approval is rejected', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();
    approveResponse = { resultCode: '3041', resultMsg: '금액 오류', status: 'failed' };

    await returnRoute(returnReq(returnFields(order)));

    expect(periodOf(userId)).toBeNull();
    expect(orderOf(order.orderId).failReason).toBe('금액 오류');
  });

  it('refuses to grant when the approval response signature does not verify', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();
    approveResponse = { ...approved(order.amount), signature: '0'.repeat(64) };

    await returnRoute(returnReq(returnFields(order)));

    expect(periodOf(userId)).toBeNull();
    expect(orderOf(order.orderId).status).toBe('failed');
  });

  // 한 번의 결제는 정확히 한 해를 산다 — 두 번 들어와도 두 해가 되지 않는다.
  it('grants only once when the return is replayed', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();
    approveResponse = approved(order.amount);

    await returnRoute(returnReq(returnFields(order)));
    const afterFirst = periodOf(userId);
    await returnRoute(returnReq(returnFields(order)));

    expect(periodOf(userId)).toBe(afterFirst);
  });
});

describe('POST /api/payments/webhook', () => {
  it('answers with the literal OK body NicePay checks for', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();

    const res = await webhookRoute(webhookReq({
      orderId: order.orderId,
      tid: 'tid-1',
      amount: order.amount,
      status: 'paid',
    }));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
  });

  // 브라우저가 returnUrl 을 완주하지 못한 승인을 건져 올리는 경로.
  it('settles an order the browser never came back from', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();

    await webhookRoute(webhookReq({
      orderId: order.orderId,
      tid: 'tid-1',
      amount: order.amount,
      status: 'paid',
    }));

    expect(orderOf(order.orderId).status).toBe('paid');
    expect(periodOf(userId)).toBe(`${new Date().getFullYear()}-12-31T23:59:59.000Z`);
  });

  it('does not grant a second year after the return already settled', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    const order = await buyOnce(userId);
    const afterReturn = periodOf(userId);

    await webhookRoute(webhookReq({
      orderId: order.orderId,
      tid: 'tid-1',
      amount: order.amount,
      status: 'paid',
    }));

    expect(periodOf(userId)).toBe(afterReturn);
  });

  it('ignores a webhook whose amount does not match the order', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();

    await webhookRoute(webhookReq({ orderId: order.orderId, tid: 'tid-1', amount: 100, status: 'paid' }));

    expect(orderOf(order.orderId).status).toBe('pending');
    expect(periodOf(userId)).toBeNull();
  });

  it('ignores a webhook carrying a wrong signature', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();

    await webhookRoute(webhookReq({
      orderId: order.orderId,
      tid: 'tid-1',
      amount: order.amount,
      ediDate: '2026-08-19T12:00:00.000+0900',
      status: 'paid',
      signature: '0'.repeat(64),
    }));

    expect(orderOf(order.orderId).status).toBe('pending');
  });

  // 나이스페이 관리자 화면에서 직접 취소한 건이 이 경로로 들어온다.
  it('rolls the period back when the gateway reports a cancellation', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    const order = await buyOnce(userId);

    const hook = { orderId: order.orderId, tid: 'tid-1', amount: order.amount, status: 'cancelled' };
    await webhookRoute(webhookReq(hook));
    await webhookRoute(webhookReq(hook));

    expect(periodOf(userId)).toBeNull();
    expect(orderOf(order.orderId).status).toBe('cancelled');
  });
});

describe('GET /api/payments', () => {
  it('returns 401 when not authenticated', async () => {
    expect((await listRoute()).status).toBe(401);
  });

  it('hides the transaction key and raw payloads from the buyer', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    await buyOnce(userId);

    const body = await (await listRoute()).json();

    expect(body.payments.length).toBe(1);
    expect(body.payments[0].status).toBe('paid');
    expect(body.payments[0].tid).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('rawApprove');
  });

  it('does not show one buyer another buyer\'s orders', async () => {
    const mine = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    const theirs = seedUser(db, { googleId: 'g2', email: 'b@test.com', subscriptionExpiresAt: null });
    await buyOnce(theirs, 'b@test.com');

    mockSessionValue = { user: { id: mine, email: 'a@test.com' } };
    expect((await (await listRoute()).json()).payments).toEqual([]);
  });
});

describe('admin payments', () => {
  it('refuses a non-admin', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com', isAdmin: false } };

    expect((await adminListRoute()).status).toBe(403);
    expect((await adminCancelRoute(adminCancelReq({ orderId: 'x' }))).status).toBe(403);
  });

  it('cancels at the gateway first and only then rolls the period back', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    const order = await buyOnce(userId);
    expect(periodOf(userId)).not.toBeNull();

    mockSessionValue = { user: { id: userId, email: 'a@test.com', isAdmin: true } };
    const res = await adminCancelRoute(adminCancelReq({ orderId: order.orderId, reason: '테스트 취소' }));

    expect(res.status).toBe(200);
    expect((await res.json()).rolledBack).toBe(true);
    expect(cancelCalls).toEqual([{ tid: 'tid-1', reason: '테스트 취소', orderId: order.orderId }]);
    expect(periodOf(userId)).toBeNull();
    expect(orderOf(order.orderId).status).toBe('cancelled');
  });

  it('restores the previous expiry rather than clearing it outright', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: EXPIRED });
    const order = await buyOnce(userId);

    mockSessionValue = { user: { id: userId, email: 'a@test.com', isAdmin: true } };
    await adminCancelRoute(adminCancelReq({ orderId: order.orderId }));

    expect(periodOf(userId)).toBe(EXPIRED);
  });

  // 되돌리면 나중 결제까지 무효로 만들어 버리므로 손대지 않는다.
  it('leaves the period alone when a later payment already moved it', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    const first = await buyOnce(userId);
    const second = await buyOnce(userId);
    const afterSecond = periodOf(userId);

    mockSessionValue = { user: { id: userId, email: 'a@test.com', isAdmin: true } };
    const res = await adminCancelRoute(adminCancelReq({ orderId: first.orderId }));

    expect((await res.json()).rolledBack).toBe(false);
    expect(periodOf(userId)).toBe(afterSecond);
    expect(orderOf(first.orderId).status).toBe('cancelled');
    expect(orderOf(second.orderId).status).toBe('paid');
  });

  it('keeps the period when the gateway refuses the cancellation', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com', subscriptionExpiresAt: null });
    const order = await buyOnce(userId);
    const granted = periodOf(userId);
    cancelResponse = { resultCode: '2001', resultMsg: '취소 기간이 지났습니다' };

    mockSessionValue = { user: { id: userId, email: 'a@test.com', isAdmin: true } };
    const res = await adminCancelRoute(adminCancelReq({ orderId: order.orderId }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('취소 기간이 지났습니다');
    expect(periodOf(userId)).toBe(granted);
    expect(orderOf(order.orderId).status).toBe('paid');
  });

  it('refuses to cancel an order that was never paid', async () => {
    const userId = seedUser(db, { googleId: 'g1', email: 'a@test.com' });
    mockSessionValue = { user: { id: userId, email: 'a@test.com' } };
    const order = await (await createOrderRoute(orderReq())).json();

    mockSessionValue = { user: { id: userId, email: 'a@test.com', isAdmin: true } };
    const res = await adminCancelRoute(adminCancelReq({ orderId: order.orderId }));

    expect(res.status).toBe(400);
    expect(cancelCalls).toEqual([]);
  });
});
