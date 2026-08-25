/**
 * The customer record: who DF serves, where they live, which needs certificate entitles them, and
 * who else lives in their household.
 *
 * The record is **validated on construction** (`createCustomerDetails`), so a half-filled household
 * cannot exist as a value and no caller has to re-check it. What is deliberately *absent* is as
 * important as what is here: there is no grown-up or children count and no price, because both are
 * derived from the birthdates wherever they are needed (`householdComposition.ts` counts,
 * `priceFor` prices). The Excel sheet DF is replacing kept them as typed-in numbers, and they
 * drifted with every birthday.
 *
 * The module is pure: `today` is a parameter, and nothing here knows how a customer is stored.
 */

import type { IssuedCard } from "../card/card";
import {
  CustomerNotInHousehold,
  InvalidCustomerRecord,
  MissingRequiredField,
  NotesTooLong,
} from "../errors";
import type { Group } from "./group";
import { composition, type HouseholdMember } from "./householdComposition";

/**
 * Where a customer stands in DF's register.
 *
 * `ACTIVE` holds a customer number slot; `BLOCKED` still does — a blocked customer is turned away at
 * the counter but remains registered (US-08) — while `ARCHIVED` releases the slot and keeps the row
 * queryable, because customer data is never hard-deleted (US-10, US-11).
 */
export type CustomerStatus = "ACTIVE" | "BLOCKED" | "ARCHIVED";

/** Every status a stored customer can be in. */
const CUSTOMER_STATUSES: ReadonlyArray<CustomerStatus> = ["ACTIVE", "BLOCKED", "ARCHIVED"];

/**
 * Read a stored status word back as a {@link CustomerStatus}. SQLite has no enum type, so the word
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

/**
 * Who the registered customer is and where they live — the part of the record that is about the
 * person rather than about their household, their certificate or what staff noted about them.
 *
 * It is its own type because it is edited on its own long after registration (US-16.2): a household
 * moves house, a name was misspelt, a birthdate was typed a year out. Each of the other parts has a
 * use case of its own, and this is the one that names a person.
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
 * Not a policy value and deliberately not in settings: the prices and the quota there are decisions
 * DF makes about how they serve people, while this is a bound on a text column, so that a pasted
 * document cannot become a customer record. It is stated once, here, because the use case that
 * saves a note and the form that counts characters must mean the same number.
 */
export const NOTES_MAX_LENGTH = 4000;

/** The same data once it has been checked and trimmed. Only `createCustomerDetails` produces one. */
export interface CustomerDetails extends CustomerDetailsInput {
  readonly householdMembers: ReadonlyArray<HouseholdMemberDetails>;
}

/** A customer about to be written: the typed details plus everything registration decided. */
export interface NewCustomer {
  readonly details: CustomerDetails;
  readonly customerNumber: number;
  readonly group: Group;
  readonly status: CustomerStatus;
  readonly reminderCount: number;
  /**
   * The card the customer currently holds — the next one due on their slot for the one handed over
   * with the registration (index 1 only where nobody has held that number before, US-25), counting
   * on with every reissue (US-09). It is an {@link IssuedCard} like any other: a card
   * written with a registration and a card written by `issueCard` are the same thing, and two shapes
   * would let the two paths drift apart.
   */
  readonly card: IssuedCard;
  /**
   * The archived record this registration was pre-filled from, or `null` — which is what almost
   * every registration is (US-11.3).
   *
   * It is **display metadata and nothing else**: no rule in this codebase reads it, and none may
   * start. The returning household is a *new* customer with a new number, a fresh card index and a
   * reminder count of zero; the link says only "we have met these people before", so that a future
   * screen can show the history without the two records ever being merged
   * (tasks/prd-us-11-reuse-archived-record.md §7, FR-5).
   *
   * Nullable rather than optional, so every writer states whether there was a predecessor instead of
   * dropping the link by forgetting the field.
   */
  readonly previousCustomerId: number | null;
}

/**
 * A persisted customer. `id` is the surrogate key and the only identity there is — the customer
 * number is a slot that another household may hold once this one is archived (`customerNumber.ts`).
 */
