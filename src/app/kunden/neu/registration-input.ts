/**
 * The shape a registration form has on the wire: the Zod schema its fields are read with, the way
 * its household rows are paired back together, and the German sentence each typed domain error is
 * reported as.
 *
 * It sits beside the action rather than inside it because there is more than one screen that saves a
 * registration — the registration page itself, and the waiting-list promotion at
 * `/warteliste/[entryId]/registrieren` (US-12.4) — and the two must read the same form the same way.
 * A second schema is how a field starts being accepted on one screen and refused on the other.
 *
 * It is not a `"use server"` module on purpose: such a module may export nothing but async
 * functions, so a schema or a helper there would be a build error rather than a style question.
 *
 * Nothing here decides anything. Which number, which group and whether the household holds together
 * are the domain's and the use case's; this module only gives the submitted strings a shape.
 */

import { z } from "zod";
import type { RegistrationDraft } from "@/application/customers/draft-from-archived";
import { formatCalendarDay, isBlankDay, parseCalendarDay } from "@/domain/calendarDay";
import { parseGroup } from "@/domain/customer/group";
import {
  BirthDateInFuture,
  CertificateValidUntilInPast,
  CustomerNotInHousehold,
  CustomerNumberOutOfRange,
  CustomerNumberTaken,
  EmptyHousehold,
  MissingRequiredField,
  NotesTooLong,
  NoFreeCustomerNumber,
} from "@/domain/errors";
import { customerFieldLabel, customerFormFieldLabel, de } from "@/i18n/de";
import { summarise, type FieldRefusal, type FormRefusal } from "../../field-refusal";
import { tierOf } from "../../notice-tier";
import type { PrefillDraft, PrefillMember } from "./archive-search-state";

/**
 * A calendar day as DF type it — `TT.MM.JJJJ` — read as the UTC day it names.
 *
 * The reading itself is `src/domain/calendarDay.ts`'s; this only turns its refusal into the words
 * shown under the field. Two answers, not one: a field left blank and a field nobody can read are
 * different mistakes, and calling the first a *format* problem is what sent DF looking for a typo
 * that was never there (ADR-013).
 *
 * Like every message in this schema it names no field — it cannot, because the same three lines
 * validate the customer's birthdate, the certificate's date and every household row's. The field is
 * named once, from the issue's own path, in {@link fieldRefusals}.
 */
export const calendarDay = z.string().transform((value, ctx): Date => {
  if (isBlankDay(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: de.customers.errors.dateMissing });
    return z.NEVER;
  }
  try {
    return parseCalendarDay(value);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: de.customers.errors.notADate });
    return z.NEVER;
  }
});

const group = z.string().transform((value, ctx) => {
  try {
    return parseGroup(value);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: de.customers.errors.fieldRequired });
    return z.NEVER;
  }
});

/**
 * The archived record this registration was pre-filled from, or `undefined` when nobody was picked
 * (US-11.3). The field is written by the screen itself, never typed, so a value that is not a
 * surrogate id can only be a tampered request — it is refused rather than quietly dropped, because
 * silently registering the household *without* the link would lose the only account of why two
 * records name the same people.
 */
const previousCustomerId = z.string().transform((value, ctx): number | undefined => {
  if (value === "") {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: de.customers.errors.unknown });
    return z.NEVER;
  }
  return Number(value);
});

/**
 * The slot staff picked in the dropdown (US-24).
 *
 * Every value the form can produce is a positive integer, because the options *are* the free
 * numbers; anything else is a tampered or stale submission and is refused as a missing field. It
 * must never fall through to `undefined`, which the use case reads as „the software picks one“ —
 * the number on screen when `Aufnehmen` was pressed is the number that gets saved, or nothing is.
 *
 * Whether the number is still free is not decided here. That is `assertFreeNumber`'s and the
 * partial unique index's, in that order.
 */
const customerNumber = z.string().transform((value, ctx): number => {
  if (!/^[1-9]\d*$/.test(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: de.customers.errors.fieldRequired });
    return z.NEVER;
  }
  return Number(value);
});

export const registrationForm = z.object({
  firstName: z.string(),
  lastName: z.string(),
  birthDate: calendarDay,
  street: z.string(),
  houseNumber: z.string(),
  zip: z.string(),
  city: z.string(),
  certificateType: z.string(),
  certificateValidUntil: calendarDay,
  notes: z.string(),
  group,
  customerNumber,
  previousCustomerId,
  householdMembers: z.array(
    z.object({
      firstName: z.string(),
      lastName: z.string(),
      birthDate: calendarDay,
    }),
  ),
});

/** The registration as the schema reads it — everything a `registerCustomer` call needs. */
export type RegistrationFormValues = z.infer<typeof registrationForm>;

