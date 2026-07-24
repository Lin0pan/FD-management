/**
 * Certificate expiry — whether a needs certificate still proves the household's need as of today.
 *
 * Expiry is the trigger for the reminder trail (US-06): an expired certificate never blocks a
 * hand-out, it starts a conversation at the counter. Deliberately absent is any escalation rule or
 * reminder threshold — FD reminds "about three times" as a habit, but every case is a staff
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
