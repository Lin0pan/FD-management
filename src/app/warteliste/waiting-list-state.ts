/**
 * The state the waiting-list forms and their server actions pass between them (US-12.4).
 *
 * It lives outside `actions.ts` because a `"use server"` module may export nothing but async
 * functions — everything it exports becomes a callable server endpoint, so a plain object or an
 * interface alias there is a build-time error rather than a style question.
 */

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
 * What the removal control shows. There is no `saved` state: a removal takes the row off the list
 * the page is rendering, so the answer to a successful one is the list without it.
 */
export interface RemoveApplicantState {
  readonly status: "idle" | "error";
  readonly message?: string;
}

export const initialRemoveApplicantState: RemoveApplicantState = { status: "idle" };
