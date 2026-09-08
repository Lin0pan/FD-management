/**
 * How many of their own distributions a household has missed in a row — the seam both screens that
 * show the number read (`tasks/prd-us-10-archive-customer.md` §US-10.4).
 *
 * The rule is `consecutiveNoShows`; all this adds is the decision the pure module cannot make —
 * *which* settings to read against, namely the version in force at the instant asked about, since the
 * schedule the misses are counted on is policy DF can change (US-14).
 *
 * The records are passed in rather than loaded, because the counter already holds them (US-04.3).
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
 * The customer's consecutive own-day no-shows as of `today`. `0` means "came last time" as well as
 * "has not seen a distribution yet" — the same thing as far as archiving goes.
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
