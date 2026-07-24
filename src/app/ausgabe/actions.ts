"use server";

/**
 * The counter's write actions — the thin adapters between the serve/correct forms and the
 * `recordAttendance` / `correctAttendance` use cases (tasks/prd-us-05-record-attendance.md §US-05.4).
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
import { correctAttendance } from "@/application/distribution/correct-attendance";
import { recordAttendance } from "@/application/distribution/record-attendance";
import {
  AlreadyServedToday,
  DistributionRecordNotFound,
  NotClearToServe,
  RecordNoLongerCorrectable,
} from "@/domain/errors";
import { de } from "@/i18n/de";
import { germanTime } from "@/i18n/format";
import { counterActionDeps } from "./deps";
import type { CorrectState, ServeState } from "./serve-state";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

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
