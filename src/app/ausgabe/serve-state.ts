/**
 * The state the counter's serve and correct forms pass to and from their server actions.
 *
 * It lives outside `actions.ts` because a `"use server"` module may export nothing but async
 * functions — a plain type or object there would be a build-time error, not a style question.
 *
 * Each refusal carries its `tier` beside the sentence: whether the counter is being told a rule said
 * no or that something is wrong is decided from the typed error in the action and cannot be
 * re-derived from the German (`notice-tier.ts`).
 */

import type { FieldRefusal } from "../field-refusal";
import type { NoticeTier } from "../notice-tier";

/**
 * The question an amount above the amount to pay raises, carried back to the form so the notice can
 * name both figures (US-29.7).
 *
 * A status of its own rather than an `error`, because nothing failed: `OverpaymentNotConfirmed` is
 * the use case asking whether the credit was meant. The form re-submits the very same amount with
 * the confirmation flag, so **the rule stays in the use case** and the screen is not the only guard
 * (FR-8) — the browser does no arithmetic of its own to decide whether to ask.
 */
interface ConfirmOverpayment {
  readonly status: "confirmOverpayment";
  /** What was typed, in cents — the amount the second submission will carry unchanged. */
  readonly paidCents: number;
  /** What was asked for: today's amount to pay, or for a correction what was asked on the day. */
  readonly amountToPayCents: number;
}

/**
 * What the serve form shows after a submission. `recorded` carries the Berlin time the hand-out was
 * stored at, so the confirmation can name it while the number field re-focuses for the next customer.
 */
export type ServeState =
  | { readonly status: "idle" }
  | { readonly status: "recorded"; readonly at: string }
  | ConfirmOverpayment
  | { readonly status: "error"; readonly message: string; readonly tier: NoticeTier };

export const initialServeState: ServeState = { status: "idle" };

/**
 * What the correction control shows after amending today's record.
 *
 * There is no `removed`. There used to be, and no component could render it: a removal makes
 * `todaysRecord` null, so the card holding this state unmounts in the same render that would have
 * shown the answer. The removal's confirmation is handed to the page through a redirect instead
 * (`removed-flag.ts`), and what is left here is the pair the card survives to show.
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
       * The fields the refusal names, so the form can mark them (§7). The counter's renewal is the
       * same two boxes as the record's, refused by the same rules, and it marks them the same way.
       *
       * Only one can fail at a time here — the day is read before the type reaches the domain — but
       * it is a list because the shape is shared, and a shape that differed per screen is what let
       * this one go unmarked while the intake next door named every field it refused.
       */
      readonly fields?: ReadonlyArray<FieldRefusal>;
    };

export const initialRenewalState: RenewalState = { status: "idle" };
