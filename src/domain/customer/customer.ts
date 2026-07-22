/**
 * The customer record: who FD serves, where they live, which needs certificate entitles them, and
 * who else lives in their household.
 *
 * The record is **validated on construction** (`createCustomerDetails`), so a half-filled household
 * cannot exist as a value and no caller has to re-check it. What is deliberately *absent* is as
 * important as what is here: there is no grown-up or children count and no portion allowance, because
 * both are derived from the birthdates wherever they are needed (`householdComposition.ts`). The
 * Excel sheet FD is replacing kept them as typed-in numbers, and they drifted with every birthday.
 *
 * The module is pure: `today` is a parameter, and nothing here knows how a customer is stored.
 */

import { MissingRequiredField } from "../errors";
import type { Group } from "./group";
import { composition, type HouseholdMember } from "./householdComposition";

/**
 * Where a customer stands in FD's register.
 *
 * `ACTIVE` holds a customer number slot; `BLOCKED` still does — a blocked customer is turned away at
 * the counter but remains registered (US-08) — while `ARCHIVED` releases the slot and keeps the row
 * queryable, because customer data is never hard-deleted (US-10, US-11).
 */
export type CustomerStatus = "ACTIVE" | "BLOCKED" | "ARCHIVED";

/** A German address in flat fields, never a formatted blob — FD sorts and searches by them. */
export interface Address {
  readonly street: string;
  readonly houseNumber: string;
  readonly zip: string;
  readonly city: string;
}

/**
 * The proof of need that entitles a household to shop, e.g. a Jobcenter notice. `validUntil` is what
 * the certificate reminder (US-06) counts down to; an expired one is not rejected here, because
 * chasing a renewal is a conversation at the counter rather than a data-entry error.
 */
export interface NeedsCertificate {
  readonly type: string;
  readonly validUntil: Date;
}

/** A household member as the record holds them — a name on top of the birthdate the rules need. */
export interface HouseholdMemberDetails extends HouseholdMember {
  readonly firstName: string;
  readonly lastName: string;
}

/** Everything staff type on the registration form. */
export interface CustomerDetailsInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date;
  readonly address: Address;
  readonly certificate: NeedsCertificate;
  /** The whole household, the customer included — so the smallest legitimate one has exactly one. */
  readonly householdMembers: ReadonlyArray<HouseholdMemberDetails>;
  /** A free remark, or `""`. Optional by design: most households need none. */
  readonly notes: string;
}

/** The same data once it has been checked and trimmed. Only `createCustomerDetails` produces one. */
export interface CustomerDetails extends CustomerDetailsInput {
  readonly householdMembers: ReadonlyArray<HouseholdMemberDetails>;
}

/** The first card of a customer, issued with the registration itself (US-02). */
export interface CustomerCard {
  /** 1 for the card handed over at registration; a reissue after a loss counts on (US-09). */
  readonly index: number;
  readonly issuedAt: Date;
}

/** A customer about to be written: the typed details plus everything registration decided. */
export interface NewCustomer {
  readonly details: CustomerDetails;
  readonly customerNumber: number;
  readonly group: Group;
  readonly status: CustomerStatus;
  readonly reminderCount: number;
  readonly card: CustomerCard;
}

/**
 * A persisted customer. `id` is the surrogate key and the only identity there is — the customer
 * number is a slot that another household may hold once this one is archived (`customerNumber.ts`).
 */
export interface RegisteredCustomer extends NewCustomer {
  readonly id: number;
}

/**
 * The trimmed value of a field that must carry one.
 *
 * @throws {MissingRequiredField} naming the field, so the form can mark the input rather than
 *   reporting that "something" is missing.
 */
function requireText(field: string, value: string): string {
  const text = value.trim();
  if (text === "") {
    throw new MissingRequiredField(field);
  }
  return text;
}

/**
 * Validate a registration and return it as a `CustomerDetails`.
 *
 * @throws {MissingRequiredField} for a name, address part or certificate type left blank.
 * @throws {EmptyHousehold} if no household member was given.
 * @throws {BirthDateInFuture} if the customer or a member was born after `today`.
 */
export function createCustomerDetails(input: CustomerDetailsInput, today: Date): CustomerDetails {
  const householdMembers = input.householdMembers.map((member, index) => ({
    firstName: requireText(`householdMembers.${index}.firstName`, member.firstName),
    lastName: requireText(`householdMembers.${index}.lastName`, member.lastName),
    birthDate: member.birthDate,
  }));

  // Deriving the composition is how the household is validated: it rejects an empty household and a
  // birthdate that lies after today. The counts themselves are discarded on purpose — they are
  // derived again wherever they are needed and are never part of the record.
  composition(householdMembers, today);
  // The customer is normally one of those rows, but nothing forces staff to have added them first,
  // so their own birthdate is checked in its own right. A household of one can never be empty.
  composition([{ birthDate: input.birthDate }], today);

  return {
    firstName: requireText("firstName", input.firstName),
    lastName: requireText("lastName", input.lastName),
    birthDate: input.birthDate,
    address: {
      street: requireText("address.street", input.address.street),
      houseNumber: requireText("address.houseNumber", input.address.houseNumber),
      zip: requireText("address.zip", input.address.zip),
      city: requireText("address.city", input.address.city),
    },
    certificate: {
      type: requireText("certificate.type", input.certificate.type),
      validUntil: input.certificate.validUntil,
    },
    householdMembers,
    notes: input.notes.trim(),
  };
}
