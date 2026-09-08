"use server";

/**
 * The registration screen's server action — the adapter between an HTML form and `registerCustomer`.
 * The shaping lives in `registration-input.ts`, so the waiting-list promotion reads the same form the
 * same way. Every rule about *what is allowed* lives below; adding one here would be a bug.
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
 * Validate the form, register the customer with their number and first card, and go to the record.
 * On any failure nothing is written, the use case allocating and persisting in one transaction.
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

  // The hub, which a registration moves three ways at once: a new row, a shifted group balance, and
  // one fewer free number for the badge to read. A `redirect` is a navigation, not a revalidation.
  revalidatePath("/kunden");

  // Outside the try: `redirect` throws, and catching it would turn a successful registration into
  // "could not be saved". `?aufgenommen=1` is how the good news survives it — this action never
  // returns on success, so the confirmation cannot be state the form holds.
  redirect(`/kunden/${id}?aufgenommen=1`);
}
