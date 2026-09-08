/**
 * The shape a registration form has on the wire: the Zod schema, the pairing of its household rows,
 * and the German sentence each typed domain error is reported as.
 *
 * Beside the action rather than inside it, because two screens save a registration — the page itself
 * and the waiting-list promotion (US-12.4) — and a second schema is how a field starts being accepted
 * on one and refused on the other. Not a `"use server"` module on purpose: those may export nothing
 * but async functions.
 *
 * Nothing here decides anything, and there is no group among the fields — the number carries it
 * (ADR-017).
 */

import { z } from "zod";
import type { RegistrationDraft } from "@/application/customers/draft-from-archived";
import { formatCalendarDay, isBlankDay, parseCalendarDay } from "@/domain/calendarDay";
import { formatCardNumber } from "@/domain/card/cardNumber";
import {
  BirthDateInFuture,
  CardIndexTaken,
  CardNumberTaken,
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
 * A calendar day as DF type it, read as the UTC day it names — the reading is
 * `src/domain/calendarDay.ts`'s, this only turns its refusal into words. Two answers, not one:
 * blank and unreadable are different mistakes (ADR-013).
 *
 * Like every message here it names no field — the same three lines validate the customer's birthdate,
 * the certificate's date and every household row's. {@link fieldRefusals} names it from the path.
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
 * The slot staff picked (US-24), and with it the group it belongs to (ADR-017).
 *
 * It **must never fall through to `undefined`**, which the use case reads as "the software picks one":
 * the number on screen when `Aufnehmen` was pressed is the number that gets saved, or nothing is. So
 * anything but a positive integer is refused as a missing field.
 *
 * The **only** field the assignment posts — the group radios submit nothing, so a number and a group
 * cannot arrive here disagreeing. Whether the number is still free is `assertFreeNumber`'s question.
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
 * Pair the repeated household inputs back into rows. The row count is the **longest** of the three
 * parallel lists: a row whose birthdate was left blank has to reach the domain and be rejected there
 * rather than vanish on the way.
 *
 * Exported because the record edits the same household with the same fields (US-16.1), and a second
 * reader is how one screen starts dropping a half-typed row the other passes on.
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
    customerNumber: text("customerNumber"),
    previousCustomerId: text("previousCustomerId"),
    householdMembers: householdRows(formData),
  };
}

/**
 * The fields the domain nests and the form flattens: `CustomerDetails` groups the address and the
 * certificate, an HTML form cannot. Fields spelled the same on both sides are not listed —
 * `einstellungen/actions.ts` takes the same shape, for the same reason.
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
 * Everything the schema refused, in one answer — **every** issue, not the first: a form with a day per
 * household member fails in three places at once, and one round trip per field is how a registration
 * takes five submissions. The domain still stops at the first broken rule, and the asymmetry is
 * honest: the schema checks fields independently, a use case checks a household.
 *
 * An issue on a field nobody can see is dropped, and if that is *all* of them the answer becomes
 * `lastWord` at the `error` tier — naming `previousCustomerId` would send staff looking for a box
 * that does not exist (`docs/guideline/ui_styling_guide.md` §7).
 *
 * `lastWord` is the caller's for {@link customerErrorMessage}'s reason: the rules are shared between
 * the screens reading this form, but what to say when *nothing* matched is not.
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
 * The field a typed domain error names, or `null` where it names none — which six of them do not:
 * two are statements about the whole table, one about the register, two about a card run read stale,
 * and `BirthDateInFuture` carries only the date, raised alike for the customer's own birthdate and
 * for every household row. Naming that one needs the error to carry its row; until it does, it stays
 * a summary that marks nothing rather than a mark that guesses.
 *
 * Exported because four screens raise these errors — the registration, the promotion sharing its
 * form, the record's editors (US-16) and the counter's renewal.
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
 * The German sentence for a typed domain error about a *household*, or `null` for anything this layer
 * has no words for. Every error carries the values that made it fail, so the message names a concrete
 * field or card without re-deriving anything.
 *
 * **No fallback, on purpose**: the rules are the same whether broken while registering or while
 * correcting (US-16.2), but what to say when *nothing* matched is the screen's own.
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
  // The two lost card races, and here they part company where the customer-number pair above did
  // not: a spent card number is answered by re-reading the *slot's* run, a taken index by
  // re-reading the *record*. Two moves, so two sentences — one that names the card and one that
  // cannot. Both stay red; the tier is `notice-tier.ts`'s and is read off the code, never off these
  // words.
  if (error instanceof CardNumberTaken) {
    return de.customers.errors.cardNumberTaken(formatCardNumber(error.customerNumber, error.index));
  }
  // Named after `CardNumberTaken` rather than before it because the order is the reader's, not the
  // program's: the two are distinct classes and neither is a subtype of the other.
  if (error instanceof CardIndexTaken) {
    return de.customers.errors.cardIndexTaken;
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
