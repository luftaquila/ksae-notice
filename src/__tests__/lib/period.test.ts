import { describe, it, expect } from 'vitest';
import { endOfYear, renewalTargetYear, renewalPrompt } from '@/lib/subscription/period';

// TZ is pinned to Asia/Seoul in vitest.config.ts — these cases are about the
// disagreement between a 12/31 23:59:59 UTC period and the KST calendar.
const kst = (iso: string) => new Date(iso);

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

  it('is idempotent — renewing again in the same window does not stack', () => {
    expect(renewalTargetYear(kst('2026-12-20T12:00:00+09:00'), endOfYear(2027))).toBe(2027);
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
      expect(renewalPrompt(kst(now), expiresAt, true).show).toBe(show);
    });
  }

  it('never prompts an account with no active category', () => {
    for (const [, now, expiresAt] of cases) {
      expect(renewalPrompt(kst(now), expiresAt, false).show).toBe(false);
    }
  });

  // The reason the prefix comparison is load-bearing: through Date, a 2027-12-31
  // 23:59:59 UTC period reads as year 2028 in KST, so a renewed account would
  // look renewed-ahead a year early and the December prompt would vanish for
  // everyone rather than only for those who already renewed.
  it('keeps the December prompt up for a period ending this year', () => {
    const now = kst('2026-12-15T12:00:00+09:00');
    expect(new Date(endOfYear(2026)).getFullYear()).toBe(2027); // the trap itself
    expect(renewalPrompt(now, endOfYear(2026), true).show).toBe(true);
  });

  it('reports the year the server would write', () => {
    for (const [, now, expiresAt] of cases) {
      const at = kst(now);
      expect(renewalPrompt(at, expiresAt, true).targetYear).toBe(renewalTargetYear(at, expiresAt));
    }
  });

  it('marks a lapsed period expired and a covered one not', () => {
    expect(renewalPrompt(kst('2027-03-01T12:00:00+09:00'), endOfYear(2026), true).isExpired).toBe(true);
    expect(renewalPrompt(kst('2026-12-15T12:00:00+09:00'), endOfYear(2026), true).isExpired).toBe(false);
  });
});
