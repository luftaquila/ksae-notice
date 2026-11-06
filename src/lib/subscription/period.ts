// The subscription period is one account-level date that always lands on 12/31.
// Both the renewal endpoint and the dashboard derive from the rules here, so the
// button label, the banner and the row the server writes cannot disagree.

export function endOfYear(year: number): string {
  return `${year}-12-31T23:59:59.000Z`;
}

// 내년 구독(올해로 끝나는 기간의 갱신)을 파는 첫 달. 그 달 1일부터 12월 31일까지가
// 갱신 창이다. 관리자 설정(`renewalOpenMonth`)이 정하고, 없거나 범위 밖이면 12월이다.
//
// 1월은 받지 않는다. 창이 한 해 전체가 되면 새해 첫날에도 "내년"을 팔아서, 12/31 에 만든
// 갱신 주문이 1/1 에 정산될 때 두 해 뒤까지 나가고 1월 신규 가입자는 두 해 가까이 받는다.
export const DEFAULT_RENEWAL_OPEN_MONTH = 12;
export const MIN_RENEWAL_OPEN_MONTH = 2;

export function parseRenewalOpenMonth(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= MIN_RENEWAL_OPEN_MONTH && parsed <= 12
    ? parsed
    : DEFAULT_RENEWAL_OPEN_MONTH;
}

function inRenewalWindow(now: Date, openMonth: number): boolean {
  return now.getMonth() + 1 >= openMonth;
}

// One purchase buys exactly one calendar year, stacked on top of whatever is
// already covered: the year after the current period while it still runs, the
// current year once it has lapsed or was never set. Handing a lapsed account
// year + 1 outside the renewal window would give it two years for one payment.
//
// Inside the renewal window (openMonth through December) what is on sale is next
// year, for everyone: an account with no period, or a lapsed one, buys the same
// year a running subscriber renews into. Otherwise someone subscribing in
// November would get two months and have to buy again for next year. The rest of
// this year comes along with it — the period is a single expiry date, so there is
// no start date to hold it back.
//
// Stacking matters now that the year is bought rather than clicked. Returning
// currentYear + 1 for an account already paid through next year would take the
// money and move nothing. Double-submits are held off by the order ledger
// instead — settleOrder only grants while the order is still pending.
//
// Compared by calendar year off the ISO prefix, not as an instant. Between 00:00
// and 08:59 KST on Jan 1 a 12/31 23:59:59 UTC period has not technically passed
// yet, and an instant comparison would call it covered and hand out two years.
export function renewalTargetYear(now: Date, expiresAt: string | null, openMonth: number): number {
  const currentYear = now.getFullYear();
  const coveredThrough = expiresAt ? Number(expiresAt.slice(0, 4)) : null;
  if (coveredThrough !== null && coveredThrough >= currentYear) return coveredThrough + 1;
  return inRenewalWindow(now, openMonth) ? currentYear + 1 : currentYear;
}

export interface RenewalPrompt {
  show: boolean;
  isExpired: boolean;
  // The year a click would renew through — the same value the server will write.
  targetYear: number;
}

// The renewal window (openMonth through December) is when the prompt goes up, as
// well as after an actual lapse — but not once the period already runs past this
// year, or it would keep offering a 12/31 expiry that has already moved.
//
// Alert settings do not gate the prompt: the renewal is about the seat, and an
// account that switched every category off still has a seat that is lapsing.
export function renewalPrompt(now: Date, expiresAt: string | null, openMonth: number): RenewalPrompt {
  const isExpired = !!expiresAt && new Date(expiresAt) < now;
  // Compared on the ISO prefix rather than through Date: a 12/31 23:59:59 UTC
  // expiry parses as the following year in KST, which would read as renewed a
  // year early and suppress the prompt for everyone in December.
  const renewedAhead = !!expiresAt && Number(expiresAt.slice(0, 4)) > now.getFullYear();

  return {
    show: isExpired || (inRenewalWindow(now, openMonth) && !renewedAhead),
    isExpired,
    targetYear: renewalTargetYear(now, expiresAt, openMonth),
  };
}

// Whether there is anything to buy right now. Open when nothing covers the
// current year — no period, or a lapsed one — and inside the renewal window
// (openMonth through December) for a period that ends this year. Closed once the
// period already runs into next year. Gating it here, shared by the dashboard
// button and the order route, is what keeps an account paid through this year
// from buying next year before the window opens: renewal is a seasonal affair,
// not a standing offer.
export function canPurchase(now: Date, expiresAt: string | null, openMonth: number): boolean {
  const currentYear = now.getFullYear();
  const coveredThrough = expiresAt ? Number(expiresAt.slice(0, 4)) : null;
  if (coveredThrough === null || coveredThrough < currentYear) return true;
  return coveredThrough === currentYear && inRenewalWindow(now, openMonth);
}
