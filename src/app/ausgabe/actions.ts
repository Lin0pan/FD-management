"use server";

/**
 * The counter's write actions — thin adapters between its forms and the `recordAttendance` /
 * `correctAttendance` (US-05.4) and `recordReminder` / `renewCertificate` (US-06.4) use cases.
 *
 * They read fields, call one use case and translate a typed domain error. Every rule about *whether*
 * a hand-out may be recorded lives below (FR-8).
 *
 * The one non-id value here is the **amount** (US-29.7). `parseEuros` turns text into money at this
 * boundary, so an unreadable amount is answered with a sentence about the field rather than an
 * exception three layers down — but it is not the guard: both use cases check again with
 * `requirePayment`.
 *
 * An amount **above** what was asked is deliberately not this layer's to judge: the submission goes
 * without a confirmation, and `OverpaymentNotConfirmed` comes back as the `confirmOverpayment` state
 * the form turns into a question.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isBlankDay, parseCalendarDay } from "@/domain/calendarDay";
import { recordReminder } from "@/application/customers/record-reminder";
import { renewCertificate } from "@/application/customers/renew-certificate";
import {
  correctAttendance,
  type CorrectAttendanceInput,
} from "@/application/distribution/correct-attendance";
import { recordAttendance } from "@/application/distribution/record-attendance";
import {
  AlreadyServedToday,
  CertificateStillValid,
  CertificateValidUntilInPast,
  DistributionRecordNotFound,
  MissingRequiredField,
  NotClearToServe,
  OverpaymentNotConfirmed,
  RecordNoLongerCorrectable,
  ReminderAlreadyLoggedToday,
} from "@/domain/errors";
import { parseEuros, type Cents } from "@/domain/money";
import { customerFieldLabel, de } from "@/i18n/de";
import { customerErrorField, fieldRefusals } from "../kunden/neu/registration-input";
import { tierOf } from "../notice-tier";
import { counterActionDeps } from "./deps";
import { RECORD_REMOVED } from "./removed-flag";
import { HANDOUT_RECORDED } from "./served-flag";
import type { CorrectState, ReminderState, RenewalState, ServeState } from "./serve-state";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * A **customer number** as the serve form's hidden field carries it. The same shape as
 * {@link surrogateId} and deliberately not the same name: one says which row was written, the other
 * which household was served, and the counter needs both in one action.
 */
const customerNumberField = surrogateId;

/**
 * The amount a household handed over, as DF type it: `4`, `4,00` or `4.00`, all 400 cents. `null`
 * for anything that is not an amount — the caller has one sentence to say about any of it, so
 * `InvalidEuroAmount` becomes a `null` rather than a typed refusal flattened two frames later.
 *
 * Not a Zod schema: there is no shape to describe, only a reader that exists. The use cases check
 * again with `requirePayment`, so this is the form's convenience, not the system's guard (US-29.4).
 */
function amountFrom(formData: FormData): Cents | null {
  try {
    return parseEuros(String(formData.get("betrag") ?? ""));
  } catch {
    return null;
  }
}

/**
 * That the overpayment question was answered by pressing confirm. Read as the field's mere
 * *presence*: the confirm button is a second submit inside the same form, so it re-sends the typed
 * amount and this flag where the ordinary button sends only the amount.
 */
function confirmed(formData: FormData): boolean {
  return formData.get("overpaymentConfirmed") !== null;
}

/**
 * A calendar day as DF type it, read by `src/domain/calendarDay.ts` — one parser, one answer, so a
 * day that is not a day is refused here rather than reaching the certificate arithmetic as an
 * Invalid Date (ADR-013).
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
 * The renewal's one typed field, in an object so its refusal carries a path — a bare
 * `safeParse(text)` raises an issue whose `path` is empty, and a path is how a mark finds its box.
 * The name is the registration's: one box, one spelling, on all four screens that carry it.
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
 * Record a hand-out for the customer named by the hidden `customerId`.
 *
 * **Only a success navigates**: a served household is finished business and the next person is
 * already at the counter, so the write revalidates and redirects to the counter's initial state
 * (`served-flag.ts`, US-32.7). `redirect` signals by throwing, so it is called **outside** the `try`
 * — inside it, this action's own `catch` would report the navigation as a failed write.
 *
 * An overpayment comes back as `confirmOverpayment` and a refusal as `error`; both leave the
 * household on screen, nothing being cleared while an answer is owed.
 */
