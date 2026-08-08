/**
 * Certificate expiry — whether a needs certificate still proves the household's need as of today.
 *
 * Expiry is the trigger for the reminder trail (US-06): an expired certificate never blocks a
 * hand-out, it starts a conversation at the counter. Deliberately absent is any escalation rule or
 * reminder threshold — DF reminds "about three times" as a habit, but every case is a staff
 * judgement, so the domain exposes only the expiry and the count and encodes no rule on top.
 *
 * The module is pure: `today` is a parameter, never `new Date()`, and there is no settings lookup.
 */

import type { NeedsCertificate } from "./customer";

/**
 * The instant of the UTC day a date falls on. A certificate's validity end and "today" are calendar
 * days, not moments: the Jobcenter notice names a day, and a distribution happens on a day.
 * Comparing the days keeps expiry from depending on the time of day either value was recorded.
 */
function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Whether `certificate` has expired as of `today`. A certificate is still valid **on** its
 * `validUntil` day — the printed end date is the last day it counts — and expired the day after.
 */
export function isExpired(certificate: NeedsCertificate, today: Date): boolean {
  return utcDay(certificate.validUntil) < utcDay(today);
}

/**
 * Where a certificate stands relative to today, as the customer list filters by it (US-15.1).
 *
 * `EXPIRING_SOON` is a *narrowing* of a certificate that is still valid, not a state beside it: the
 * household may shop today, and the label exists so staff can start the renewal conversation before
 * the counter has to. Asking for `VALID` therefore also returns the ones expiring soon — the two
 * questions staff actually have are "may they shop" and "which of them should bring a new notice".
 */
export type CertificateState = "VALID" | "EXPIRING_SOON" | "EXPIRED";

/**
 * How many days ahead a certificate counts as expiring soon.
 *
 * Thirty days is DF's habit rather than a rule anyone wrote down: it is roughly the notice a
 * Jobcenter renewal needs, and it puts the household on the list about two distributions before the
 * date. It is a constant and not a setting because nobody has yet asked to change it — see
 * tasks/prd-us-15-customer-list.md §9, which leaves making it configurable (US-14) open.
 */
export const EXPIRING_SOON_DAYS = 30;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** The two day boundaries every certificate state is decided against. */
interface CertificateWindow {
  /** Midnight UTC of today: a certificate ending before it has lapsed. */
  readonly from: Date;
  /** Midnight UTC of the day after the window's last day — the first day that is no longer "soon". */
  readonly soonBefore: Date;
}

function certificateWindow(today: Date): CertificateWindow {
  const from = utcDay(today);
  return {
    from: new Date(from),
    // One day past the last day inside the window, so the bound can be compared exclusively and a
    // certificate stored with a time of day still falls on the right side of it.
    soonBefore: new Date(from + (EXPIRING_SOON_DAYS + 1) * MILLISECONDS_PER_DAY),
  };
}

/**
 * A half-open range over `validUntil`: `from` is included, `before` is not.
 *
 * It exists so a state can be asked of the *database* — a stored `validUntil` compared against two
 * instants is a query, while {@link certificateState} is a comparison of one row. Both are built from
 * the same window, so the list's filter and the label on its rows cannot disagree.
 */
export interface ValidUntilRange {
  readonly from?: Date;
  readonly before?: Date;
}

/** The `validUntil` range a certificate must fall in to be in `state` on `today`. */
export function validUntilRangeFor(state: CertificateState, today: Date): ValidUntilRange {
  const { from, soonBefore } = certificateWindow(today);
  const ranges: Record<CertificateState, ValidUntilRange> = {
    EXPIRED: { before: from },
    VALID: { from },
    EXPIRING_SOON: { from, before: soonBefore },
  };
  return ranges[state];
}

/**
 * Where `certificate` stands on `today`. Expiry itself is {@link isExpired}'s answer — there is one
 * "valid through its last day" comparison in the system and this is not a second one.
 */
export function certificateState(certificate: NeedsCertificate, today: Date): CertificateState {
  if (isExpired(certificate, today)) {
    return "EXPIRED";
  }
  return certificate.validUntil.getTime() < certificateWindow(today).soonBefore.getTime()
    ? "EXPIRING_SOON"
    : "VALID";
}
