/**
 * The state the waiting-list forms and their server actions pass between them (US-12.4). Outside
 * `actions.ts` because a `"use server"` module may export nothing but async functions.
 */

import type { FieldRefusal } from "../field-refusal";
import type { NoticeTier } from "../notice-tier";

/**
 * What the "auf die Warteliste setzen" form shows after a submission. `saved` names the applicant:
 * the form clears itself on the way back, so a bare „gespeichert“ would leave no way to tell whether
 * the entry saved is the one that was typed.
 */
export interface AddApplicantState {
  readonly status: "idle" | "saved" | "error";
  readonly message?: string;
  /**
   * Which of the two refusals this is, from the typed error (`notice-tier.ts`). Optional because this
   * is a flat interface rather than a union; the action always sets it with `message`.
   */
  readonly tier?: NoticeTier;
  /**
   * The fields the refusal names, so the form can mark each (`docs/guideline/ui_styling_guide.md` §7).
   * A list, because this form carries **two** day fields and the shared `calendarDay` schema names
   * neither.
   *
   * Absent where a refusal names no field: an expired certificate is a fact about the document the
   * applicant brought, not about the box the day was typed into.
   */
  readonly fields?: ReadonlyArray<FieldRefusal>;
  /**
   * How many applicants this form has saved — the key it remounts its fields on. Counted here because
   * a *second* applicant with the same name would otherwise produce an identical state, and a form
   * that resets on an unchanged value keeps the previous applicant's address.
   */
  readonly savedCount: number;
}

export const initialAddApplicantState: AddApplicantState = { status: "idle", savedCount: 0 };

/**
 * What the removal control shows. There is no `saved` state and cannot be: a removal takes the row —
 * and this control — off the list, so the successful answer goes through the redirect in
 * `actions.ts`. A rejection is the only answer that leaves the row standing to be read on.
 */
export interface RemoveApplicantState {
  readonly status: "idle" | "error";
  readonly message?: string;
  /** Which of the two refusals this is — see {@link AddApplicantState.tier}. */
  readonly tier?: NoticeTier;
}

export const initialRemoveApplicantState: RemoveApplicantState = { status: "idle" };
