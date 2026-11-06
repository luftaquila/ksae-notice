import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RENEWAL_OPEN_MONTH,
  canPurchase,
  endOfYear,
  parseRenewalOpenMonth,
  renewalTargetYear,
  renewalPrompt,
} from '@/lib/subscription/period';

// TZ is pinned to Asia/Seoul in vitest.config.ts — these cases are about the
// disagreement between a 12/31 23:59:59 UTC period and the KST calendar.
const kst = (iso: string) => new Date(iso);

// 기본 갱신 창은 12월 한 달이다. 아래 기존 케이스는 그 기준이다.
const DEC = DEFAULT_RENEWAL_OPEN_MONTH;

describe('renewalTargetYear', () => {
  it('buys next year while the period still covers this one', () => {
    expect(renewalTargetYear(kst('2026-12-15T12:00:00+09:00'), endOfYear(2026))).toBe(2027);
  });

  it('buys this year once the period has lapsed', () => {
    expect(renewalTargetYear(kst('2027-03-01T12:00:00+09:00'), endOfYear(2026))).toBe(2027);
  });

  it('buys this year for an account with no period at all', () => {
    expect(renewalTargetYear(kst('2027-03-01T12:00:00+09:00'), null)).toBe(2027);
  });

  // Paying twice must buy two years. Guarding a double-submit is the order
  // ledger's job, not this function's — clamping here would swallow a payment.
  it('stacks another year onto a period already paid ahead', () => {
    expect(renewalTargetYear(kst('2026-12-20T12:00:00+09:00'), endOfYear(2027))).toBe(2028);
  });

  // 2026-12-31T23:59:59Z is 2027-01-01 08:59 KST, so between midnight and 08:59
  // KST the period has not passed as an instant while the calendar has turned.
  it('does not hand out two years in the KST new-year gap', () => {
    expect(renewalTargetYear(kst('2027-01-01T03:00:00+09:00'), endOfYear(2026))).toBe(2027);
  });
});

describe('renewalPrompt', () => {
  const cases: [string, string, string | null, boolean][] = [
    ['December, not yet renewed', '2026-12-15T12:00:00+09:00', endOfYear(2026), true],
    ['December, already renewed', '2026-12-15T12:00:00+09:00', endOfYear(2027), false],
    ['last hour of December', '2026-12-31T23:00:00+09:00', endOfYear(2026), true],
    ['KST new-year gap, period not yet passed', '2027-01-01T03:00:00+09:00', endOfYear(2026), false],
    ['January, lapsed', '2027-01-01T10:00:00+09:00', endOfYear(2026), true],
    ['midyear, covered', '2027-06-01T12:00:00+09:00', endOfYear(2027), false],
    ['March, lapsed', '2027-03-01T12:00:00+09:00', endOfYear(2026), true],
    ['December, no period', '2026-12-15T12:00:00+09:00', null, true],
  ];

  for (const [name, now, expiresAt, show] of cases) {
    it(`${show ? 'prompts' : 'stays quiet'}: ${name}`, () => {
      expect(renewalPrompt(kst(now), expiresAt, DEC).show).toBe(show);
    });
  }

  // The reason the prefix comparison is load-bearing: through Date, a 2027-12-31
  // 23:59:59 UTC period reads as year 2028 in KST, so a renewed account would
  // look renewed-ahead a year early and the December prompt would vanish for
  // everyone rather than only for those who already renewed.
  it('keeps the December prompt up for a period ending this year', () => {
    const now = kst('2026-12-15T12:00:00+09:00');
    expect(new Date(endOfYear(2026)).getFullYear()).toBe(2027); // the trap itself
    expect(renewalPrompt(now, endOfYear(2026), DEC).show).toBe(true);
  });

  it('reports the year the server would write', () => {
    for (const [, now, expiresAt] of cases) {
      const at = kst(now);
      expect(renewalPrompt(at, expiresAt, DEC).targetYear).toBe(renewalTargetYear(at, expiresAt));
    }
  });

  it('marks a lapsed period expired and a covered one not', () => {
    expect(renewalPrompt(kst('2027-03-01T12:00:00+09:00'), endOfYear(2026), DEC).isExpired).toBe(true);
    expect(renewalPrompt(kst('2026-12-15T12:00:00+09:00'), endOfYear(2026), DEC).isExpired).toBe(false);
  });
});

