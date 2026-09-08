"use server";

/**
 * The waiting-list screen's server actions — adapters between its two forms and the use cases behind
 * them (US-12.4). Neither decides anything: the certificate bar (FR-1), the required reason (FR-6)
 * and the retention (FR-7) are all settled below.
 *
 * Registering an applicant is deliberately not here — it belongs to the promotion route, being a
 * registration with a whole form of its own.
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
 * The application form: exactly what an entry records (FR-2) and nothing more — no household, no
 * group, no customer number, none of which is decided until the applicant is registered.
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
 * Put the applicant on the list. A lapsed certificate gets its own sentence naming the day it ran out:
 * it is the one rejection met with the applicant standing there, and „bitte prüfen“ would not say
 * what to ask for.
 */
export async function addApplicantAction(
  previous: AddApplicantState,
  formData: FormData,
): Promise<AddApplicantState> {
  // Carried by name rather than by spreading `previous`, which looks equivalent and is not: a
  // refusal naming no field sets no `fields`, so the previous refusal's marks would ride through and
  // go on reddening boxes the current answer says nothing about.
  const saved = { savedCount: previous.savedCount };

  const parsed = applicationForm.safeParse(applicationValues(formData));
  if (!parsed.success) {
    // Every refused field, not the first: this form asks for two days and `calendarDay` names
    // neither, so a single answer by the button would not say which box it meant.
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
      // The sentence is this screen's, the mark the shared one: nine of the ten inputs are spelled as
      // the registration spells them, so a blank ZIP names the same box on both.
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
  // The hub, which counts the queue and marks a free slot in its badge (US-17.2, US-18.2). Not the
  // home screen any more: it carried the free-slot banner until US-18.3 took the banner off both, and
  // `src/app/page.tsx` now renders the week colour and nothing else.
  revalidatePath("/kunden");
  return {
    status: "saved",
    message: de.waitingList.add.saved(`${form.firstName} ${form.lastName}`),
    savedCount: previous.savedCount + 1,
  };
}

/**
 * Take the applicant named by the hidden `entryId` off the list, keeping the reason on the row.
 *
 * It **redirects** rather than returning a `saved` state, because the revalidate takes away the row
 * this was submitted from — the control and any state it held go with it. `redirect` throws its own
 * control-flow error, so it is called outside the `try`.
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
  // The hub, which counts the queue and marks a free slot in its badge (US-17.2, US-18.2). Not the
  // home screen any more: it carried the free-slot banner until US-18.3 took the banner off both, and
  // `src/app/page.tsx` now renders the week colour and nothing else.
  revalidatePath("/kunden");
  redirect(`/warteliste?${REMOVED}=1`);
}
