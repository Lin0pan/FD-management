"use server";

/**
 * The registration screen's server action — the thin adapter between an HTML form and the
 * `registerCustomer` use case.
 *
 * Its only jobs are to give the submitted strings a shape (Zod), pair the repeated household inputs
 * back into rows, and turn a refusal into what the screen shows — the German sentence, the tier, and
 * the fields to mark. All of it lives in `registration-input.ts` so that the waiting-list promotion
 * reads the same form the same way; every rule about *what is allowed* lives in the domain and the
 * use case, and adding one here would be a bug.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registerCustomer } from "@/application/customers/register-customer";
import { customerDeps } from "../deps";
import { freshPoolAfterRace } from "./fresh-pool";
import type { RegisterCustomerState } from "./register-customer-state";
import {
  fieldRefusals,
  germanRefusal,
  registrationForm,
  registrationValues,
} from "./registration-input";

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
    return { status: "error", ...fieldRefusals(parsed.error) };
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
      customerNumber: form.customerNumber,
      previousCustomerId: form.previousCustomerId,
    });
    id = customer.id;
  } catch (error: unknown) {
    return {
      status: "error",
      ...germanRefusal(error),
      ...(await freshPoolAfterRace(customerDeps, error)),
    };
  }

  // The hub, which a registration moves three ways at once: the household is a new row in the
  // register, the group balance has shifted, and the lowest free customer number the free-slot badge
  // reads is no longer free. Like every other write in the codebase, this one names the screens that
  // count what it changed — a `redirect` is a navigation, not a revalidation.
  revalidatePath("/kunden");

  // Outside the try: `redirect` works by throwing, and catching it here would turn a successful
  // registration into "could not be saved".
  //
  // `?aufgenommen=1` is how the good news survives the redirect: this action never returns on
  // success, so the confirmation cannot be state the form holds — the record page reads the flag and
  // says it instead.
  redirect(`/kunden/${id}?aufgenommen=1`);
}
