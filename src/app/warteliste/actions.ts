"use server";

/**
 * The waiting-list screen's server actions — the thin adapters between its two forms and the use
 * cases behind them (US-12.4).
 *
 * Neither decides anything. That an applicant needs a valid certificate to join (FR-1), that a
 * removal needs a reason (FR-6) and that the row is kept rather than deleted (FR-7) are all settled
 * behind `addToWaitingList` and `removeFromWaitingList`; these functions give the submitted strings
 * a shape and turn a typed domain error into a German sentence.
 *
 * Registering an applicant is deliberately not here — it belongs to the promotion route, because it
 * is a registration and has a whole form of its own.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addToWaitingList } from "@/application/waiting-list/add-to-waiting-list";
import { removeFromWaitingList } from "@/application/waiting-list/remove-from-waiting-list";
import {
  BirthDateInFuture,
  CertificateExpired,
  MissingAuditReason,
  MissingRequiredField,
  WaitingListEntryNotFound,
} from "@/domain/errors";
import { customerFieldLabel, de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { calendarDay, customerErrorField, fieldRefusals } from "../kunden/neu/registration-input";
import { tierOf } from "../notice-tier";
import { waitingListDeps } from "./deps";
import { REMOVED } from "./removed-flag";
import { type AddApplicantState, type RemoveApplicantState } from "./waiting-list-state";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * The application form. It asks for exactly what an entry records (FR-2) and nothing more — no
 * household, no group and no customer number, because none of those is decided until the applicant
 * is actually registered.
 */
const applicationForm = z.object({
  firstName: z.string(),
  lastName: z.string(),
  birthDate: calendarDay,
  street: z.string(),
  houseNumber: z.string(),
  zip: z.string(),
  city: z.string(),
  contactNote: z.string(),
  certificateType: z.string(),
  certificateValidUntil: calendarDay,
});

function applicationValues(formData: FormData): Record<string, unknown> {
  const text = (name: string): string => String(formData.get(name) ?? "");
  return {
    firstName: text("firstName"),
    lastName: text("lastName"),
    birthDate: text("birthDate"),
    street: text("street"),
    houseNumber: text("houseNumber"),
    zip: text("zip"),
    city: text("city"),
    contactNote: text("contactNote"),
    certificateType: text("certificateType"),
    certificateValidUntil: text("certificateValidUntil"),
  };
}

/**
 * Put the applicant on the list.
 *
 * An already-lapsed certificate is reported as its own sentence, naming the day it ran out: it is the
 * one rejection staff will meet at the counter with the applicant standing in front of them, and
 * "bitte prüfen" would not tell them what to ask for.
 */
export async function addApplicantAction(
  previous: AddApplicantState,
  formData: FormData,
): Promise<AddApplicantState> {
  // The one thing a refusal carries over from the last submission, and it is carried by name rather
  // than by spreading `previous`. A spread looks equivalent and is not: a refusal that names no
  // field sets no `fields`, so the marks from the *previous* refusal would ride through it and go on
  // reddening boxes the current answer says nothing about.
  const saved = { savedCount: previous.savedCount };

  const parsed = applicationForm.safeParse(applicationValues(formData));
  if (!parsed.success) {
    // Every refused field, not the first. This form asks for two days — the applicant's birthdate
    // and the day their certificate runs to — and `calendarDay` names neither, because the same
    // three lines read both. „Datum fehlt.“ by the button was the answer to whichever came first in
    // the schema, and staff had no way to tell which box it meant.
    return {
      ...saved,
      ...fieldRefusals(parsed.error, de.waitingList.errors.unknown),
      status: "error",
    };
  }
  const form = parsed.data;

  try {
    await addToWaitingList(waitingListDeps, {
      firstName: form.firstName,
      lastName: form.lastName,
      birthDate: form.birthDate,
      address: {
        street: form.street,
        houseNumber: form.houseNumber,
        zip: form.zip,
        city: form.city,
      },
      contactNote: form.contactNote,
      certificate: { type: form.certificateType, validUntil: form.certificateValidUntil },
    });
  } catch (error: unknown) {
    if (error instanceof CertificateExpired) {
      return {
        ...saved,
        status: "error",
        message: de.waitingList.errors.certificateExpired(germanDate(error.validUntil)),
        tier: tierOf(error),
      };
    }
    if (error instanceof MissingRequiredField) {
      // The sentence is this screen's, the mark is the shared one: nine of the ten inputs here are
      // spelled exactly as the registration spells them, so a blank ZIP names the same box on both.
      const field = customerErrorField(error);
      return {
        ...saved,
        status: "error",
        message: de.customers.errors.missingField(customerFieldLabel(error.field)),
        tier: tierOf(error),
        ...(field === null ? {} : { fields: [field] }),
      };
    }
    if (error instanceof BirthDateInFuture) {
      return {
        ...saved,
        status: "error",
        message: de.customers.errors.birthDateInFuture,
        tier: tierOf(error),
      };
    }
    return {
      ...saved,
      status: "error",
      message: de.waitingList.errors.unknown,
      tier: tierOf(error),
    };
  }

  revalidatePath("/warteliste");
  // Both screens the free-slot banner stands on: the hub (US-17.2) and the home screen.
  revalidatePath("/kunden");
  revalidatePath("/");
  return {
    status: "saved",
    message: de.waitingList.add.saved(`${form.firstName} ${form.lastName}`),
    savedCount: previous.savedCount + 1,
  };
}

/**
 * Take the applicant named by the hidden `entryId` off the list, keeping the reason on the row.
 *
 * The hub and the home screen are revalidated with the list: their banner names whoever is at the
 * head, and a removal is one of the two ways that can change.
 *
 * Then it **redirects**, rather than returning a `saved` state, because the row this was submitted
 * from is what the revalidate takes away — the control and any state it held go with it, which is
 * why this was the worst of the six writes that said nothing: the only evidence was a row missing
 * from a list nobody was looking at. `redirect`
 * throws its own control-flow error, so it is called outside the `try`, where the catch cannot file
 * the navigation as a failed removal.
 */
export async function removeApplicantAction(
  _previous: RemoveApplicantState,
  formData: FormData,
): Promise<RemoveApplicantState> {
  const entryId = surrogateId.safeParse(String(formData.get("entryId") ?? ""));
  if (!entryId.success) {
    return { status: "error", message: de.waitingList.errors.notFound, tier: "error" };
  }

  try {
    await removeFromWaitingList(waitingListDeps, {
      entryId: entryId.data,
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error: unknown) {
    if (error instanceof MissingAuditReason) {
      return { status: "error", message: de.waitingList.errors.missingReason, tier: tierOf(error) };
    }
    if (error instanceof WaitingListEntryNotFound) {
      return { status: "error", message: de.waitingList.errors.notFound, tier: tierOf(error) };
    }
    return { status: "error", message: de.waitingList.errors.unknown, tier: tierOf(error) };
  }

  revalidatePath("/warteliste");
  // Both screens the free-slot banner stands on: the hub (US-17.2) and the home screen.
  revalidatePath("/kunden");
  revalidatePath("/");
  redirect(`/warteliste?${REMOVED}=1`);
}
