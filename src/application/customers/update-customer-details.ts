/**
 * Correct who a customer is and where they live (US-16.2) — judged by `createPersonalDetails`, the
 * same rule the registration was, so a correction cannot let through what a registration refuses.
 *
 * **The customer number is not here and cannot be reached from here** (PRD §FR-7): there is no input
 * field for it, which is the whole of the guarantee (`changeCustomerNumber` is the way, US-30).
 *
 * **The customer is one of their own household members**, so their name sits on the record twice —
 * every rule that counts heads reads the household rows, and the customer is a head like any other.
 * Neither alternative works: dropping them from their own household makes a one-person household
 * unrepresentable (US-16.1), and household rows have no identity to key on, since two children of the
 * same name and birthdate are two rows.
 *
 * So the two copies are **kept in step in one write**: `replaceHouseholdMember` restates the row, and
 * it goes out in the same transaction as the personal data. When no row says what the customer used
 * to, the household is left as it stands — guessing would rewrite somebody else.
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
 * The household is deliberately not among them although it is written with them: the row that moved
 * is the customer's own name said twice, not a change to who lives there. That has its own event.
 */
const DETAILS_FIELDS = ["firstName", "lastName", "birthDate", "address"] as const;

export interface UpdateCustomerDetailsDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

/** The personal data as it should stand afterwards — note the absence of a customer number. */
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
 * A **blocked** customer may be corrected — a block turns a household away at the counter, it does not
 * freeze their record. An **archived** one may not (PRD §FR-8).
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
  // One read of the clock, so the birthdate is judged as of the audit entry's own instant.
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
