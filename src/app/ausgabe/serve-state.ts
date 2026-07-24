/**
 * The state the counter's serve and correct forms pass to and from their server actions.
 *
 * It lives outside `actions.ts` because a `"use server"` module may export nothing but async
 * functions — a plain type or object there would be a build-time error, not a style question.
 */

/**
 * What the serve form shows after a submission. `recorded` carries the Berlin time the hand-out was
 * stored at, so the confirmation can name it while the number field re-focuses for the next customer.
 */
export type ServeState =
  | { readonly status: "idle" }
  | { readonly status: "recorded"; readonly at: string }
  | { readonly status: "error"; readonly message: string };

export const initialServeState: ServeState = { status: "idle" };

/** What the correction control shows after amending or removing today's record. */
export type CorrectState =
  | { readonly status: "idle" }
  | { readonly status: "saved" }
  | { readonly status: "removed" }
  | { readonly status: "error"; readonly message: string };

export const initialCorrectState: CorrectState = { status: "idle" };

/**
 * What the reminder action shows after a submission. `logged` carries the resulting count so the
 * confirmation can state it immediately, before the revalidated page catches up (US-06.4).
 */
export type ReminderState =
  | { readonly status: "idle" }
  | { readonly status: "logged"; readonly count: number }
  | { readonly status: "error"; readonly message: string };

export const initialReminderState: ReminderState = { status: "idle" };

/** What the renewed-certificate form shows after a submission. */
export type RenewalState =
  | { readonly status: "idle" }
  | { readonly status: "saved" }
  | { readonly status: "error"; readonly message: string };

export const initialRenewalState: RenewalState = { status: "idle" };