export interface RegisteredCustomer extends NewCustomer {
  readonly id: number;
  /**
   * Why this customer is currently blocked, or `null` when they are not — non-null *exactly* when
   * `status` is `BLOCKED`. A block's reason is its only current record: it is written the moment the
   * block is applied and cleared the moment it is lifted (US-08). The audit log keeps the history;
   * this field keeps what the counter must show today (US-08, FR-4).
   */
  readonly blockReason: string | null;
  /**
   * Why this household was archived, or `null` while it is not — non-null *exactly* when `status` is
   * `ARCHIVED`. Archiving is always a judgement someone made (US-10, FR-1) and there is no way back
   * out of `ARCHIVED`, so the pair below is written once and never cleared: it is what the archived
   * record shows about itself long after the audit entry has scrolled away.
   */
  readonly archiveReason: string | null;
  /** When the household was archived, or `null` while it is not. Non-null with `archiveReason`. */
  readonly archivedAt: Date | null;
  /**
   * The day the household joined the register — the issue date of their **first** card, because a
   * card is handed over with the registration and there is no registration column (US-01.4). It is
   * derived on read like the counts and the card number, never stored: a reissue writes a new card
   * and must not be able to move a household's start, which is what a stored copy would eventually
   * do. The no-show count needs it, since no distribution before it was ever theirs to attend
   * (tasks/prd-us-10-archive-customer.md §US-10.1).
   */
  readonly registeredOn: Date;
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
 * Validate a household — the rows, and that they are the household of the customer they belong to.
 *
 * It is its own function because a household is edited long after it is first typed (US-16.1), and
 * the edit must be judged by exactly the rules the registration was: a second implementation would
 * be free to let a member through that registration refuses, and the two would drift apart with the
 * first rule that changed.
 *
 * `customer` is a required parameter for that same reason. The registered person *is* one of these
 * rows — everything the counter charges and hands out is derived from them — so a household that
 * does not list them is not their household, and a caller cannot validate one without saying whose
 * it is. Their row is found by what it says, the way {@link replaceHouseholdMember} finds it, and
 * both sides are compared trimmed: the rows are trimmed here, and the customer arrives as they were
 * typed on a form or as they are stored.
 *
 * The rows come back trimmed and **copied**, so a caller that keeps editing the array it passed in
 * cannot reach into the validated household afterwards.
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
  // birthdate that lies after today. The counts themselves are discarded on purpose — they are
  // derived again wherever they are needed and are never part of the record.
  //
  // Before the customer's own row is looked for, deliberately: an empty table is missing them too,
  // and "der Haushalt hat kein Mitglied" is the more useful of the two answers.
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
 * Validate who the customer is and where they live, independent of everything else on their record.
 *
 * Like {@link createHouseholdMembers} this is its own function because the data is edited long after
 * it is first typed (US-16.2), and the edit must be judged by exactly the rules the registration was.
 * A second implementation would be free to accept a name registration refuses, and the two would
 * drift apart with the first rule that changed.
 *
 * @throws {MissingRequiredField} naming the name or address part that was left blank.
 * @throws {BirthDateInFuture} if the customer was born after `today`.
 */
export function createPersonalDetails(input: PersonalDetails, today: Date): PersonalDetails {
  // A household of one can never be empty, so the only rule `composition` can raise here is the one
  // that matters: nobody is born tomorrow. The counts it returns are discarded, as everywhere.
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
 * Validate a free-text note (US-16.3).
 *
 * An empty note is a legitimate answer — unlike a block reason, which is the whole record of a
 * judgement, a note is a convenience and most households need none. What is refused is only a text
 * so long it is no longer a note; the length is measured *after* trimming, so trailing blanks alone
 * can never break the limit.
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

/** Whether two household rows describe the same person — the same name, born the same instant. */
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
 * The registered customer is themselves a household member, so their name and birthdate are on the
 * record twice: once as the person the slot belongs to, and once as a row among the people they live
 * with. Correcting a misspelt name must move both, or the household would go on listing a person who
 * no longer exists beside a customer nobody in the household is (US-16.2).
 *
 * The row is found by *what it says*, because a household row has no identity of its own: two
 * children of the same name and birthdate are two rows and nothing tells them apart. Before the
 * edit, the customer's row is the one holding exactly their old name and birthdate — so that is what
 * is matched, and only the first such row, since one person cannot live in a household twice. When
 * no row says it, the household is returned unchanged: nothing there claims to be the customer, and
 * guessing which row meant them is how an edit rewrites somebody else. Since
 * {@link createHouseholdMembers} refuses a household without the customer in it, that can only be a
 * record written before the rule existed — and repairing it belongs to the household editor, where
 * the missing row can be typed, rather than to a correction of a name.
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
  // The applicant's own data first, and by the same rule a later correction is judged by — because
  // the household is then judged as *theirs*, and it takes their trimmed name to say which row is.
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
