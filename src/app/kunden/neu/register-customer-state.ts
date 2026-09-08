/**
 * The state the registration form and its server action pass between them. Outside `actions.ts`
 * because a `"use server"` module may export nothing but async functions.
 *
 * There is no `saved` state: a successful registration redirects to the new customer's record, so
 * the only thing the form ever gets back is a rejection.
 */

import type { FieldRefusal } from "../../field-refusal";
import type { NoticeTier } from "../../notice-tier";

/** What the form shows after a submission. `idle` is the state before anything was sent. */
export interface RegisterCustomerState {
  readonly status: "idle" | "error";
  readonly message?: string;
  /**
   * Which of the two refusals this is, from the typed error (`notice-tier.ts`). Optional because this
   * is a flat interface rather than a union; the action always sets it with `message`.
   */
  readonly tier?: NoticeTier;
  /**
   * The fields the refusal names, so the form can mark each and put the words beside it.
   *
   * **Plural**, because this form carries a day field per household member: „drei Geburtsdaten
   * fehlen“ is the ordinary case, and one round trip per field is not. A domain refusal still names
   * at most one, the use case stopping at the first rule broken.
   *
   * Absent where a refusal names no field — an empty household is a statement about the whole table,
   * a full register about none of it, and marking one would call a value malformed.
   */
  readonly fields?: ReadonlyArray<FieldRefusal>;
  /**
   * The free numbers as the register stands *now*, set only when the refusal was a lost race (US-24)
   * — without it the form goes on offering a number that provably cannot be saved, and the obvious
   * next move fails identically. Absent otherwise: a re-read is noise when a birthdate was blank.
   */
  readonly freeNumbers?: ReadonlyArray<number>;
}

export const initialRegisterCustomerState: RegisterCustomerState = { status: "idle" };
