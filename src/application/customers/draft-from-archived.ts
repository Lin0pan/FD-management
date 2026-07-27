/**
 * Build a registration draft from an archived record (US-11.2) — the pre-fill behind "wir kennen
 * Sie schon".
 *
 * The draft is a **plain value**. It is not a reservation, not a half-created customer and not a
 * link to the old row: nothing is written here, and what comes back is a copy staff may edit freely
 * before they register anyone (US-11.3 does the registering, through the ordinary `registerCustomer`
 * path). The archived record is left exactly as it was found, which is the whole promise of US-10 —
 * a household that comes back gets a new record, and the old one keeps its own history.
 *
 * What the draft deliberately leaves out is the point of it: no customer number, no group, no card,
 * no reminder count, no certificate — and no notes. Every one of those is decided afresh, and the
 * old ones would be wrong in a way nobody would notice. The number was freed the day the household
 * was archived and may be somebody else's by now (FR-3); the certificate is the piece of paper the
 * applicant is holding *today*, and copying the lapsed one forward would record a proof of need that
 * nobody has seen (FR-4); a note about a household two years ago is not a note about this
 * registration (PRD §5).
 *
 * No clock and no audit log: nothing here depends on the day, and nothing changed that a log could
 * record.
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
 * A registration form filled in from an archived record: the applicant, where they live and who
 * lives with them, and nothing else.
 *
 * Every field is editable — the household may have grown, shrunk or moved since — so the draft is
 * a starting point rather than a record. It carries no identity of its own: registering it creates
 * a new customer, and discarding it leaves nothing behind.
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
 * A member copied rather than shared. `Date` is mutable, so a form that advances a birthdate in the
 * draft would otherwise reach into the archived record through the reference it was handed.
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
 * @throws {CustomerNotArchived} if the id belongs to a household still on the register — pre-filling
 *   from an active or blocked record would invite a second registration of a customer who already
 *   holds a slot (FR-6).
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
