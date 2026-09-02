/**
 * What the registration screen shows staff before they save: the numbers the household could be
 * given and the one it opens on, the group the balance suggests, and the day the household is
 * judged against.
 *
 * It is a **proposal**, not a reservation. Nothing is held, and `registerCustomer` allocates again
 * when the form is submitted — the register may have moved on in the meantime, and the partial
 * unique index, not this reading, is the authority on a free slot
 * (tasks/prd-us-01-register-customer.md §7).
 */

import { freeNumbers } from "@/domain/customer/customerNumber";
import {
  countByGroup,
  inGroup,
  suggestGroup,
  type Group,
  type GroupCounts,
} from "@/domain/customer/group";
import type { Clock, CustomerRepository, SettingsRepository } from "../ports";
import { readCurrentSettings } from "../settings/read-current-settings";

export interface ProposeRegistrationDeps {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
}

export interface RegistrationProposal {
  /**
   * The lowest free slot **of the recommended group**, or `null` when the register is full — the
   * form then says so up front.
   *
   * It is one of {@link freeNumbers}, and the two are computed from one reading of the register, so
   * the number the dropdown opens on cannot disagree with the numbers it offers. It is not
   * necessarily the *first* of them: the number decides the group (US-31), so the number the form
   * opens on is the one that puts the household in the week the balance recommends. Most callers
   * only ask "is a slot free, and which"; the registration form is the one that needs the whole
   * pool.
   */
  readonly customerNumber: number | null;
  /**
   * Every free slot in `1..quotaN`, ascending — the numbers the registration form may offer staff
   * to choose from (US-24), empty when the register is full.
   *
   * The **whole** pool, both groups', and not only the recommended group's: the form re-filters it
   * in the browser when staff pick the other group, and a round trip to change a radio would be a
   * round trip to look at a list the screen is already holding.
   */
  readonly freeNumbers: ReadonlyArray<number>;
  /**
   * The group the balance recommends, or `null` when the register is full — which is **exactly**
   * when {@link customerNumber} is `null`. A group with no free number is not a recommendation, and
   * two fields that can only be absent together must be absent together.
   */
  readonly suggestedGroup: Group | null;
  /**
   * Both group sizes, so staff can see what they are overriding when they change the suggestion.
   * Counted off the numbers the register holds, never asked of it as a figure of its own.
   */
  readonly groupCounts: GroupCounts;
  /** The quota in force, so a full register can name the limit DF would have to raise. */
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
  // **One** reading of the register, and everything below derived from it: the pool the form
  // offers, the balance the recommendation is decided from, and the number the form opens on. A
  // second query would be a second instant, and the three could then disagree — which is the whole
  // reason the group is no longer a column to be asked for separately (US-31).
  const takenNumbers = await deps.customers.takenActiveNumbers();
  const free = freeNumbers(takenNumbers, settings.quotaN);
  const groupCounts = countByGroup(takenNumbers);
  const suggestedGroup = suggestGroup(free, groupCounts);

  return {
    // `suggestGroup` never names a group that has nothing to offer, so the recommendation's own
    // numbers are non-empty wherever there is a recommendation at all — and absent with it.
    customerNumber: suggestedGroup === null ? null : inGroup(free, suggestedGroup)[0],
    freeNumbers: free,
    suggestedGroup,
    groupCounts,
    quotaN: settings.quotaN,
    today,
  };
}
