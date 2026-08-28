"use server";

/**
 * The counter's write actions — the thin adapters between the counter's forms and the
 * `recordAttendance` / `correctAttendance` use cases (tasks/prd-us-05-record-attendance.md §US-05.4)
 * and the `recordReminder` / `renewCertificate` ones (tasks/prd-us-06-certificate-reminder.md
 * §US-06.4).
 *
 * Their only jobs are to read the handful of fields off the form, call one use case, and translate a
 * typed domain error into a German sentence. Every rule about *whether* a hand-out may be recorded or
 * a record corrected lives in the domain and the use cases — the eligibility re-check, the
 * once-per-day guard and the same-day-only correction are all theirs, not this layer's (FR-8).
 *
 * A `<input type="checkbox">` submits nothing when unchecked, so `paid` is read as the mere presence
 * of the field — the standard HTML-form idiom, and the reason the box is pre-checked in the markup.
 *
 * **The paid checkbox is a bridge, and a temporary one (US-29.4).** A hand-out now records the
 * *amount* a household handed over, and a flag cannot say an amount, so a ticked box is translated
 * here into the figure it has always meant: the amount asked for when a hand-out is recorded, and
 * today's price when one is corrected. US-29.7 replaces the box with the amount field DF are to
 * type into, and both translations go with it.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isBlankDay, parseCalendarDay } from "@/domain/calendarDay";
import { recordReminder } from "@/application/customers/record-reminder";
import { renewCertificate } from "@/application/customers/renew-certificate";
import { correctAttendance } from "@/application/distribution/correct-attendance";
import { recordAttendance } from "@/application/distribution/record-attendance";
import {
  AlreadyServedToday,
  CertificateStillValid,
  CertificateValidUntilInPast,
  DistributionRecordNotFound,
  MissingRequiredField,
  NotClearToServe,
  RecordNoLongerCorrectable,
  ReminderAlreadyLoggedToday,
} from "@/domain/errors";
import { customerFieldLabel, de } from "@/i18n/de";
import { customerErrorField, fieldRefusals } from "../kunden/neu/registration-input";
import { germanTime } from "@/i18n/format";
import { tierOf } from "../notice-tier";
import { counterActionDeps } from "./deps";
import { RECORD_REMOVED } from "./removed-flag";
import type { CorrectState, ReminderState, RenewalState, ServeState } from "./serve-state";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * A whole number of cents as a hidden form field carries it — part of the US-29.4 bridge, and gone
 * with it (US-29.7), by which point the only amount on this form comes from `parseEuros`.
 */
const centsField = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * A calendar day as DF type it — `TT.MM.JJJJ` — read as the UTC day it names.
 *
 * The reading is `src/domain/calendarDay.ts`'s, which is the point: this used to be a second,
 * separate date schema, and its own note admitted the shape check let `2026-13-45` through to an
 * Invalid Date whose NaN then flowed into the certificate arithmetic. One parser, one answer, and a
 * day that is not a day is refused here rather than downstream (ADR-013).
 */
const dayInput = z.string().transform((value, ctx): Date => {
  if (isBlankDay(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: de.distribution.certificate.renewal.errors.dateMissing,
    });
    return z.NEVER;
  }
  try {
    return parseCalendarDay(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: de.distribution.certificate.renewal.errors.notADate,
    });
    return z.NEVER;
  }
});

/**
 * The renewal's one typed field, in an object so its refusal carries a path.
 *
 * A bare `dayInput.safeParse(text)` raises an issue whose `path` is empty, and a path is how a mark
 * finds its box — so the field would have gone unmarked while the message read as if it named one.
 * The name is the registration's, which the record's renewal form now spells too: one box, one
 * spelling, on all four screens that carry it.
 */
const renewalForm = z.object({ certificateValidUntil: dayInput });

