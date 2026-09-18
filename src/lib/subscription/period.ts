// The subscription period is one account-level date that always lands on 12/31.
// Both the renewal endpoint and the dashboard derive from the rules here, so the
// button label, the banner and the row the server writes cannot disagree.

export function endOfYear(year: number): string {
  return `${year}-12-31T23:59:59.000Z`;
}

// One purchase buys exactly one calendar year, stacked on top of whatever is
// already covered: the year after the current period while it still runs, the
// current year once it has lapsed or was never set. Handing a lapsed account
// year + 1 would give it two years for one payment.
//
// Stacking matters now that the year is bought rather than clicked. Returning
// currentYear + 1 for an account already paid through next year would take the
// money and move nothing. Double-submits are held off by the order ledger
// instead — settleOrder only grants while the order is still pending.
//
// Compared by calendar year off the ISO prefix, not as an instant. Between 00:00
// and 08:59 KST on Jan 1 a 12/31 23:59:59 UTC period has not technically passed
// yet, and an instant comparison would call it covered and hand out two years.
export function renewalTargetYear(now: Date, expiresAt: string | null): number {
  const currentYear = now.getFullYear();
  const coveredThrough = expiresAt ? Number(expiresAt.slice(0, 4)) : null;
  if (coveredThrough !== null && coveredThrough >= currentYear) return coveredThrough + 1;
  return currentYear;
}

export interface RenewalPrompt {
  show: boolean;
  isExpired: boolean;
  // The year a click would renew through — the same value the server will write.
  targetYear: number;
}

// December is the reminder window, so the prompt goes up then as well as after an
// actual lapse — but not once the period already runs past this year, or it would
// keep offering a 12/31 expiry that has already moved.
//
// Alert settings do not gate the prompt: the renewal is about the seat, and an
// account that switched every category off still has a seat that is lapsing.
export function renewalPrompt(now: Date, expiresAt: string | null): RenewalPrompt {
  const isExpired = !!expiresAt && new Date(expiresAt) < now;
  const isDecember = now.getMonth() === 11;
  // Compared on the ISO prefix rather than through Date: a 12/31 23:59:59 UTC
  // expiry parses as the following year in KST, which would read as renewed a
  // year early and suppress the prompt for everyone in December.
  const renewedAhead = !!expiresAt && Number(expiresAt.slice(0, 4)) > now.getFullYear();

  return {
    show: isExpired || (isDecember && !renewedAhead),
    isExpired,
    targetYear: renewalTargetYear(now, expiresAt),
  };
}

// Whether there is anything to buy right now. Open when nothing covers the
// current year — no period, or a lapsed one — and during December for a period
// that ends this year, the same window the reminder uses. Closed once the period
// already runs into next year. Gating it here, shared by the dashboard button and
// the order route, is what keeps an account paid through this year from buying
// next year in September: renewal is a December affair, not a standing offer.
export function canPurchase(now: Date, expiresAt: string | null): boolean {
  const currentYear = now.getFullYear();
  const coveredThrough = expiresAt ? Number(expiresAt.slice(0, 4)) : null;
  if (coveredThrough === null || coveredThrough < currentYear) return true;
  return coveredThrough === currentYear && now.getMonth() === 11;
}
