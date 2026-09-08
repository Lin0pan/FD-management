/**
 * What the registration screen shows before staff save: the numbers on offer and the one it opens on,
 * the group the balance suggests, and the day the household is judged against.
 *
 * A **proposal**, not a reservation — `registerCustomer` allocates again on submit, and the partial
 * unique index is the authority on a free slot (`tasks/prd-us-01-register-customer.md` §7).
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
   * The lowest free slot **of the recommended group**, or `null` when the register is full.
   *
   * One of {@link freeNumbers}, from the same reading, so the dropdown's opening value cannot
   * disagree with what it offers — but not necessarily the *first* of them: the number decides the
   * group (ADR-017), so this is the slot that puts the household in the recommended week.
   */
  readonly customerNumber: number | null;
  /**
   * Every free slot in `1..quotaN`, ascending (US-24). The **whole** pool, both groups': the form
   * re-filters it in the browser when staff pick the other group, and a round trip to change a radio
   * would fetch a list the screen is already holding.
   */
  readonly freeNumbers: ReadonlyArray<number>;
  /**
   * The group the balance recommends, `null` **exactly** when {@link customerNumber} is — a group with
   * no free number is not a recommendation.
   */
  readonly suggestedGroup: Group | null;
  /** Both group sizes, so staff see what they are overriding. Counted off the numbers held. */
  readonly groupCounts: GroupCounts;
  /** The quota in force, so a full register can name the limit DF would have to raise. */
  readonly quotaN: number;
  /** The day the form derives its household counts against — the same clock the save will read. */
  readonly today: Date;
}

/**
 * Read everything the empty registration form needs to fill itself in. A full register is
 * `customerNumber: null` rather than a thrown error — the screen has to render either way.
 *
 * @throws {NoSettingsInForce} if the database was never seeded.
 */
export async function proposeRegistration(
  deps: ProposeRegistrationDeps,
): Promise<RegistrationProposal> {
  const today = deps.clock.now();
  const settings = await readCurrentSettings({ settings: deps.settings, clock: deps.clock });
  // **One** reading, and the pool, the balance and the opening number all derived from it. A second
  // query would be a second instant, and the three could then disagree.
  const takenNumbers = await deps.customers.takenActiveNumbers();
  const free = freeNumbers(takenNumbers, settings.quotaN);
  const groupCounts = countByGroup(takenNumbers);
  const suggestedGroup = suggestGroup(free, groupCounts);

  return {
    // `suggestGroup` never names an empty group, so this is non-empty wherever there is a
    // recommendation at all — and absent with it.
    customerNumber: suggestedGroup === null ? null : inGroup(free, suggestedGroup)[0],
    freeNumbers: free,
    suggestedGroup,
    groupCounts,
    quotaN: settings.quotaN,
    today,
  };
}
