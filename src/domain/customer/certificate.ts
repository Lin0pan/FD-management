/**
 * Certificate expiry — whether a needs certificate still proves the household's need as of today.
 *
 * Expiry never blocks a hand-out; it starts a conversation at the counter (US-06). There is
 * deliberately no escalation rule or reminder threshold: DF reminds "about three times" as a habit,
 * but every case is a staff judgement, so the domain exposes the expiry and the count and no more.
 */

import type { NeedsCertificate } from "./customer";

/**
 * The instant of the UTC day a date falls on. Validity end and "today" are calendar days, not
 * moments, so expiry cannot depend on the time of day either value was recorded at.
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
 * `EXPIRING_SOON` narrows `VALID` rather than sitting beside it — the household may still shop — so
 * asking for `VALID` also returns the ones expiring soon.
 */
export type CertificateState = "VALID" | "EXPIRING_SOON" | "EXPIRED";

/**
 * How many days ahead a certificate counts as expiring soon — DF's habit, roughly the notice a
 * Jobcenter renewal needs. A constant rather than a setting only because nobody has asked to change
 * it (`tasks/prd-us-15-customer-list.md` §9 leaves that open).
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
 * A half-open range over `validUntil`: `from` included, `before` not.
 *
 * A state the *database* can be asked, where {@link certificateState} judges one row. Both come from
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

/** Where `certificate` stands on `today`. Expiry itself stays {@link isExpired}'s single answer. */
export function certificateState(certificate: NeedsCertificate, today: Date): CertificateState {
  if (isExpired(certificate, today)) {
    return "EXPIRED";
  }
  return certificate.validUntil.getTime() < certificateWindow(today).soonBefore.getTime()
    ? "EXPIRING_SOON"
    : "VALID";
}