export async function recordServe(_previous: ServeState, formData: FormData): Promise<ServeState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.distribution.serve.errors.unknown, tier: "error" };
  }
  const paidCents = amountFrom(formData);
  if (paidCents === null) {
    // A refusal and not an error: nothing is wrong with the installation, somebody typed something
    // the field cannot read.
    return {
      status: "error",
      message: de.distribution.serve.errors.notAnAmount,
      tier: "refusal",
    };
  }

  try {
    await recordAttendance(counterActionDeps, {
      customerId: customerId.data,
      paidCents,
      overpaymentConfirmed: confirmed(formData),
    });
    revalidatePath("/ausgabe");
  } catch (error: unknown) {
    if (error instanceof OverpaymentNotConfirmed) {
      return {
        status: "confirmOverpayment",
        paidCents: error.paidCents,
        amountToPayCents: error.amountToPayCents,
      };
    }
    return { status: "error", message: serveMessage(error), tier: tierOf(error) };
  }

  // The **household's** number, not the raw query, so a lookup by `50k3` lands the confirmation on
  // 50. Deliberately not called `nummer`, which on the correction form means the typed query.
  //
  // Parsed rather than passed on: a value that is not a customer number cannot name a household, so
  // the redirect goes to the bare counter and the hand-out — already written — is confirmed by the
  // rising group tally instead. Not an `error`: reporting one would claim the write failed.
  const customerNumber = customerNumberField.safeParse(String(formData.get("kundennummer") ?? ""));
  redirect(
    customerNumber.success ? `/ausgabe?${HANDOUT_RECORDED}=${customerNumber.data}` : "/ausgabe",
  );
}

/**
 * Amend or remove today's record; the clicked button names the intent through `action`.
 *
 * **The two answers leave by different routes, because a removal destroys the card that would show
 * it.** `SET_PAYMENT` comes back as `saved`, read beside the button. `REMOVE` makes `todaysRecord`
 * null, so the correction card unmounts and takes the state holding the answer with it — so it
 * redirects instead, keeping the looked-up number, and the counter states it above the verdict.
 * `redirect` throws, so it is called outside the `try`.
 */
export async function correctServe(
  _previous: CorrectState,
  formData: FormData,
): Promise<CorrectState> {
  const recordId = surrogateId.safeParse(String(formData.get("recordId") ?? ""));
  if (!recordId.success) {
    return { status: "error", message: de.distribution.serve.errors.notFound, tier: "error" };
  }
  // Read apart before anything is called, because only one has an amount: the removal button sits
  // inside the same form, and parsing what it never uses would refuse a removal over a typo.
  let intent: CorrectAttendanceInput;
  if (formData.get("action") === "REMOVE") {
    intent = { recordId: recordId.data, action: "REMOVE" };
  } else {
    const paidCents = amountFrom(formData);
    if (paidCents === null) {
      return {
        status: "error",
        message: de.distribution.serve.errors.notAnAmount,
        tier: "refusal",
      };
    }
    intent = {
      recordId: recordId.data,
      action: "SET_PAYMENT",
      paidCents,
      overpaymentConfirmed: confirmed(formData),
    };
  }

  try {
    await correctAttendance(counterActionDeps, intent);
    revalidatePath("/ausgabe");
  } catch (error: unknown) {
    if (error instanceof OverpaymentNotConfirmed) {
      return {
        status: "confirmOverpayment",
        paidCents: error.paidCents,
        amountToPayCents: error.amountToPayCents,
      };
    }
    return { status: "error", message: correctMessage(error), tier: tierOf(error) };
  }

  if (intent.action === "REMOVE") {
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
 * A thrown renewal failure as the counter shows it. The sentence is the counter's dictionary and the
 * mark is the shared `customerErrorField` — the record's renewal makes the same division, the two
 * forms being the same two boxes refused by the same rules.
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
 * Log today's certificate reminder. The rules live in `recordReminder` and in the database's unique
 * day constraint; this only relays the resulting count or the refusal. The page revalidates, so the
 * count and the button's disabled state come back from the store, not from client memory.
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
 * Record the renewed certificate. The renewal and the reset of the count are one transaction behind
 * `renewCertificate`; the page revalidates, so both come back from the store.
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
    // The schema already decided whether the field was blank or unreadable; a blanket "not a date"
    // here would throw that away (ADR-013).
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
