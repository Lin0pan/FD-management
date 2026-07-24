/**
 * The distribution record — what actually happened at one hand-out: a customer showed up on a day,
 * paid or did not, and owed the price the policy set for their household then (US-05, FR-1).
 *
 * The record is the transaction that turns the app into a history of distributions. It is never
 * overwritten week to week (FR-6): a fresh row is written each time, and a no-show is simply the
 * absence of one. The whole record is data — there is no rule to enforce on construction — so this
 * module is types only; the invariants live in {@link ./attendance} (one per Berlin day, correctable
 * only on the day) and, for US-05.3, in the database's unique day-key constraint.
 *
 * `priceCents` is captured **on the record** even though the settings history could resolve it again
 * from the date. That is deliberate redundancy (PRD §6): it makes a record self-describing, so any
 * later reporting can price a past distribution with a single-table read rather than replaying the
 * policy versions. It is not to be "cleaned up".
 */

import type { Cents } from "../money";

/** A distribution record about to be written — everything except the surrogate id the store assigns. */
export interface NewDistributionRecord {
  /** The surrogate id of the customer served — the slot's holder, not the customer number (FR-6). */
  readonly customerId: number;
  /** The instant the hand-out was recorded; the Berlin calendar day of it is the once-per-day key. */
  readonly date: Date;
  /** Whether the customer showed up. Always true today — a no-show writes no record at all. */
  readonly showedUp: boolean;
  /** Whether they paid; a flag, never an amount (FR-3). */
  readonly paid: boolean;
  /** The price the policy in force on {@link date} set for the customer's household (FR-2). */
  readonly priceCents: Cents;
}

/** A persisted distribution record. `id` is the surrogate key a correction addresses it by. */
export interface DistributionRecord extends NewDistributionRecord {
  readonly id: number;
}
