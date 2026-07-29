/**
 * Replace a customer's household — the members who live with them, as they are today (US-16.1).
 *
 * Households change: a baby is born, somebody moves out. The edit is a **replacement of the set**,
 * because that is what staff do on the screen — they correct the list in front of them and save it —
 * and because no history of past compositions is kept (PRD §FR-2). What the household *was* survives
 * in exactly one place, and only as a physical fact: the counts printed on the card they hold.
 *
 * Nothing derived is written here, and there is nothing to write: the counts, the portion allowance
 * and the price are read off the birthdates wherever they are needed, so they are already right the
 * instant this returns. The cards-due-for-reissue list (US-13.2) follows the same way — a change
 * that alters the counts puts the household on it with reason `HOUSEHOLD_CHANGE`, derived on the
 * next read, with nothing to enqueue and nothing that can be forgotten.
 *
 * The rows are judged by `createHouseholdMembers`, the same domain rule a registration is judged by,
 * so an edit can never let through a household a registration would refuse.
 */

import { createHouseholdMembers, type HouseholdMemberDetails } from "@/domain/customer/customer";
import { CustomerArchived, CustomerNotFound } from "@/domain/errors";
import type { AuditLog, Clock, CustomerRepository } from "../ports";

/** The audit event name every household edit is recorded under. */
const HOUSEHOLD_UPDATED = "customer.householdUpdated";

/**
 * What the audit entry names as changed.
 *
 * One field, because one thing changed: the set of members. Naming who joined or left would be a
 * second record of the household beside the record itself — and the log deliberately keeps *what,
 * when and why*, not a diff (docs/tech_stack_architecture_sketch.md §5.2).
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
 * A **blocked** household may be edited: a block turns them away at the counter, it does not freeze
 * their record, and a birth during a block is still a fact about them. An **archived** one may not —
 * their record is read-only (PRD §FR-8), and their slot may already belong to somebody else.
 *
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {CustomerArchived} if the customer has left the register.
 * @throws {MissingRequiredField} naming the row whose first or last name is blank.
 * @throws {EmptyHousehold} if the new household has no members.
 * @throws {BirthDateInFuture} if a member was born after today.
 */
export async function updateHousehold(
  deps: UpdateHouseholdDeps,
  { customerId, members }: UpdateHouseholdInput,
): Promise<void> {
  // One read of the clock: the household is judged as of the same moment the audit entry is stamped.
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }
  if (customer.status === "ARCHIVED") {
    throw new CustomerArchived(customerId);
  }

  const householdMembers = createHouseholdMembers(members, now);

  await deps.customers.updateHousehold(customerId, householdMembers);
  await deps.audit.append({
    what: HOUSEHOLD_UPDATED,
    changedFields: [...HOUSEHOLD_FIELDS],
    when: now,
    why: "",
  });
}
