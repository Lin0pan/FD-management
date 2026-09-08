/**
 * Replace a customer's household as it stands today (US-16.1).
 *
 * A **replacement of the set**, because that is what staff do on the screen and because no history of
 * past compositions is kept (PRD §FR-2) — what the household *was* survives only as the counts
 * printed on the card they hold.
 *
 * Nothing derived is written, and there is nothing to write: the counts follow the birthdates, so the
 * cards-due-for-reissue list (US-13.2) picks the household up on the next read with nothing to
 * enqueue and nothing that can be forgotten.
 *
 * Judged by `createHouseholdMembers`, so an edit cannot let through what a registration would refuse
 * — including the one thing only an edit can attempt: taking the customer out of their own household.
 */

import { createHouseholdMembers, type HouseholdMemberDetails } from "@/domain/customer/customer";
import { CustomerArchived, CustomerNotFound } from "@/domain/errors";
import type { AuditLog, Clock, CustomerRepository } from "../ports";

/** The audit event name every household edit is recorded under. */
const HOUSEHOLD_UPDATED = "customer.householdUpdated";

/**
 * One field, because one thing changed: the set of members. Naming who joined or left would be a
 * second record of the household beside the record itself — the log keeps *what, when and why*, not a
 * diff (ADR-006).
 */
const HOUSEHOLD_FIELDS = ["householdMembers"] as const;

export interface UpdateHouseholdDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface UpdateHouseholdInput {
  readonly customerId: number;
  /** The household as it should stand afterwards — the whole set, not the additions. */
  readonly members: ReadonlyArray<HouseholdMemberDetails>;
}

/**
 * Store the household and write the audit trail.
 *
 * A **blocked** household may be edited — a birth during a block is still a fact about them. An
 * **archived** one may not (PRD §FR-8), and their slot may already belong to somebody else.
 *
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {CustomerArchived} if the customer has left the register.
 * @throws {MissingRequiredField} naming the row whose first or last name is blank.
 * @throws {EmptyHousehold} if the new household has no members.
 * @throws {BirthDateInFuture} if a member was born after today.
 * @throws {CustomerNotInHousehold} if the new household no longer lists the customer themselves.
 */
export async function updateHousehold(
  deps: UpdateHouseholdDeps,
  { customerId, members }: UpdateHouseholdInput,
): Promise<void> {
  // One read of the clock, so the household is judged as of the audit entry's own instant.
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }
  if (customer.status === "ARCHIVED") {
    throw new CustomerArchived(customerId);
  }

  // Judged as *this customer's* household: everything the counter charges is derived from these
  // rows, so a set that no longer lists them would price somebody else's family.
  const householdMembers = createHouseholdMembers(
    members,
    {
      firstName: customer.details.firstName,
      lastName: customer.details.lastName,
      birthDate: customer.details.birthDate,
    },
    now,
  );

  await deps.customers.updateHousehold(customerId, householdMembers);
  await deps.audit.append({
    what: HOUSEHOLD_UPDATED,
    changedFields: [...HOUSEHOLD_FIELDS],
    when: now,
    why: "",
  });
}
