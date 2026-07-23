/**
 * The state the registration form and its server action pass between them.
 *
 * It lives outside `actions.ts` because a `"use server"` module may export nothing but async
 * functions — everything it exports becomes a callable server endpoint, so a plain object there is
 * a build-time error rather than a style question.
 *
 * There is no `saved` state: a successful registration redirects to the new customer's card, so the
 * only thing the form ever gets back is a rejection.
 */

/** What the form shows after a submission. `idle` is the state before anything was sent. */
export interface RegisterCustomerState {
  readonly status: "idle" | "error";
  readonly message?: string;
}

export const initialRegisterCustomerState: RegisterCustomerState = { status: "idle" };