/** Turn a typed domain error from the serve path into the German sentence the counter shows. */
function serveMessage(error: unknown): string {
  if (error instanceof AlreadyServedToday) {
    return de.distribution.serve.errors.alreadyServed;
  }
  if (error instanceof NotClearToServe) {
    return de.distribution.serve.errors.notClearToServe;
  }
  return de.distribution.serve.errors.unknown;
}

/** Turn a typed domain error from the correction path into the German sentence the counter shows. */
function correctMessage(error: unknown): string {
  if (error instanceof RecordNoLongerCorrectable) {
    return de.distribution.serve.errors.noLongerCorrectable;
  }
  if (error instanceof DistributionRecordNotFound) {
    return de.distribution.serve.errors.notFound;
  }
  return de.distribution.serve.errors.unknown;
}

/**
 * Record a hand-out for the customer named by the hidden `customerId`, paid unless the box was
 * cleared. On success the page is revalidated so today's record appears in place of the serve action,
 * and the returned time drives the confirmation the form shows while the number field re-focuses.
 */
export async function recordServe(_previous: ServeState, formData: FormData): Promise<ServeState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.distribution.serve.errors.unknown, tier: "error" };
  }

  try {
    const record = await recordAttendance(counterActionDeps, {
      // The US-29.4 bridge: a ticked box is the household handing over what they were asked for,
      // which is what an omitted amount already means, and a cleared one is handing over nothing.
      paidCents: formData.get("paid") !== null ? undefined : 0,
      customerId: customerId.data,
    });
    revalidatePath("/ausgabe");
    return { status: "recorded", at: germanTime(record.date) };
  } catch (error: unknown) {
    return { status: "error", message: serveMessage(error), tier: tierOf(error) };
  }
}

/**
 * Amend or remove today's record. The clicked button names the intent through `action`: `SET_PAYMENT`
 * writes the checkbox's new value, `REMOVE` deletes the record after the form's confirmation step.
 *
 * The two answers leave by different routes, because a removal destroys the card that would show it.
 * `SET_PAYMENT` comes back as `saved` and is read beside the button. `REMOVE` makes `todaysRecord` null,
 * so the whole correction card unmounts and takes the state holding the answer with it — which is
 * why this action's `removed` result was, for its whole life, a branch no component could render.
 * It redirects instead, keeping the number that was looked up so the household stays on screen,
 * and the counter states it above the verdict.
 * `redirect` throws its own control-flow error and so is called outside the `try`.
 */
export async function correctServe(
  _previous: CorrectState,
  formData: FormData,
): Promise<CorrectState> {
  const recordId = surrogateId.safeParse(String(formData.get("recordId") ?? ""));
  if (!recordId.success) {
    return { status: "error", message: de.distribution.serve.errors.notFound, tier: "error" };
  }
  const remove = formData.get("action") === "REMOVE";
  // The other half of the US-29.4 bridge: the ticked box is the day's price handed over, which is
  // what the flag has always meant, and it rides along as a hidden field because the box cannot
  // carry a number of its own.
  const priceCents = centsField.safeParse(String(formData.get("priceCents") ?? ""));
  if (!remove && !priceCents.success) {
    return { status: "error", message: de.distribution.serve.errors.notFound, tier: "error" };
  }

  try {
    await correctAttendance(
      counterActionDeps,
      remove
        ? { recordId: recordId.data, action: "REMOVE" }
        : {
            recordId: recordId.data,
            action: "SET_PAYMENT",
            paidCents: formData.get("paid") !== null && priceCents.success ? priceCents.data : 0,
            // Ticking writes the day's price exactly as it always has. For a household in credit
            // that is more than they were asked for, and the checkbox offers no way to answer the
            // question, so the bridge confirms it rather than refusing a correction it offers.
            overpaymentConfirmed: true,
          },
    );
    revalidatePath("/ausgabe");
  } catch (error: unknown) {
    return { status: "error", message: correctMessage(error), tier: tierOf(error) };
  }

  if (remove) {
    const nummer = String(formData.get("nummer") ?? "");
    redirect(`/ausgabe?nummer=${encodeURIComponent(nummer)}&${RECORD_REMOVED}=1`);
  }
  return { status: "saved" };
}

