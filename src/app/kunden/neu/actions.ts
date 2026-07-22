"use server";

/**
 * The registration screen's server action — the thin adapter between an HTML form and the
 * `registerCustomer` use case.
 *
 * Its only jobs are to give the submitted strings a shape (Zod), pair the repeated household inputs
 * back into rows, and translate a typed domain error into a German sentence. Every rule about *what
 * is allowed* — which number, which group, whether the household holds together — lives in the
 * domain and the use case; adding one here would be a bug.
 */

import { redirect } from "next/navigation";
import { z } from "zod";
import { registerCustomer } from "@/application/customers/register-customer";
import { parseGroup } from "@/domain/customer/group";
import {
  BirthDateInFuture,
  CustomerNumberTaken,
  EmptyHousehold,
  MissingRequiredField,
  NoFreeCustomerNumber,
} from "@/domain/errors";
import { customerFieldLabel, de } from "@/i18n/de";
import { customerDeps } from "../deps";
import type { RegisterCustomerState } from "./register-customer-state";

/**
 * A calendar day as `<input type="date">` submits it, read as the UTC day it names.
 *
 * The domain compares birthdates as UTC calendar days, so pinning midnight UTC here keeps a date
 * typed in Germany from landing on the day before.
 */
const calendarDay = z.string().transform((value, ctx): Date => {
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

const registrationForm = z.object({
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
  householdMembers: z.array(
    z.object({
      firstName: z.string(),
      lastName: z.string(),
      birthDate: calendarDay,
    }),
  ),
});

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

function formValues(formData: FormData): Record<string, unknown> {
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
    householdMembers: householdRows(formData),
  };
}

/**
 * Turn a typed domain error into the German sentence the screen shows.
 *
 * Every error carries the values that made it fail, so the message can name the concrete field or
 * quota without re-deriving anything here.
 */
function germanMessage(error: unknown): string {
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
 * Validate the form, register the customer with their number, group and first card, and go to the
 * card that was just issued.
 *
 * On any failure nothing is written — the use case allocates and persists in one transaction — and
 * the form comes back with a German explanation.
 */
export async function submitRegistration(
  _previous: RegisterCustomerState,
  formData: FormData,
): Promise<RegisterCustomerState> {
  const parsed = registrationForm.safeParse(formValues(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  const form = parsed.data;

  let id: number;
  try {
    const customer = await registerCustomer(customerDeps, {
      firstName: form.firstName,
      lastName: form.lastName,
      birthDate: form.birthDate,
      address: {
        street: form.street,
        houseNumber: form.houseNumber,
        zip: form.zip,
        city: form.city,
      },
      certificate: { type: form.certificateType, validUntil: form.certificateValidUntil },
      householdMembers: form.householdMembers,
      notes: form.notes,
      group: form.group,
    });
    id = customer.id;
  } catch (error: unknown) {
    return { status: "error", message: germanMessage(error) };
  }

  // Outside the try: `redirect` works by throwing, and catching it here would turn a successful
  // registration into "could not be saved".
  redirect(`/kunden/${id}`);
}