/**
 * Pair the repeated household inputs back into rows.
 *
 * The three fields of a row arrive as three parallel lists, so the row count is the longest of them
 * — a row whose birthdate was left blank has to reach the domain and be rejected there, not vanish
 * on the way.
 *
 * Exported because the customer record edits the very same household with the very same three
 * repeated fields (US-16.1). A second reader of those fields is how one screen starts dropping a
 * half-typed row that the other passes on.
 */
export function householdRows(formData: FormData): Array<Record<string, string>> {
  const firstNames = formData.getAll("memberFirstName").map(String);
  const lastNames = formData.getAll("memberLastName").map(String);
  const birthDates = formData.getAll("memberBirthDate").map(String);
  const rows = Math.max(firstNames.length, lastNames.length, birthDates.length);

  return Array.from({ length: rows }, (_unused, index) => ({
    firstName: firstNames[index] ?? "",
    lastName: lastNames[index] ?? "",
    birthDate: birthDates[index] ?? "",
  }));
}

/** Every field of the registration form, as strings, ready for {@link registrationForm}. */
export function registrationValues(formData: FormData): Record<string, unknown> {
  const text = (name: string): string => String(formData.get(name) ?? "");
  return {
    firstName: text("firstName"),
    lastName: text("lastName"),
    birthDate: text("birthDate"),
    street: text("street"),
    houseNumber: text("houseNumber"),
    zip: text("zip"),
    city: text("city"),
    certificateType: text("certificateType"),
    certificateValidUntil: text("certificateValidUntil"),
    notes: text("notes"),
    group: text("group"),
    customerNumber: text("customerNumber"),
    previousCustomerId: text("previousCustomerId"),
    householdMembers: householdRows(formData),
  };
}

/**
 * The two fields the domain and the form spell differently, plus the four the domain nests.
 *
 * `CustomerDetails` groups the address and the certificate; an HTML form is flat and `<input name>`
 * cannot be a path, so the form calls them `street` and `certificateType`. Household rows and the
 * three personal fields are spelled the same on both sides and are not listed — the same shape
 * `einstellungen/actions.ts` uses for the settings screen's two nested names, and for the same
 * reason: what the browser can mark is an input.
 */
const DOMAIN_FIELD_PATH: Record<string, string | undefined> = {
  "address.street": "street",
  "address.houseNumber": "houseNumber",
  "address.zip": "zip",
  "address.city": "city",
  "certificate.type": "certificateType",
  "certificate.validUntil": "certificateValidUntil",
};

/** A refusal as a screen that saves customer data reports it. */
export type RegistrationRefusal = FormRefusal;

/** A field to mark, or `null` where nothing on screen carries that path. */
function fieldRefusal(path: string, problem: string): FieldRefusal | null {
  return customerFormFieldLabel(path) === null ? null : { path, problem };
}

/**
 * Everything the schema refused, in one answer.
 *
 * **Every** issue, not the first: the schema reads a day per household member alongside the
 * customer's own and the certificate's, so a form filled in a hurry fails in three places at once
 * and correcting it one round trip per field is how a registration takes five submissions. The
 * domain still refuses one rule at a time — it stops at the first broken — and that asymmetry is
 * honest: the schema checks every field independently, a use case checks a household.
 *
 * An issue on a field nobody can see is dropped, and if that is *all* of them the answer becomes
 * `lastWord` at the `error` tier. The only such field on the registration is `previousCustomerId`,
 * which the screen writes and nobody types: a value that is not a surrogate id there is a tampered
 * request, not a mistyped one, and „Bitte das Feld „previousCustomerId“ prüfen“ would send staff
 * looking for a box that does not exist (`docs/guideline/ui_styling_guide.md` §7).
 *
 * `lastWord` is the caller's for the same reason {@link customerErrorMessage} has no fallback: the
 * rules are shared between the screens that read this form, but what to say when *nothing* matched
 * is not. The registration says the intake could not be saved, the record says the change could not
 * be, the waiting list says the applicant could not be added.
 */
export function fieldRefusals(
  error: z.ZodError,
  lastWord: string = de.customers.errors.unknown,
): RegistrationRefusal {
  const fields = error.issues
    .map((issue) => fieldRefusal(issue.path.join("."), issue.message))
    .filter((refusal): refusal is FieldRefusal => refusal !== null);

  return summarise(fields, lastWord, customerFormFieldLabel);
}

/**
 * The field a typed domain error names, or `null` where it names none.
 *
 * Four of the errors this layer knows are about one value staff typed, and four are not:
 * `EmptyHousehold` and `CustomerNotInHousehold` are statements about the whole table — the second
 * names a person, and the row it wants is the one that is *not* there — `NoFreeCustomerNumber` is
 * about the register, and `BirthDateInFuture` carries only the date — it is raised for the customer's own birthdate and
 * for every household row alike, and nothing on it says which. Naming that one needs the error to
 * carry its row; until it does, it stays a summary that marks nothing rather than a mark that
 * guesses.
 *
 * Exported because four screens raise these errors, not one: the registration, the waiting-list
 * promotion that shares its form, the record's editors (US-16) and the counter's renewal. The
 * sentence has been shared since {@link customerErrorMessage}; the mark had not been, which is how
 * a blank ZIP came to name its field on one screen and no field on the next.
 */
