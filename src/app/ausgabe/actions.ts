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
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
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
import { germanTime } from "@/i18n/format";
import { counterActionDeps } from "./deps";
import type { CorrectState, ReminderState, RenewalState, ServeState } from "./serve-state";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * A calendar day as `<input type="date">` submits it, read as the UTC day it names — the same
 * reading the page gives its lookup date, and for the same reason: the shape check alone lets
 * `2026-13-45` through as an Invalid Date.
 */
const dayInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value): Date => new Date(`${value}T00:00:00.000Z`))
  .refine((date): boolean => !Number.isNaN(date.getTime()));

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
    return { status: "error", message: de.distribution.serve.errors.unknown };
  }

  try {
    const record = await recordAttendance(counterActionDeps, {
      customerId: customerId.data,
      paid: formData.get("paid") !== null,
    });
    revalidatePath("/ausgabe");
    return { status: "recorded", at: germanTime(record.date) };
  } catch (error: unknown) {
    return { status: "error", message: serveMessage(error) };
  }
}

/**
 * Amend or remove today's record. The clicked button names the intent through `action`: `SET_PAID`
 * writes the checkbox's new value, `REMOVE` deletes the record after the form's confirmation step.
 */
export async function correctServe(
  _previous: CorrectState,
  formData: FormData,
): Promise<CorrectState> {
  const recordId = surrogateId.safeParse(String(formData.get("recordId") ?? ""));
  if (!recordId.success) {
    return { status: "error", message: de.distribution.serve.errors.notFound };
  }
  const remove = formData.get("action") === "REMOVE";

  try {
    await correctAttendance(
      counterActionDeps,
      remove
        ? { recordId: recordId.data, action: "REMOVE" }
        : { recordId: recordId.data, action: "SET_PAID", paid: formData.get("paid") !== null },
    );
    revalidatePath("/ausgabe");
    return { status: remove ? "removed" : "saved" };
  } catch (error: unknown) {
    return { status: "error", message: correctMessage(error) };
  }
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
    return { status: "error", message: de.distribution.certificate.reminder.errors.unknown };
  }

  try {
    const count = await recordReminder(counterActionDeps, { customerId: customerId.data });
    revalidatePath("/ausgabe");
    return { status: "logged", count };
  } catch (error: unknown) {
    return { status: "error", message: reminderMessage(error) };
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
    return { status: "error", message: de.distribution.certificate.renewal.errors.unknown };
  }
  const validUntil = dayInput.safeParse(String(formData.get("validUntil") ?? ""));
  if (!validUntil.success) {
    return { status: "error", message: de.distribution.certificate.renewal.errors.notADate };
  }

  try {
    await renewCertificate(counterActionDeps, {
      customerId: customerId.data,
      type: String(formData.get("type") ?? ""),
      validUntil: validUntil.data,
    });
    revalidatePath("/ausgabe");
    return { status: "saved" };
  } catch (error: unknown) {
    return { status: "error", message: renewalMessage(error) };
  }
}
