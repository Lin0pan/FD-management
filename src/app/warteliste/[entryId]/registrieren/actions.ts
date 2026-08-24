"use server";

/**
 * The promotion form's server action — registering an applicant off the waiting list (US-12.4).
 *
 * It reads the form exactly as the registration screen does, sharing the schema in
 * `registration-input.ts`, and then calls **one** use case: `registerFromWaitingList`. It
 * deliberately does not call `registerCustomer` and then a removal of its own. The order of those two
 * — customer first, entry cleared only once the registration has landed — is the guarantee the whole
 * feature rests on (FR-7), and "remember to do B after A" is exactly what a screen forgets.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { registerFromWaitingList } from "@/application/waiting-list/register-from-waiting-list";
import { WaitingListEntryNotFound } from "@/domain/errors";
import { de } from "@/i18n/de";
import { freshPoolAfterRace } from "@/app/kunden/neu/fresh-pool";
import type { RegisterCustomerState } from "@/app/kunden/neu/register-customer-state";
import {
  fieldRefusals,
  germanRefusal,
  registrationForm,
  registrationValues,
} from "@/app/kunden/neu/registration-input";
import { tierOf } from "../../../notice-tier";
import { waitingListDeps } from "../../deps";

/** The entry as the hidden field carries it — written by the screen, never typed. */
const entryId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * Validate the form, register the applicant with their number, group and first card, take them off
 * the waiting list, and go to the record that was just created.
 *
 * A rejection leaves both the register and the list exactly as they were, so staff can correct the
 * form and try again with the applicant's place intact.
 */
export async function submitPromotedRegistration(
  _previous: RegisterCustomerState,
  formData: FormData,
): Promise<RegisterCustomerState> {
  const entry = entryId.safeParse(String(formData.get("entryId") ?? ""));
  if (!entry.success) {
    return { status: "error", message: de.waitingList.errors.notFound, tier: "error" };
  }

  const parsed = registrationForm.safeParse(registrationValues(formData));
  if (!parsed.success) {
    return { status: "error", ...fieldRefusals(parsed.error) };
  }
  const form = parsed.data;

  let id: number;
  try {
    const customer = await registerFromWaitingList(waitingListDeps, {
      entryId: entry.data,
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
    if (error instanceof WaitingListEntryNotFound) {
      return { status: "error", message: de.waitingList.errors.notFound, tier: tierOf(error) };
    }
    return {
      status: "error",
      ...germanRefusal(error),
      ...(await freshPoolAfterRace(waitingListDeps, error)),
    };
  }

  // Both screens this moves, because a promotion is two changes in one transaction: the applicant is
  // off the queue, and the register has a household, a shifted group balance and one customer number
  // fewer to give out. `removeApplicantAction` names the first of those for the removal alone; this
  // is the same removal.
  revalidatePath("/warteliste");
  revalidatePath("/kunden");

  // Outside the try: `redirect` works by throwing, and catching it here would turn a successful
  // registration into "could not be saved".
  //
  // The same `?aufgenommen=1` the registration screen sends: promoting an applicant *is* taking a
  // household on, so it lands on the same record wearing the same confirmation.
  redirect(`/kunden/${id}?aufgenommen=1`);
}