describe('canPurchase', () => {
  const cases: [string, string, string | null, boolean][] = [
    ['no period', '2026-09-08T12:00:00+09:00', null, true],
    ['lapsed, March', '2027-03-01T12:00:00+09:00', endOfYear(2026), true],
    ['lapsed, KST new-year gap', '2027-01-01T03:00:00+09:00', endOfYear(2026), true],
    ['ends this year, September', '2026-09-08T12:00:00+09:00', endOfYear(2026), false],
    ['ends this year, November 30', '2026-11-30T23:00:00+09:00', endOfYear(2026), false],
    ['ends this year, December 1', '2026-12-01T00:00:00+09:00', endOfYear(2026), true],
    ['ends this year, last hour of December', '2026-12-31T23:00:00+09:00', endOfYear(2026), true],
    ['paid through next year, December', '2026-12-15T12:00:00+09:00', endOfYear(2027), false],
    ['paid through next year, midyear', '2026-06-01T12:00:00+09:00', endOfYear(2027), false],
  ];

  for (const [name, now, expiresAt, open] of cases) {
    it(`${open ? 'open' : 'closed'}: ${name}`, () => {
      expect(canPurchase(kst(now), expiresAt, DEC)).toBe(open);
    });
  }

  // The banner tells the reader to press the button; the button must be there.
  it('is open whenever the renewal prompt is up', () => {
    for (const [, now, expiresAt] of cases) {
      const at = kst(now);
      if (renewalPrompt(at, expiresAt, DEC).show) expect(canPurchase(at, expiresAt, DEC)).toBe(true);
    }
  });
});

// 갱신 창을 앞당긴 경우 (관리자 설정 renewalOpenMonth). 그 달 1일부터 12월 말까지가 창이다.
describe('renewal window opened earlier', () => {
  const NOV = 11;

  const cases: [string, string, string | null, boolean][] = [
    ['ends this year, October 31', '2026-10-31T23:00:00+09:00', endOfYear(2026), false],
    ['ends this year, November 1', '2026-11-01T00:00:00+09:00', endOfYear(2026), true],
    ['ends this year, November 6', '2026-11-06T12:00:00+09:00', endOfYear(2026), true],
    ['ends this year, December', '2026-12-15T12:00:00+09:00', endOfYear(2026), true],
    ['paid through next year, November', '2026-11-06T12:00:00+09:00', endOfYear(2027), false],
    ['KST new-year gap, period not yet passed', '2027-01-01T03:00:00+09:00', endOfYear(2026), true],
  ];

  for (const [name, now, expiresAt, open] of cases) {
    it(`${open ? 'open' : 'closed'}: ${name}`, () => {
      expect(canPurchase(kst(now), expiresAt, NOV)).toBe(open);
    });
  }

  it('sells next year, not this one, inside the window', () => {
    expect(renewalTargetYear(kst('2026-11-06T12:00:00+09:00'), endOfYear(2026))).toBe(2027);
  });

  it('puts the prompt up exactly when the button opens for a period ending this year', () => {
    for (const [, now, expiresAt] of cases) {
      const at = kst(now);
      if (expiresAt === endOfYear(2026) && at.getFullYear() === 2026) {
        expect(renewalPrompt(at, expiresAt, NOV).show).toBe(canPurchase(at, expiresAt, NOV));
      }
    }
  });

  it('opens all year when set to January', () => {
    expect(canPurchase(kst('2026-03-01T12:00:00+09:00'), endOfYear(2026), 1)).toBe(true);
  });
});

describe('parseRenewalOpenMonth', () => {
  it('reads a month between 1 and 12', () => {
    expect(parseRenewalOpenMonth('11')).toBe(11);
    expect(parseRenewalOpenMonth('1')).toBe(1);
    expect(parseRenewalOpenMonth('12')).toBe(12);
  });

  it('falls back to December for a missing or out-of-range value', () => {
    for (const bad of [null, undefined, '', '0', '13', '-1', '10.5', 'november']) {
      expect(parseRenewalOpenMonth(bad)).toBe(DEFAULT_RENEWAL_OPEN_MONTH);
    }
  });
});
