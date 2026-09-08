/**
 * The customer record: who DF serves, where they live, which certificate entitles them, and who else
 * lives in their household. Validated on construction (`createCustomerDetails`), so a half-filled
 * household cannot exist as a value and no caller re-checks it.
 *
 * What is absent matters as much: no counts and no price, because both are derived from the
 * birthdates wherever they are needed (ADR-007).
 */

import type { IssuedCard, NewCard } from "../card/card";
import {
  CustomerNotInHousehold,
  InvalidCustomerRecord,
  MissingRequiredField,
  NotesTooLong,
} from "../errors";
import { composition, type HouseholdMember } from "./householdComposition";

/**
 * Where a customer stands in DF's register. `ACTIVE` and `BLOCKED` both hold a slot — a blocked
 * customer is turned away at the counter but stays registered (US-08) — while `ARCHIVED` releases it
 * and keeps the row queryable (ADR-008, ADR-010).
 */
export type CustomerStatus = "ACTIVE" | "BLOCKED" | "ARCHIVED";

/** Every status a stored customer can be in. */
const CUSTOMER_STATUSES: ReadonlyArray<CustomerStatus> = ["ACTIVE", "BLOCKED", "ARCHIVED"];

/**
 * Read a stored status word back as a {@link CustomerStatus} — SQLite has no enum type, so the word
 * is checked rather than trusted.
 *
 * @throws {InvalidCustomerRecord} for anything that is not one of the three known words.
 */
export function parseCustomerStatus(value: string): CustomerStatus {
  const status = CUSTOMER_STATUSES.find((candidate) => candidate === value);
  if (status === undefined) {
    throw new InvalidCustomerRecord("status", value);
  }
  return status;
}

/** A German address in flat fields, never a formatted blob — DF sorts and searches by them. */
export interface Address {
  readonly street: string;
  readonly houseNumber: string;
  readonly zip: string;
  readonly city: string;
}

/**
 * The proof of need that entitles a household to shop, e.g. a Jobcenter notice. An expired one is
 * not rejected here — chasing a renewal is a conversation at the counter, not a data-entry error.
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

/**
 * Who the registered customer is and where they live. Its own type because it is edited on its own
 * long after registration (US-16.2), as each of the other parts of the record is.
 */
export interface PersonalDetails {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date;
  readonly address: Address;
}

/** Everything staff type on the registration form. */
export interface CustomerDetailsInput extends PersonalDetails {
  readonly certificate: NeedsCertificate;
  /** The whole household, the customer included — so the smallest legitimate one has exactly one. */
  readonly householdMembers: ReadonlyArray<HouseholdMemberDetails>;
  /** A free remark, or `""`. Optional by design: most households need none. */
  readonly notes: string;
}

/**
 * The longest note the record keeps for a household (US-16.3).
 *
 * Deliberately not a setting: settings are decisions DF makes about how they serve people, while
 * this is a bound on a text column so a pasted document cannot become a customer record. Stated
 * once, because the use case saving a note and the form counting characters must agree.
 */
export const NOTES_MAX_LENGTH = 4000;

/** The same data once it has been checked and trimmed. Only `createCustomerDetails` produces one. */
export interface CustomerDetails extends CustomerDetailsInput {
  readonly householdMembers: ReadonlyArray<HouseholdMemberDetails>;
}

