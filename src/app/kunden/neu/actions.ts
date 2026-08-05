"use server";

/**
 * The registration screen's server action — the thin adapter between an HTML form and the
 * `registerCustomer` use case.
 *
 * Its only jobs are to give the submitted strings a shape (Zod), pair the repeated household inputs
 * back into rows, and translate a typed domain error into a German sentence. All three live in
 * `registration-input.ts` so that the waiting-list promotion reads the same form the same way; every
 * rule about *what is allowed* lives in the domain and the use case, and adding one here would be a
 * bug.
 */

import { redirect } from "next/navigation";
import { registerCustomer } from "@/application/customers/register-customer";
import { tierOf } from "../../notice-tier";
import { customerDeps } from "../deps";
import type { RegisterCustomerState } from "./register-customer-state";
import { germanMessage, registrationForm, registrationValues } from "./registration-input";

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
  const parsed = registrationForm.safeParse(registrationValues(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message, tier: "refusal" };
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
      previousCustomerId: form.previousCustomerId,
    });
    id = customer.id;
  } catch (error: unknown) {
    return { status: "error", message: germanMessage(error), tier: tierOf(error) };
  }

  // Outside the try: `redirect` works by throwing, and catching it here would turn a successful
  // registration into "could not be saved".
  //
  // `?aufgenommen=1` is how the good news survives the redirect: this action never returns on
  // success, so the confirmation cannot be state the form holds — the record page reads the flag and
  // says it instead.
  redirect(`/kunden/${id}?aufgenommen=1`);
}
