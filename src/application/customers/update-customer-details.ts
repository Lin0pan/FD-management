/**
 * Correct who a customer is and where they live (US-16.2).
 *
 * This is the everyday repair of a record: a misspelt surname, a birthdate typed a year out, a
 * household that has moved house. It is judged by `createPersonalDetails` — the same domain rule the
 * registration was judged by — so a correction can never let through data a registration refuses.
 *
 * **The customer number is not here, and cannot be reached from here** (PRD §FR-7). A slot is
 * assigned when a household joins the register and released when they leave it; editing it would
 * hand a household a number another one may already hold, and every card ever printed for them would
 * name the wrong slot. There is no input field for it, which is the whole of the guarantee.
 *
 * ## The customer is one of their own household members
 *
 * A registered customer's name and birthdate sit on the record twice: once as the person the slot
 * belongs to, and once as a row among the people they live with, because every rule that counts
 * heads reads the household rows (`householdComposition.ts`) and the customer is a head like any
 * other. The PRD (§7) asks for a single source of truth; the register cannot have one without either
 * dropping the customer from their own household — which would make `EmptyHousehold` meaningless and
 * a one-person household unrepresentable (US-16.1) — or giving household rows an identity they do
 * not have, since two children of the same name and birthdate are two rows and nothing tells them
 * apart.
 *
 * So the two copies are **kept in step in one write** instead: the row that held the customer's old
 * name and birthdate is restated with the new ones (`replaceHouseholdMember`), and the household
 * goes out in the same transaction as the personal data. The rule is the domain's, so what counts as
 * "the row that is them" is stated once and testable; the transaction is the repository's, so the
 * two halves cannot land apart. When no row says what the customer used to, the household is left
 * exactly as it stands — nothing there claims to be them, and guessing would rewrite somebody else.
 */

import {
  createPersonalDetails,
  replaceHouseholdMember,
  type Address,
} from "@/domain/customer/customer";
import { CustomerArchived, CustomerNotFound } from "@/domain/errors";
import type { AuditLog, Clock, CustomerRepository } from "../ports";

/** The audit event name every correction of a customer's personal data is recorded under. */
const DETAILS_UPDATED = "customer.detailsUpdated";

/**
 * What the audit entry names as changed.
 *
 * The household is not among them although it is written with them: the row that moved is the
 * customer's own name said a second time, not a change to who lives in the household. That change
 * has its own event (`customer.householdUpdated`), and listing it here would read as a member having
 * joined or left.
 */
const DETAILS_FIELDS = ["firstName", "lastName", "birthDate", "address"] as const;

export interface UpdateCustomerDetailsDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

/** The record's personal data as it should stand afterwards. Note the absence of a customer number. */
export interface UpdateCustomerDetailsInput {
  readonly customerId: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date;
  readonly address: Address;
}

/**
 * Store the corrected personal data, carry it into the household, and write the audit trail.
 *
 * A **blocked** customer may be corrected: a block turns a household away at the counter, it does
 * not freeze their record. An **archived** one may not — their record is read-only (PRD §FR-8).
 *
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {CustomerArchived} if the customer has left the register.
 * @throws {MissingRequiredField} naming the name or address part that was left blank.
 * @throws {BirthDateInFuture} if the birthdate lies after today.
 */
export async function updateCustomerDetails(
  deps: UpdateCustomerDetailsDeps,
  { customerId, firstName, lastName, birthDate, address }: UpdateCustomerDetailsInput,
): Promise<void> {
  // One read of the clock: the birthdate is judged as of the same moment the audit entry is stamped.
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }
  if (customer.status === "ARCHIVED") {
    throw new CustomerArchived(customerId);
  }

  const details = createPersonalDetails({ firstName, lastName, birthDate, address }, now);
  const household = replaceHouseholdMember(
    customer.details.householdMembers,
    {
      firstName: customer.details.firstName,
      lastName: customer.details.lastName,
      birthDate: customer.details.birthDate,
    },
    { firstName: details.firstName, lastName: details.lastName, birthDate: details.birthDate },
  );

  await deps.customers.updateDetails(customerId, details, household);
  await deps.audit.append({
    what: DETAILS_UPDATED,
    changedFields: [...DETAILS_FIELDS],
    when: now,
    why: "",
  });
}
