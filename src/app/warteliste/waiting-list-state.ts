/**
 * The state the waiting-list forms and their server actions pass between them (US-12.4).
 *
 * It lives outside `actions.ts` because a `"use server"` module may export nothing but async
 * functions — everything it exports becomes a callable server endpoint, so a plain object or an
 * interface alias there is a build-time error rather than a style question.
 */

import type { FieldRefusal } from "../field-refusal";
import type { NoticeTier } from "../notice-tier";

/**
 * What the "auf die Warteliste setzen" form shows after a submission.
 *
 * `saved` names the applicant rather than just reporting success: the form clears itself on the way
 * back, and a bare "gespeichert" would leave staff with no way to tell whether the entry that was
 * saved is the one they typed.
 */
export interface AddApplicantState {
  readonly status: "idle" | "saved" | "error";
  readonly message?: string;
  /**
   * Which of the two refusals this is, decided from the typed error (`notice-tier.ts`).
   *
   * Optional for the same reason `message` is: this is a flat interface rather than a discriminated
   * union, so neither field can be required while `idle` and `saved` share the shape. The action
   * always sets the two together.
   */
  readonly tier?: NoticeTier;
  /**
   * The fields the refusal names, where it names any, so the form can mark each one and put the
   * words beside it (`docs/guideline/ui_styling_guide.md` §7).
   *
   * A list, because this form carries **two** day fields — the applicant's birthdate and the day
   * their certificate runs to — and the shared `calendarDay` schema names neither in its own
   * message. „Datum fehlt.“ under the button was therefore the answer to two different questions,
   * and only ever reported the first of them.
   *
   * Absent on the refusals that name no field: an expired certificate is a fact about the document
   * the applicant brought, not about the box the day was typed into, and `birthDateInFuture` carries
   * only a date.
   */
  readonly fields?: ReadonlyArray<FieldRefusal>;
  /**
   * How many applicants this form has saved. The form remounts its fields whenever the count goes
   * up, which is how it comes back empty for the next applicant.
   *
   * It is counted here rather than in the form because a *second* applicant with the same name would
   * otherwise produce an identical state, and a form that resets on a value that did not change is a
   * form that keeps the previous applicant's address.
   */
  readonly savedCount: number;
}

export const initialAddApplicantState: AddApplicantState = { status: "idle", savedCount: 0 };

/**
 * What the removal control shows. There is no `saved` state and there cannot be one: a removal takes
 * the row off the list, and this control with it. The successful answer is handed to the page
 * instead, through the redirect in `actions.ts` — a rejection is the only one that has anywhere to
 * be read, because a rejection is the answer that leaves the row standing.
 */
export interface RemoveApplicantState {
  readonly status: "idle" | "error";
  readonly message?: string;
  /** Which of the two refusals this is — see {@link AddApplicantState.tier}. */
  readonly tier?: NoticeTier;
}

export const initialRemoveApplicantState: RemoveApplicantState = { status: "idle" };
