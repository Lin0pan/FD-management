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

import type { FieldRefusal } from "../../field-refusal";
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
  /**
   * The fields the refusal names, where it names any, so the form can mark each one and put the
   * words beside it.
   *
   * **Plural**, because this form carries a day field per household member: „drei Geburtsdaten
   * fehlen“ is the ordinary case and correcting it one round trip per field is not. The schema
   * reports every field it refuses at once; a domain refusal still names at most one, because the
   * use case stops at the first rule broken. Every screen in the app now carries the list — the
   * settings form used to carry a single `field` and report only the first issue with it, which was
   * the same shortcut on a form where several fields can be wrong at once.
   *
   * Absent on the refusals that name no field — an empty household is a statement about the whole
   * table, and a full register about none of it. Those stay a summary by the button, and mark
   * nothing: marking a field would say a value is malformed when nothing about it is.
   */
  readonly fields?: ReadonlyArray<FieldRefusal>;
  /**
   * The free numbers as the register stands *now*, set only when the refusal was a lost race
   * (US-24). Without it the form goes on offering a number that provably cannot be saved, and the
   * staff member's obvious next move — pick it again — fails identically.
   *
   * Absent on every other refusal, and on `idle`: re-reading the register is worth a query when the
   * pool is what went stale, and is noise when a birthdate was left blank.
   */
  readonly freeNumbers?: ReadonlyArray<number>;
}

export const initialRegisterCustomerState: RegisterCustomerState = { status: "idle" };
