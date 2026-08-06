/**
 * Register an applicant as a customer: give them the lowest free number, a balancing group and
 * their first card, in one transaction.
 *
 * This is the whole of what "registration" means in the system — the card is not a separate action
 * staff can forget (tasks/prd-us-01-register-customer.md §7). Everything the form does not ask for
 * is decided here rather than typed: the number, the suggested group, the status and the reminder
 * count. Nothing derivable is stored, so no household count is written anywhere.
 *
 * It is also the **only** registration path, which is what makes re-registering a returning
 * household (US-11.3) a matter of where the form's values came from rather than of different code:
 * a draft built from an archived record is registered through here like anything staff typed, and
 * comes out a new customer with a new number and a card at index 1.
 */

import { CustomerNumberTaken } from "@/domain/errors";
import {
  createCustomerDetails,
  type CustomerDetailsInput,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import { assertFreeNumber, lowestFreeNumber } from "@/domain/customer/customerNumber";
import { suggestGroup, type Group } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import type { AuditLog, Clock, CustomerRepository, SettingsRepository } from "../ports";
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
 * either writes. A retry re-reads the taken numbers and moves to the next free one, so the second
 * registration succeeds instead of showing staff an error they can only answer by pressing the
 * button again. Three attempts is enough for a register that sees a handful of writes a week, and
 * the bound matters more than its size — an unbounded loop would turn a repository fault into a
 * hang.
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

export interface RegisterCustomerDeps {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
}

export interface RegisterCustomerInput extends CustomerDetailsInput {
  /**
   * The group staff picked, overriding the balancing suggestion — a household that shares a lift
   * with a neighbour belongs in the neighbour's week. Left out, the smaller group is suggested.
   */
  readonly group?: Group;
  /**
   * The slot staff chose from the free ones the form offered them (US-24), left out when nobody
   * looked at the dropdown — in which case the lowest free number is allocated, exactly as before.
   *
   * Given, it is used **as given**: it is checked against the register and refused if it is not
   * free, never quietly replaced. The number the form showed when staff pressed the button is the
   * number the household gets, which is the whole of what this field is for.
   */
  readonly customerNumber?: number;
  /**
   * The archived record this form was pre-filled from (US-11.3), left out for a walk-in.
   *
   * Passing it changes **nothing** about the registration: the household still gets the lowest free
   * number, a fresh card at index 1 and a reminder count of zero, exactly as if they had never been
   * here before. It is stored so that a later screen can show the history, and there is no branch on
   * it anywhere — a re-registration that took a different path would be the merge US-11 rules out
   * (tasks/prd-us-11-reuse-archived-record.md §FR-5).
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
  const group = input.group ?? suggestGroup(await deps.customers.groupCounts());
  // The counts printed on the card handed over with the registration — the same snapshot `issueCard`
  // takes, because a first card and a replacement are the same object (US-13.3). Derived, not stored:
  // the record itself still carries no count.
  const countsAtIssue = composition(details.householdMembers, now);
  // Absent is stored as null rather than left off, so the record always states whether these people
  // are known to FD — see `NewCustomer.previousCustomerId`.
  const previousCustomerId = input.previousCustomerId ?? null;
  const changedFields =
    previousCustomerId === null
      ? [...REGISTERED_FIELDS]
      : [...REGISTERED_FIELDS, RE_REGISTERED_FIELD];

  // One code path writes a customer, whether the number was chosen or allocated: the two differ in
  // where the number comes from and in how many attempts they are worth, and in nothing else.
  const chosen = input.customerNumber;
  let attemptsLeft = chosen === undefined ? MAX_ATTEMPTS : CHOSEN_NUMBER_ATTEMPTS;
  for (;;) {
    attemptsLeft -= 1;
    const takenNumbers = await deps.customers.takenActiveNumbers();
    const customerNumber =
      chosen === undefined
        ? lowestFreeNumber(takenNumbers, settings.quotaN)
        : assertFreeNumber(chosen, takenNumbers, settings.quotaN);

    try {
      const customer = await deps.customers.create({
        details,
        customerNumber,
        group,
        status: "ACTIVE",
        reminderCount: 0,
        card: {
          index: 1,
          issuedAt: now,
          reason: "FIRST_ISSUE",
          countsAtIssue,
          groupAtIssue: group,
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
      // Only a lost race is worth a second go, and only while attempts remain. Anything else — a
      // full register, a broken database — would fail the same way however often it was repeated.
      if (attemptsLeft === 0 || !(error instanceof CustomerNumberTaken)) {
        throw error;
      }
    }
  }
}