export function customerErrorField(error: unknown): FieldRefusal | null {
  if (error instanceof MissingRequiredField) {
    const path = DOMAIN_FIELD_PATH[error.field] ?? error.field;
    return fieldRefusal(path, de.customers.errors.fieldRequired);
  }
  if (error instanceof NotesTooLong) {
    return fieldRefusal("notes", de.customers.errors.valueTooLong);
  }
  if (error instanceof CustomerNumberTaken || error instanceof CustomerNumberOutOfRange) {
    return fieldRefusal("customerNumber", de.customers.errors.numberUnavailable);
  }
  // The one refusal of the two renewal forms that names a box: the day typed into `gültig bis` has
  // already passed. `certificate.validUntil` is what the domain calls it, and the form calls it
  // `certificateValidUntil` on all four screens that carry it — {@link DOMAIN_FIELD_PATH}'s job.
  if (error instanceof CertificateValidUntilInPast) {
    const path = DOMAIN_FIELD_PATH["certificate.validUntil"] ?? "certificateValidUntil";
    return fieldRefusal(path, de.customers.errors.dateInPast);
  }
  return null;
}

/**
 * The German sentence for a typed domain error about *customer data*, or `null` for anything this
 * layer has no words for.
 *
 * Every error carries the values that made it fail, so the message can name the concrete field or
 * quota without re-deriving anything here.
 *
 * It stops short of a fallback on purpose. The rules it translates — a blank field, a future
 * birthdate, an empty household, an over-long note — are the same whether they were broken while
 * registering a household or while correcting one later (US-16.2), but what to say when *nothing*
 * matched is not: the registration says the intake could not be saved, the record says the change
 * could not be. So each screen supplies its own last word.
 */
export function customerErrorMessage(error: unknown): string | null {
  if (error instanceof MissingRequiredField) {
    return de.customers.errors.missingField(customerFieldLabel(error.field));
  }
  if (error instanceof EmptyHousehold) {
    return de.customers.errors.emptyHousehold;
  }
  if (error instanceof CustomerNotInHousehold) {
    return de.customers.errors.customerNotInHousehold(`${error.firstName} ${error.lastName}`);
  }
  if (error instanceof BirthDateInFuture) {
    return de.customers.errors.birthDateInFuture;
  }
  if (error instanceof NotesTooLong) {
    return de.customers.errors.notesTooLong(error.maxLength, error.length);
  }
  if (error instanceof NoFreeCustomerNumber) {
    return de.customers.errors.noFreeCustomerNumber(error.quotaN);
  }
  // Two codes, one sentence. `CustomerNumberTaken` says somebody won the race for the number and
  // `CustomerNumberOutOfRange` says the quota moved under the open form (US-14), but the staff
  // member's next move is the same either way: pick another number. What the program branches on —
  // the retry in `registerCustomer`, the tier in `notice-tier.ts` — is the code, not this.
  if (error instanceof CustomerNumberTaken || error instanceof CustomerNumberOutOfRange) {
    return de.customers.errors.customerNumberUnavailable(error.customerNumber);
  }
  return null;
}

/** {@link customerErrorMessage} with the registration's own last word for anything unrecognised. */
export function germanMessage(error: unknown): string {
  return customerErrorMessage(error) ?? de.customers.errors.unknown;
}

/**
 * A thrown failure about customer data as a screen shows it — the sentence, the tier decided from
 * the typed error, and the field to mark where the error names one.
 *
 * `lastWord` for the same reason {@link fieldRefusals} takes one: the rules are shared, the sentence
 * for an error nobody has words for is not.
 */
export function germanRefusal(
  error: unknown,
  lastWord: string = de.customers.errors.unknown,
): RegistrationRefusal {
  const field = customerErrorField(error);
  return {
    message: customerErrorMessage(error) ?? lastWord,
    tier: tierOf(error),
    ...(field === null ? {} : { fields: [field] }),
  };
}

function toPrefillMember(member: RegistrationDraft["householdMembers"][number]): PrefillMember {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    birthDate: formatCalendarDay(member.birthDate),
  };
}

/** A registration draft as it crosses to the browser, with every day already written as DF read it. */
export function toPrefillDraft(draft: RegistrationDraft): PrefillDraft {
  return {
    firstName: draft.firstName,
    lastName: draft.lastName,
    birthDate: formatCalendarDay(draft.birthDate),
    street: draft.address.street,
    houseNumber: draft.address.houseNumber,
    zip: draft.address.zip,
    city: draft.address.city,
    householdMembers: draft.householdMembers.map(toPrefillMember),
  };
}