/** Turn a typed domain error from the reminder path into the German sentence the counter shows. */
function reminderMessage(error: unknown): string {
  if (error instanceof ReminderAlreadyLoggedToday) {
    return de.distribution.certificate.reminder.errors.alreadyLogged;
  }
  if (error instanceof CertificateStillValid) {
    return de.distribution.certificate.reminder.errors.stillValid;
  }
  return de.distribution.certificate.reminder.errors.unknown;
}

/** Turn a typed domain error from the renewal path into the German sentence the counter shows. */
function renewalMessage(error: unknown): string {
  if (error instanceof CertificateValidUntilInPast) {
    return de.distribution.certificate.renewal.errors.validUntilInPast;
  }
  if (error instanceof MissingRequiredField) {
    return de.customers.errors.missingField(customerFieldLabel(error.field));
  }
  return de.distribution.certificate.renewal.errors.unknown;
}

/**
 * A thrown renewal failure as the counter shows it — {@link renewalMessage}, the tier, and the field
 * to mark where the error names one.
 *
 * The sentence is the counter's dictionary and the mark is the shared `customerErrorField`, which is
 * the same division the record's renewal makes: the two forms are the same two boxes refused by the
 * same rules, so a past `gültig bis` reddens `certificateValidUntil` on both.
 */
function renewalRefusal(error: unknown): RenewalState & { status: "error" } {
  const field = customerErrorField(error);
  return {
    status: "error",
    message: renewalMessage(error),
    tier: tierOf(error),
    ...(field === null ? {} : { fields: [field] }),
  };
}

/**
 * Log today's certificate reminder for the customer named by the hidden `customerId`. The rules —
 * something to remind about, at most one per day — live in `recordReminder` and, as the backstop a
 * race cannot pass, in the database's unique day constraint; this action only relays the resulting
 * count or the refusal. On success the page revalidates, so the count beside the expiry status and
 * the disabled state of the button both come back from the store, not from client memory.
 */
export async function logReminder(
  _previous: ReminderState,
  formData: FormData,
): Promise<ReminderState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return {
      status: "error",
      message: de.distribution.certificate.reminder.errors.unknown,
      tier: "error",
    };
  }

  try {
    const count = await recordReminder(counterActionDeps, { customerId: customerId.data });
    revalidatePath("/ausgabe");
    return { status: "logged", count };
  } catch (error: unknown) {
    return { status: "error", message: reminderMessage(error), tier: tierOf(error) };
  }
}

/**
 * Record the renewed certificate the reminders asked for. The renewal and the reset of the count to
 * zero are one transaction behind `renewCertificate`; on success the page revalidates, so the screen
 * shows the count of 0 and the certificate's new end date from the store.
 */
export async function recordRenewal(
  _previous: RenewalState,
  formData: FormData,
): Promise<RenewalState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return {
      status: "error",
      message: de.distribution.certificate.renewal.errors.unknown,
      tier: "error",
    };
  }
  const validUntil = renewalForm.safeParse({
    certificateValidUntil: String(formData.get("certificateValidUntil") ?? ""),
  });
  if (!validUntil.success) {
    // The schema already decided whether the field was blank or unreadable; repeating a blanket
    // "not a date" here would throw that away and tell half of DF the wrong thing. It says so *at
    // the field* now as well as by the button — this is the only box the parse can be about, and
    // saying which one is what every other form on the app does.
    return {
      status: "error",
      ...fieldRefusals(validUntil.error, de.distribution.certificate.renewal.errors.unknown),
    };
  }

  try {
    await renewCertificate(counterActionDeps, {
      customerId: customerId.data,
      type: String(formData.get("certificateType") ?? ""),
      validUntil: validUntil.data.certificateValidUntil,
    });
    revalidatePath("/ausgabe");
    return { status: "saved" };
  } catch (error: unknown) {
    return renewalRefusal(error);
  }
}
