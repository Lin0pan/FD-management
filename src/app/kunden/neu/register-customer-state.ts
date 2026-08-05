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

import type { NoticeTier } from "../../notice-tier";

/** What the form shows after a submission. `idle` is the state before anything was sent. */
export interface RegisterCustomerState {
  readonly status: "idle" | "error";
  readonly message?: string;
  /**
   * Which of the two refusals this is, decided from the typed error (`notice-tier.ts`).
   *
   * Optional for the same reason `message` is: this is a flat interface rather than a discriminated
   * union, so neither field can be required while `idle` shares the shape. The action always sets
   * the two together — a state with a message and no tier does not occur.
   */
  readonly tier?: NoticeTier;
}

export const initialRegisterCustomerState: RegisterCustomerState = { status: "idle" };
