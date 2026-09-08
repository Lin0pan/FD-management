/**
 * The state the counter's serve and correct forms pass to and from their server actions. Outside
 * `actions.ts` because a `"use server"` module may export nothing but async functions.
 *
 * Each refusal carries its `tier` beside the sentence, decided from the typed error and never
 * re-derived from the German (`notice-tier.ts`).
 */

import type { FieldRefusal } from "../field-refusal";
import type { NoticeTier } from "../notice-tier";

/**
 * The question an amount above the amount to pay raises, carried back so the notice can name both
 * figures (US-29.7). A status of its own rather than an `error`, because nothing failed: the form
 * re-submits the same amount with the confirmation flag, so **the rule stays in the use case** and
 * the browser does no arithmetic of its own (FR-8).
 */
interface ConfirmOverpayment {
  readonly status: "confirmOverpayment";
  /** What was typed, in cents — the amount the second submission will carry unchanged. */
  readonly paidCents: number;
  /** What was asked for: today's amount to pay, or for a correction what was asked on the day. */
  readonly amountToPayCents: number;
}

/**
 * What the serve form shows after a submission — a question or a refusal, and nothing else. There is
 * no `recorded`, for `CorrectState`'s reason: a successful hand-out navigates (`served-flag.ts`), so
 * the state that would hold the answer is unmounted with the form (US-32.7).
 */
export type ServeState =
  | { readonly status: "idle" }
  | ConfirmOverpayment
  | { readonly status: "error"; readonly message: string; readonly tier: NoticeTier };

export const initialServeState: ServeState = { status: "idle" };

/**
 * What the correction control shows after amending today's record. There is no `removed`: a removal
 * makes `todaysRecord` null, so the card holding this state unmounts in the same render that would
 * have shown the answer, and the confirmation goes through a redirect instead (`removed-flag.ts`).
 */
export type CorrectState =
  | { readonly status: "idle" }
  | { readonly status: "saved" }
  | ConfirmOverpayment
  | { readonly status: "error"; readonly message: string; readonly tier: NoticeTier };

export const initialCorrectState: CorrectState = { status: "idle" };

/**
 * What the reminder action shows after a submission. `logged` carries the resulting count so the
 * confirmation can state it immediately, before the revalidated page catches up (US-06.4).
 */
export type ReminderState =
  | { readonly status: "idle" }
  | { readonly status: "logged"; readonly count: number }
  | { readonly status: "error"; readonly message: string; readonly tier: NoticeTier };

export const initialReminderState: ReminderState = { status: "idle" };

/** What the renewed-certificate form shows after a submission. */
export type RenewalState =
  | { readonly status: "idle" }
  | { readonly status: "saved" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly tier: NoticeTier;
      /**
       * The fields the refusal names, so the form can mark them (§7) — the same two boxes as the
       * record's renewal, refused by the same rules. A list because the shape is shared, though only
       * one can fail at a time here.
       */
      readonly fields?: ReadonlyArray<FieldRefusal>;
    };

export const initialRenewalState: RenewalState = { status: "idle" };
