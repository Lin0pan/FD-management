/**
 * Register an applicant as a customer: give them the lowest free number, a balancing group and
 * their first card, in one transaction.
 *
 * This is the whole of what "registration" means in the system — the card is not a separate action
 * staff can forget (tasks/prd-us-01-register-customer.md §7). Everything the form does not ask for
 * is decided here rather than typed: the number, the suggested group, the status and the reminder
 * count. Nothing derivable is stored, so no household count is written anywhere.
 */

import { CustomerNumberTaken } from "@/domain/errors";
import {
  createCustomerDetails,
  type CustomerDetailsInput,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import { lowestFreeNumber } from "@/domain/customer/customerNumber";
import { suggestGroup, type Group } from "@/domain/customer/group";
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
}

/**
 * Register a customer and hand back the persisted record, card and all.
 *
 * @throws {MissingRequiredField} for a name, address part or certificate type left blank.
 * @throws {EmptyHousehold} if the household has no members.
 * @throws {BirthDateInFuture} if the customer or a member was born after today.
 * @throws {NoFreeCustomerNumber} if every slot up to the quota is taken.
 * @throws {CustomerNumberTaken} if a concurrent registration kept winning the chosen slot.
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

  let attemptsLeft = MAX_ATTEMPTS;
  for (;;) {
    attemptsLeft -= 1;
    const takenNumbers = await deps.customers.takenActiveNumbers();
    const customerNumber = lowestFreeNumber(takenNumbers, settings.quotaN);

    try {
      const customer = await deps.customers.create({
        details,
        customerNumber,
        group,
        status: "ACTIVE",
        reminderCount: 0,
        card: { index: 1, issuedAt: now, reason: "FIRST_ISSUE" },
      });
      await deps.audit.append({
        what: CUSTOMER_REGISTERED,
        changedFields: [...REGISTERED_FIELDS],
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
