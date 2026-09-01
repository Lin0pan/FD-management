/**
 * Register an applicant as a customer: give them a free number in the group that balances the two
 * weeks, and their first card, in one transaction.
 *
 * This is the whole of what "registration" means in the system — the card is not a separate action
 * staff can forget (tasks/prd-us-01-register-customer.md §7). Everything the form does not ask for
 * is decided here rather than typed: the number — and with it the week the household collects in,
 * because the number *is* the group (`groupOf`, US-31) — the status and the reminder count. Nothing
 * derivable is stored, so no household count and no group is written anywhere.
 *
 * It is also the **only** registration path, which is what makes re-registering a returning
 * household (US-11.3) a matter of where the form's values came from rather than of different code:
 * a draft built from an archived record is registered through here like anything staff typed, and
 * comes out a new customer with a new number and the next card on that number's run.
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
 * What the audit entry names as changed.
 *
 * A registration creates the whole record, so listing every typed field would only repeat the record
 * itself. What is worth recording is what the *system* decided on its own: which slot the household
 * took, which half of the cycle they were put in, that they came in active, and that a card was
 * issued with them.
 */
const REGISTERED_FIELDS = ["customerNumber", "group", "status", "card"] as const;

/**
 * Named alongside them when the registration was pre-filled from an archived record (US-11.3).
 *
 * The link is metadata no rule reads, but *that a returning household was registered* is a decision
 * worth reading back: the log is the only account the system keeps of why a second record for the
 * same people exists, and without it the two rows look like a duplicate somebody failed to notice.
 */
const RE_REGISTERED_FIELD = "previousCustomerId";

/**
 * How often a lost race for a customer number is retried before the failure reaches the caller.
 *
 * With four users the race is rare but real: two registrations can read the same free slot before
 * either writes. A retry re-reads the taken numbers and moves to the next free one **of the same
 * group**, so the second registration succeeds instead of showing staff an error they can only
 * answer by pressing the button again. Three attempts is enough for a register that sees a handful
 * of writes a week, and the bound matters more than its size — an unbounded loop would turn a
 * repository fault into a hang.
 */
const MAX_ATTEMPTS = 3;

/**
 * How often a number **staff chose** is attempted: once.
 *
 * The retry above is only defensible because the number is the rule's to pick — a second attempt
 * lands on the next free slot and nobody is any the wiser. A number a staff member chose has no such
 * substitute: retrying it would either write a number they did not pick or fail again on the same
 * one. So the refusal goes back to the screen, where they can pick another (US-24.3).
 */
const CHOSEN_NUMBER_ATTEMPTS = 1;

/**
 * The slot an allocation takes: the lowest free number **of `group`**, so that the household lands
 * in the week the balance chose for them — the number is the group (`groupOf`, US-31), and picking
 * the lowest free number of the register as a whole would decide the week by accident.
 *
 * It falls back to the whole pool in the two cases that are really one — the group has no number to
 * offer — and they are worth telling apart. `group` is `null` when the recommendation declined,
 * which is the register being full: {@link lowestFreeNumber} then raises `NoFreeCustomerNumber`,
 * which goes on meaning exactly what it has always meant. A **named** group with nothing left is
 * only reachable on a retry — `suggestGroup` never names an empty one — and there the other group's
 * lowest slot is the right answer: turning an applicant away while a slot stands empty is what the
 * waiting list exists to prevent (US-12, FR-3), and the balance is a recommendation, not a quota of
 * its own.
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
   * Read only, and only for one question: what the highest index ever printed on the slot the
   * registration settles on is (US-25). The card itself is written with the customer, in the
   * register's one transaction — a registration that issued its card through this port would be
   * two writes where the whole point of the use case is one.
   */
  readonly cards: CardRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
}

