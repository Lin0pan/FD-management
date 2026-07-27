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
import { parseGroup } from "@/domain/customer/group";
import {
  BirthDateInFuture,
  CustomerNumberTaken,
  EmptyHousehold,
  MissingRequiredField,
  NoFreeCustomerNumber,
} from "@/domain/errors";
import { customerFieldLabel, de } from "@/i18n/de";
import type { PrefillDraft, PrefillMember } from "./archive-search-state";

/**
 * A calendar day as `<input type="date">` submits it, read as the UTC day it names.
 *
 * The domain compares birthdates as UTC calendar days, so pinning midnight UTC here keeps a date
 * typed in Germany from landing on the day before.
 */
export const calendarDay = z.string().transform((value, ctx): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: de.customers.errors.notADate });
    return z.NEVER;
  }
  return new Date(`${value}T00:00:00.000Z`);
});

const group = z.string().transform((value, ctx) => {
  try {
    return parseGroup(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: de.customers.errors.missingField(de.customers.fields.group),
    });
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
 */
function householdRows(formData: FormData): Array<Record<string, string>> {
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
    previousCustomerId: text("previousCustomerId"),
    householdMembers: householdRows(formData),
  };
}

/**
 * Turn a typed domain error into the German sentence the screen shows.
 *
 * Every error carries the values that made it fail, so the message can name the concrete field or
 * quota without re-deriving anything here.
 */
export function germanMessage(error: unknown): string {
  if (error instanceof MissingRequiredField) {
    return de.customers.errors.missingField(customerFieldLabel(error.field));
  }
  if (error instanceof EmptyHousehold) {
    return de.customers.errors.emptyHousehold;
  }
  if (error instanceof BirthDateInFuture) {
    return de.customers.errors.birthDateInFuture;
  }
  if (error instanceof NoFreeCustomerNumber) {
    return de.customers.errors.noFreeCustomerNumber(error.quotaN);
  }
  if (error instanceof CustomerNumberTaken) {
    return de.customers.errors.customerNumberTaken;
  }
  return de.customers.errors.unknown;
}

/**
 * A calendar day written the way `<input type="date">` reads it.
 *
 * The conversion happens on the server so that a `Date` never has to survive the round trip and be
 * re-read in the browser's own zone, which is how a birthdate lands on the day before.
 */
export function isoDay(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function toPrefillMember(member: RegistrationDraft["householdMembers"][number]): PrefillMember {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    birthDate: isoDay(member.birthDate),
  };
}

/** A registration draft as it crosses to the browser, with every day already written as ISO. */
export function toPrefillDraft(draft: RegistrationDraft): PrefillDraft {
  return {
    firstName: draft.firstName,
    lastName: draft.lastName,
    birthDate: isoDay(draft.birthDate),
    street: draft.address.street,
    houseNumber: draft.address.houseNumber,
    zip: draft.address.zip,
    city: draft.address.city,
    householdMembers: draft.householdMembers.map(toPrefillMember),
  };
}