/** A customer about to be written: the typed details plus everything registration decided. */
export interface NewCustomer {
  readonly details: CustomerDetails;
  /**
   * The slot the household holds, and with it the week they collect in — there is deliberately no
   * `group` beside it, because the number is the group (`groupOf`, ADR-017).
   */
  readonly customerNumber: number;
  readonly status: CustomerStatus;
  readonly reminderCount: number;
  /**
   * The card the customer currently holds — the next one due on their slot (index 1 only where
   * nobody has held that number before, US-25). A {@link NewCard} like any other, so a registration
   * and `issueCard` cannot drift apart. Its slot is `customerNumber` above, never a second copy.
   */
  readonly card: NewCard;
  /**
   * The archived record this registration was pre-filled from, or `null` (US-11.3).
   *
   * **Display metadata and nothing else** — no rule reads it and none may start. The returning
   * household is a *new* customer with a new number and a fresh card index; the link only says "we
   * have met these people before", so the two records are never merged
   * (`tasks/prd-us-11-reuse-archived-record.md` §FR-5).
   *
   * Nullable rather than optional, so a writer cannot drop the link by forgetting the field.
   */
  readonly previousCustomerId: number | null;
}

/**
 * A persisted customer. `id` is the surrogate key and the only identity there is — a customer number
 * is a slot another household may hold once this one is archived (ADR-008).
 */
export interface RegisteredCustomer extends NewCustomer {
  readonly id: number;
  /**
   * The card the household holds, as **stored** — so it names the slot it was printed under
   * (ADR-016). Cards left behind on a vacated slot keep the old number, which is the invariant every
   * card-number derivation rests on: the card a household holds is the highest index on their slot.
   */
  readonly card: IssuedCard;
  /**
   * Why this customer is currently blocked — non-null *exactly* when `status` is `BLOCKED`, written
   * when the block is applied and cleared when it is lifted. The audit log keeps the history; this
   * keeps what the counter must show today (US-08, FR-4).
   */
  readonly blockReason: string | null;
  /**
   * Why this household was archived — non-null *exactly* when `status` is `ARCHIVED`. There is no
   * way back out, so this and `archivedAt` are written once and never cleared: what the record shows
   * about itself long after the audit entry has scrolled away (US-10, FR-1).
   */
  readonly archiveReason: string | null;
  /** When the household was archived, or `null` while it is not. Non-null with `archiveReason`. */
  readonly archivedAt: Date | null;
  /**
   * The day the household joined — the issue date of their **first** card, since a card is handed
   * over with the registration and there is no registration column (US-01.4). Derived on read, never
   * stored, so a reissue cannot move a household's start. The no-show count needs it, as no
   * distribution before it was theirs to attend (`tasks/prd-us-10-archive-customer.md` §US-10.1).
   */
  readonly registeredOn: Date;
}

/**
 * The trimmed value of a field that must carry one.
 *
 * @throws {MissingRequiredField} naming the field, so the form can mark the input.
 */
function requireText(field: string, value: string): string {
  const text = value.trim();
  if (text === "") {
    throw new MissingRequiredField(field);
  }
  return text;
}

/**
 * Validate a household — the rows, and that they are the household of the customer they belong to.
 *
 * Its own function because a household is edited long after it is first typed (US-16.1) and the edit
 * must be judged by exactly the rules the registration was; a second implementation would drift with
 * the first rule that changed.
 *
 * `customer` is required for that reason: the registered person *is* one of these rows, so a
 * household not listing them is not theirs, and a caller cannot validate one without saying whose it
 * is. Rows come back trimmed and **copied**, so a caller editing the array it passed in cannot reach
 * into the validated household.
 *
 * @throws {MissingRequiredField} naming the row whose first or last name is blank.
 * @throws {EmptyHousehold} if no member was given.
 * @throws {BirthDateInFuture} if a member was born after `today`.
 * @throws {CustomerNotInHousehold} if no row is the customer themselves.
 */
export function createHouseholdMembers(
  members: ReadonlyArray<HouseholdMemberDetails>,
  customer: HouseholdMemberDetails,
  today: Date,
): ReadonlyArray<HouseholdMemberDetails> {
  const householdMembers = members.map((member, index) => ({
    firstName: requireText(`householdMembers.${index}.firstName`, member.firstName),
    lastName: requireText(`householdMembers.${index}.lastName`, member.lastName),
    birthDate: member.birthDate,
  }));

  // Deriving the composition is how the household is validated: it rejects an empty household and a
  // birthdate after today. The counts are discarded — they are never part of the record. Run before
  // the customer's own row is looked for, because an empty table is missing them too and "kein
  // Mitglied" is the more useful of the two answers.
  composition(householdMembers, today);

  const self = {
    firstName: customer.firstName.trim(),
    lastName: customer.lastName.trim(),
    birthDate: customer.birthDate,
  };
  if (!householdMembers.some((row) => isSameMember(row, self))) {
    throw new CustomerNotInHousehold(self.firstName, self.lastName, self.birthDate);
  }

  return householdMembers;
}