export interface RegisterCustomerInput extends CustomerDetailsInput {
  /**
   * The slot staff chose from the free ones the form offered them (US-24), left out when nobody
   * looked at the dropdown — in which case the lowest free number of the recommended group is
   * allocated.
   *
   * **There is no group beside it, and that is the point.** A group follows from the customer
   * number (`groupOf`, US-31), so this one field says both which slot the household takes and which
   * week they collect in: a group that cannot be submitted cannot be submitted wrongly, and no
   * validation is needed to keep the two agreeing because there are no longer two of them.
   *
   * Given, it is used **as given**: it is checked against the register and refused if it is not
   * free, never quietly replaced. The number the form showed when staff pressed the button is the
   * number the household gets, which is the whole of what this field is for.
   */
  readonly customerNumber?: number;
  /**
   * The archived record this form was pre-filled from (US-11.3), left out for a walk-in.
   *
   * Passing it changes **nothing** about the registration: the household still gets an allocated
   * number, the next card on that number's run and a reminder count of zero, exactly as if they had
   * never been here before. It is stored so that a later screen can show the history, and there is no
   * branch on it anywhere — a re-registration that took a different path would be the merge US-11
   * rules out (tasks/prd-us-11-reuse-archived-record.md §FR-5). It is also why the card index is read
   * from the slot rather than set to 1: a household handed their old number back would otherwise be
   * printed a second copy of the card still in their kitchen drawer (US-25).
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
  // One read of the clock for the whole registration: the card's issue date and the audit entry's
  // instant must agree, and the household is judged as of the same day.
  const now = deps.clock.now();
  const details = createCustomerDetails(input, now);
  const settings = await readCurrentSettings({ settings: deps.settings, clock: deps.clock });
  // The counts printed on the card handed over with the registration — the same snapshot `issueCard`
  // takes, because a first card and a replacement are the same object (US-13.3). Derived, not stored:
  // the record itself still carries no count.
  const countsAtIssue = composition(details.householdMembers, now);
  // Absent is stored as null rather than left off, so the record always states whether these people
  // are known to DF — see `NewCustomer.previousCustomerId`.
  const previousCustomerId = input.previousCustomerId ?? null;
  const changedFields =
    previousCustomerId === null
      ? [...REGISTERED_FIELDS]
      : [...REGISTERED_FIELDS, RE_REGISTERED_FIELD];

  // One code path writes a customer, whether the number was chosen or allocated: the two differ in
  // where the number comes from and in how many attempts they are worth, and in nothing else.
  const chosen = input.customerNumber;
  let attemptsLeft = chosen === undefined ? MAX_ATTEMPTS : CHOSEN_NUMBER_ATTEMPTS;
  // The group an allocation settles in, decided from the **first** reading of the register and then
  // held for every retry. A retry that re-decided it would cross to the other group the moment the
  // lost number levelled the balance, and the household would be registered into a different week
  // than the one that was chosen for them, with nothing on any screen saying so — the one bug this
  // loop could grow. A number staff *chose* leaves it `null`: that path decides no group, because
  // the number they picked already did.
  let allocatedGroup: Group | null = null;
  for (;;) {
    attemptsLeft -= 1;
    const takenNumbers = await deps.customers.takenActiveNumbers();
    if (chosen === undefined) {
      // Counted off the numbers the register holds rather than asked of it: the group is no longer
      // a column, it is what a number is (`groupOf`, US-31).
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
    // an allocated number can move to a different one on a retry, and an index read before that
    // would print the previous slot's next card under the new slot's number. A slot no household
    // has ever held answers 0, which is how a first card still comes out as k1 without saying so.
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
      // Only a lost race *for the number* is worth a second go, and only while attempts remain.
      // Anything else — a full register, a broken database, a card number spent since the run was
      // read — would fail the same way however often it was repeated, or, in `CardNumberTaken`'s
      // case, would answer a stale read of one slot by moving the household to another.
      if (attemptsLeft === 0 || !(error instanceof CustomerNumberTaken)) {
        throw error;
      }
    }
  }
}
