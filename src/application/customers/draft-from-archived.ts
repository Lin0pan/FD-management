/**
 * Build a registration draft from an archived record (US-11.2) — the pre-fill behind "wir kennen Sie
 * schon".
 *
 * A **plain value**: nothing is written, the archived record is left as found, and registering is
 * `registerCustomer`'s through the ordinary path (US-11.3).
 *
 * What it leaves out is the point of it — no customer number, card, reminder count, certificate or
 * notes. Each would be wrong in a way nobody would notice: the number was freed on the way out and
 * may be somebody else's (FR-3), the certificate is the paper the applicant holds *today* (FR-4), and
 * a note about a household two years ago is not a note about this registration (PRD §5).
 */

import type { Address, HouseholdMemberDetails } from "@/domain/customer/customer";
import { CustomerNotArchived, CustomerNotFound } from "@/domain/errors";
import type { CustomerRepository } from "../ports";

export interface DraftFromArchivedDeps {
  readonly customers: CustomerRepository;
}

export interface DraftFromArchivedInput {
  /** The surrogate id of the archived record — what the archive search names each match by. */
  readonly archivedCustomerId: number;
}

/**
 * A registration form filled in from an archived record: the applicant, where they live and who lives
 * with them. A starting point rather than a record — it carries no identity, so registering it
 * creates a new customer and discarding it leaves nothing behind.
 */
export interface RegistrationDraft {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date;
  readonly address: Address;
  /** The whole household as it stood on the archived record, each member a fresh value. */
  readonly householdMembers: ReadonlyArray<HouseholdMemberDetails>;
}

/**
 * Copied rather than shared: `Date` is mutable, so a form advancing a birthdate in the draft would
 * otherwise reach into the archived record through the reference it was handed.
 */
function copyMember(member: HouseholdMemberDetails): HouseholdMemberDetails {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    birthDate: new Date(member.birthDate.getTime()),
  };
}

/**
 * Read an archived record and hand back a draft registration form filled in from it.
 *
 * @throws {CustomerNotFound} if no customer holds `archivedCustomerId`.
 * @throws {CustomerNotArchived} if the household is still on the register — pre-filling from one
 *   would invite a second registration of a customer who already holds a slot (FR-6).
 */
export async function draftFromArchived(
  deps: DraftFromArchivedDeps,
  { archivedCustomerId }: DraftFromArchivedInput,
): Promise<RegistrationDraft> {
  const customer = await deps.customers.findById(archivedCustomerId);
  if (customer === null) {
    throw new CustomerNotFound(archivedCustomerId);
  }
  if (customer.status !== "ARCHIVED") {
    throw new CustomerNotArchived(customer.id, customer.status);
  }

  const { details } = customer;
  return {
    firstName: details.firstName,
    lastName: details.lastName,
    birthDate: new Date(details.birthDate.getTime()),
    address: { ...details.address },
    householdMembers: details.householdMembers.map(copyMember),
  };
}
