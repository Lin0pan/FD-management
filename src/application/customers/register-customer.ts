/**
 * Register an applicant: a free number in the group that balances the two weeks, and their first
 * card, in one transaction. The card is not a separate action staff can forget
 * (`tasks/prd-us-01-register-customer.md` §7).
 *
 * The **only** registration path, which is what makes re-registering a returning household (US-11.3)
 * a matter of where the form's values came from rather than of different code.
 */

import { nextCardIndex } from "@/domain/card/cardNumber";
import { CustomerNumberTaken } from "@/domain/errors";
import {
  createCustomerDetails,
  type CustomerDetailsInput,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import { assertFreeNumber, freeNumbers, lowestFreeNumber } from "@/domain/customer/customerNumber";
import { countByGroup, inGroup, suggestGroup, type Group } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import type {
  AuditLog,
  CardRepository,
  Clock,
  CustomerRepository,
  SettingsRepository,
} from "../ports";
import { readCurrentSettings } from "../settings/read-current-settings";

/** The audit event name every registration is recorded under. */
const CUSTOMER_REGISTERED = "customer.registered";

/**
 * What the audit entry names as changed: what the *system* decided, not what staff typed — listing
 * every typed field would only repeat the record.
 *
 * `group` names a *decision*, not a column (ADR-017). It stays on the list so a reader of the log a
 * year later need not know the parity rule to see which week the household joined.
 */
const REGISTERED_FIELDS = ["customerNumber", "group", "status", "card"] as const;

/**
 * Named alongside them when the registration was pre-filled from an archived record (US-11.3) —
 * without it the two rows look like a duplicate somebody failed to notice.
 */
const RE_REGISTERED_FIELD = "previousCustomerId";

/**
 * How often a lost race for a customer number is retried. A retry re-reads the taken numbers and
 * moves to the next free one **of the same group**, so the second registration succeeds instead of
 * showing an error staff can only answer by pressing the button again.
 *
 * The bound matters more than its size: an unbounded loop would turn a repository fault into a hang.
 */
const MAX_ATTEMPTS = 3;

/**
 * How often a number **staff chose** is attempted: once. The retry above is only defensible because
 * the number is the rule's to pick; retrying a chosen one would either write a number nobody picked
 * or fail again on the same one, so the refusal goes back to the screen (US-24.3).
 */
const CHOSEN_NUMBER_ATTEMPTS = 1;

/**
 * The slot an allocation takes: the lowest free number **of `group`**, so the household lands in the
 * week the balance chose — picking the lowest of the register as a whole would decide the week by
 * accident (ADR-017).
 *
 * Falls back to the whole pool when the group has nothing to offer. A `null` group means the register
 * is full, and {@link lowestFreeNumber} raises `NoFreeCustomerNumber`; a *named* empty group is only
 * reachable on a retry, and there the other group's lowest slot is right — the balance is a
 * recommendation, not a quota, and turning an applicant away while a slot stands empty is what the
 * waiting list exists to prevent (US-12, FR-3).
 */
function allocateInGroup(
  group: Group | null,
  takenNumbers: ReadonlyArray<number>,
  quotaN: number,
): number {
  const offer = group === null ? [] : inGroup(freeNumbers(takenNumbers, quotaN), group);

  return offer.length === 0 ? lowestFreeNumber(takenNumbers, quotaN) : offer[0];
}

export interface RegisterCustomerDeps {
  readonly customers: CustomerRepository;
  /**
   * Read only, for one question: the highest index ever printed on the slot (US-25). The card itself
   * is written with the customer, in the register's one transaction.
   */
  readonly cards: CardRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
}

export interface RegisterCustomerInput extends CustomerDetailsInput {
  /**
   * The slot staff chose (US-24), left out when nobody looked at the dropdown — then the lowest free
   * number of the recommended group is allocated.
   *
   * **There is deliberately no group beside it**: a group follows from the number (ADR-017), so a
   * group that cannot be submitted cannot be submitted wrongly. Given, the number is used **as
   * given** — checked and refused if taken, never quietly replaced.
   */
  readonly customerNumber?: number;
  /**
   * The archived record this form was pre-filled from (US-11.3), left out for a walk-in.
   *
   * It changes **nothing** about the registration and is branched on nowhere — a re-registration
   * taking a different path would be the merge US-11 rules out
   * (`tasks/prd-us-11-reuse-archived-record.md` §FR-5). It is also why the card index is read from
   * the slot rather than set to 1: a household handed their old number back would otherwise be
   * printed a second copy of the card in their kitchen drawer (US-25).
   */
  readonly previousCustomerId?: number;
}

/**
 * Register a customer and hand back the persisted record, card and all.
 *
 * @throws {MissingRequiredField} for a name, address part or certificate type left blank.
 * @throws {EmptyHousehold} if the household has no members.
 * @throws {BirthDateInFuture} if the customer or a member was born after today.
 * @throws {NoFreeCustomerNumber} if every slot up to the quota is taken.
 * @throws {CustomerNumberTaken} if the slot staff chose is held, or if a concurrent registration
 *   kept winning the allocated one.
 * @throws {CustomerNumberOutOfRange} if the slot staff chose is not a whole number within the quota
 *   in force — a form that was open while the quota was lowered (US-14) can produce one.
 * @throws {CardNumberTaken} if the card number this registration was about to print was issued
 *   between the read of the slot's run and the write. It is **not** retried: the retry below moves
 *   to another slot, and this slot is already won — what went stale is the run on it, which the
 *   screen has to re-read (US-25).
 */
export async function registerCustomer(
  deps: RegisterCustomerDeps,
  input: RegisterCustomerInput,
): Promise<RegisteredCustomer> {
  // One read of the clock for the whole registration, so the card's issue date, the audit instant
  // and the day the household is judged on all agree.
  const now = deps.clock.now();
  const details = createCustomerDetails(input, now);
  const settings = await readCurrentSettings({ settings: deps.settings, clock: deps.clock });
  // The counts printed on the card — the same snapshot `issueCard` takes, because a first card and a
  // replacement are the same object (US-13.3). The record itself still carries no count.
  const countsAtIssue = composition(details.householdMembers, now);
  // Absent is stored as null rather than left off, so the record always states whether these people
  // are known to DF.
  const previousCustomerId = input.previousCustomerId ?? null;
  const changedFields =
    previousCustomerId === null
      ? [...REGISTERED_FIELDS]
      : [...REGISTERED_FIELDS, RE_REGISTERED_FIELD];

  // One code path either way: chosen and allocated differ only in where the number comes from and in
  // how many attempts they are worth.
  const chosen = input.customerNumber;
  let attemptsLeft = chosen === undefined ? MAX_ATTEMPTS : CHOSEN_NUMBER_ATTEMPTS;
  // Decided from the **first** reading of the register and held across every retry. A retry that
  // re-decided it would cross to the other group the moment the lost number levelled the balance, and
  // the household would join a different week with nothing on screen saying so — the one bug this
  // loop could grow. A chosen number leaves it `null`: that path decides no group.
  let allocatedGroup: Group | null = null;
  for (;;) {
    attemptsLeft -= 1;
    const takenNumbers = await deps.customers.takenActiveNumbers();
    if (chosen === undefined) {
      // Counted off the numbers the register holds rather than asked of it: a group is not a
      // column, it is what a number is (ADR-017).
      allocatedGroup ??= suggestGroup(
        freeNumbers(takenNumbers, settings.quotaN),
        countByGroup(takenNumbers),
      );
    }
    const customerNumber =
      chosen === undefined
        ? allocateInGroup(allocatedGroup, takenNumbers, settings.quotaN)
        : assertFreeNumber(chosen, takenNumbers, settings.quotaN);
    // Read after the number is settled and inside the loop, because the run belongs to the *slot*:
    // an allocated number can move on a retry, and an index read earlier would print the previous
    // slot's next card under the new slot's number.
    const index = nextCardIndex(await deps.cards.highestIndexForNumber(customerNumber));

    try {
      const customer = await deps.customers.create({
        details,
        customerNumber,
        status: "ACTIVE",
        reminderCount: 0,
        card: {
          index,
          issuedAt: now,
          reason: "FIRST_ISSUE",
          countsAtIssue,
        },
        previousCustomerId,
      });
      await deps.audit.append({
        what: CUSTOMER_REGISTERED,
        changedFields,
        when: now,
        why: "",
      });
      return customer;
    } catch (error: unknown) {
      // Only a lost race *for the number* is worth a second go. Anything else would fail the same
      // way however often it was repeated — or, for `CardNumberTaken`, would answer a stale read of
      // one slot by moving the household to another.
      if (attemptsLeft === 0 || !(error instanceof CustomerNumberTaken)) {
        throw error;
      }
    }
  }
}
