/**
 * What the registration screen shows staff before they save: the number the household would get,
 * the group the balance suggests, and the day the household is judged against.
 *
 * It is a **proposal**, not a reservation. Nothing is held, and `registerCustomer` allocates again
 * when the form is submitted — the register may have moved on in the meantime, and the partial
 * unique index, not this reading, is the authority on a free slot
 * (tasks/prd-us-01-register-customer.md §7).
 */

import { findLowestFreeNumber } from "@/domain/customer/customerNumber";
import { suggestGroup, type Group, type GroupCounts } from "@/domain/customer/group";
import type { Clock, CustomerRepository, SettingsRepository } from "../ports";
import { readCurrentSettings } from "../settings/read-current-settings";

export interface ProposeRegistrationDeps {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
}

export interface RegistrationProposal {
  /** The lowest free slot, or `null` when the register is full — the form then says so up front. */
  readonly customerNumber: number | null;
  readonly suggestedGroup: Group;
  /** Both group sizes, so staff can see what they are overriding when they change the suggestion. */
  readonly groupCounts: GroupCounts;
  /** The quota in force, so a full register can name the limit FD would have to raise. */
  readonly quotaN: number;
  /** The day the form derives its household counts against — the same clock the save will read. */
  readonly today: Date;
}

/**
 * Read everything the empty registration form needs to fill itself in.
 *
 * A full register is reported as `customerNumber: null` rather than as a thrown error: the screen
 * has to render either way, and the rejection that matters is the one at save time.
 *
 * @throws {NoSettingsInForce} if the database was never seeded — a setup failure, not a reason to
 *   invent a quota.
 */
export async function proposeRegistration(
  deps: ProposeRegistrationDeps,
): Promise<RegistrationProposal> {
  const today = deps.clock.now();
  const settings = await readCurrentSettings({ settings: deps.settings, clock: deps.clock });
  const [takenNumbers, groupCounts] = await Promise.all([
    deps.customers.takenActiveNumbers(),
    deps.customers.groupCounts(),
  ]);

  return {
    customerNumber: findLowestFreeNumber(takenNumbers, settings.quotaN),
    suggestedGroup: suggestGroup(groupCounts),
    groupCounts,
    quotaN: settings.quotaN,
    today,
  };
}