/**
 * Validate who the customer is and where they live, independent of the rest of the record. Its own
 * function for {@link createHouseholdMembers}' reason: it is edited separately (US-16.2) and must be
 * judged by exactly the rules the registration was.
 *
 * @throws {MissingRequiredField} naming the name or address part that was left blank.
 * @throws {BirthDateInFuture} if the customer was born after `today`.
 */
export function createPersonalDetails(input: PersonalDetails, today: Date): PersonalDetails {
  // A household of one can never be empty, so the only rule `composition` raises here is the one
  // that matters: nobody is born tomorrow.
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
  };
}

/**
 * Validate a free-text note (US-16.3). An empty one is legitimate — unlike a block reason, a note is
 * a convenience. Length is measured *after* trimming, so trailing blanks alone cannot break it.
 *
 * @throws {NotesTooLong} if the trimmed text is longer than {@link NOTES_MAX_LENGTH}.
 */
export function createNotes(notes: string): string {
  const text = notes.trim();
  if (text.length > NOTES_MAX_LENGTH) {
    throw new NotesTooLong(text.length, NOTES_MAX_LENGTH);
  }
  return text;
}

function isSameMember(row: HouseholdMemberDetails, other: HouseholdMemberDetails): boolean {
  return (
    row.firstName === other.firstName &&
    row.lastName === other.lastName &&
    row.birthDate.getTime() === other.birthDate.getTime()
  );
}

/**
 * Restate the household row that described `was` as `becomes`, leaving every other row alone.
 *
 * The customer is themselves a household member, so a corrected name has to move both their own
 * fields and their row, or the household would list a person who no longer exists (US-16.2).
 *
 * The row is found by *what it says* — a household row has no identity of its own — and only the
 * first match, since one person cannot live in a household twice. When no row says it the household
 * is returned unchanged: guessing which row meant them is how an edit rewrites somebody else, and
 * repairing such a record belongs to the household editor.
 */
export function replaceHouseholdMember(
  members: ReadonlyArray<HouseholdMemberDetails>,
  was: HouseholdMemberDetails,
  becomes: HouseholdMemberDetails,
): ReadonlyArray<HouseholdMemberDetails> {
  const at = members.findIndex((row) => isSameMember(row, was));
  return members.map((row, index) => (index === at ? becomes : { ...row }));
}

/**
 * Validate a registration and return it as a `CustomerDetails`.
 *
 * @throws {MissingRequiredField} for a name, address part or certificate type left blank.
 * @throws {EmptyHousehold} if no household member was given.
 * @throws {BirthDateInFuture} if the customer or a member was born after `today`.
 * @throws {CustomerNotInHousehold} if the household does not list the applicant themselves.
 * @throws {NotesTooLong} if the note is longer than {@link NOTES_MAX_LENGTH}.
 */
export function createCustomerDetails(input: CustomerDetailsInput, today: Date): CustomerDetails {
  // The applicant's own data first: the household is then judged as *theirs*, and that takes their
  // trimmed name to say which row is.
  const personal = createPersonalDetails(input, today);
  const householdMembers = createHouseholdMembers(input.householdMembers, personal, today);

  return {
    ...personal,
    certificate: {
      type: requireText("certificate.type", input.certificate.type),
      validUntil: input.certificate.validUntil,
    },
    householdMembers,
    notes: createNotes(input.notes),
  };
}
