/**
 * How many of their own distributions a household has missed in a row — the seam both screens that
 * show the number read (`tasks/prd-us-10-archive-customer.md` §US-10.4).
 *
 * The rule is `consecutiveNoShows`; all this adds is the household's own half of its input — the
 * group their number puts them in, and the afternoons they collected at. Both the sessions and the
 * records are passed in rather than loaded, because the two callers already hold them (US-04.3).
 */

import type { RegisteredCustomer } from "@/domain/customer/customer";
import { groupOf } from "@/domain/customer/group";
import { consecutiveNoShows } from "@/domain/distribution/noShows";
import type { DistributionSession } from "@/domain/distribution/session";

/** The one field of a hand-out this count reads: which afternoon it was recorded at. */
export interface AttendedSession {
  readonly sessionId: number;
}

/**
 * The customer's consecutive missed sessions. `0` means "came last time" as well as "has not seen a
 * session yet" — the same thing as far as archiving goes.
 */
export function countNoShows(
  customer: RegisteredCustomer,
  endedSessions: ReadonlyArray<DistributionSession>,
  records: ReadonlyArray<AttendedSession>,
): number {
  return consecutiveNoShows({
    sessions: endedSessions,
    attendedSessionIds: records.map((record) => record.sessionId),
    customerGroup: groupOf(customer.customerNumber),
    registeredOn: customer.registeredOn,
  });
}
