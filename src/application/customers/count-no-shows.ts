/**
 * How many of their own distributions a household has missed in a row — the seam both screens that
 * show the number read (tasks/prd-us-10-archive-customer.md §US-10.4).
 *
 * The rule itself is `consecutiveNoShows` in the domain; all this adds is the one decision the pure
 * module cannot make: *which* settings the count is read against. It is the version in force at the
 * instant asked about, because the schedule the misses are counted on — the distribution weekday and
 * the week-colour anchor — is policy DF can change (US-14).
 *
 * The records are passed in rather than loaded here: the counter already holds the customer's
 * hand-outs from its single pass over the register (US-04.3), and fetching them a second time would
 * put a query on the busiest screen in the product for a number it already has the raw material for.
 */

import type { RegisteredCustomer } from "@/domain/customer/customer";
import { groupOf } from "@/domain/customer/group";
import type { AttendanceRecord } from "@/domain/distribution/attendance";
import { consecutiveNoShows } from "@/domain/distribution/noShows";
import { resolveSettingsAt } from "@/domain/policy/settings";
import type { SettingsRepository } from "../ports";

export interface CountNoShowsDeps {
  readonly settings: SettingsRepository;
}

/**
 * The customer's consecutive own-day no-shows as of `today`.
 *
 * `0` means "came last time" as well as "has not seen a distribution yet" — the two are the same as
 * far as archiving goes, and neither is anything a screen needs to show.
 *
 * @throws {NoSettingsInForce} if no settings version had taken effect by `today`.
 * @throws {InvalidSettings} if the week anchor does not name a week of the ISO calendar.
 */
export async function countNoShows(
  deps: CountNoShowsDeps,
  customer: RegisteredCustomer,
  records: ReadonlyArray<AttendanceRecord>,
  today: Date,
): Promise<number> {
  return consecutiveNoShows({
    records,
    customerGroup: groupOf(customer.customerNumber),
    registeredOn: customer.registeredOn,
    settings: resolveSettingsAt(await deps.settings.listVersions(), today),
    today,
  });
}
