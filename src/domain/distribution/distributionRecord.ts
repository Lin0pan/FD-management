/**
 * The distribution record — what actually happened at one hand-out: a customer showed up on a day,
 * handed over an amount, and owed the price the policy set for their household then (US-05, FR-1).
 *
 * The record is the transaction that turns the app into a history of distributions. It is never
 * overwritten week to week (FR-6): a fresh row is written each time, and a no-show is simply the
 * absence of one. Almost all of the record is data: *when* a hand-out may be written and *whether* it
 * may still be changed live in {@link ./attendance} (one per Berlin day, correctable only on the day)
 * and, for US-05.3, in the database's unique day-key constraint.
 *
 * The one rule the record carries itself is {@link requirePayment} — the shape of the amount handed
 * over — because that field is the only one a later reading derives money from.
 *
 * `priceCents` is captured **on the record** even though the settings history could resolve it again
 * from the date. That is deliberate redundancy (PRD §6): it makes a record self-describing, so any
 * later reporting can price a past distribution with a single-table read rather than replaying the
 * policy versions. It is not to be "cleaned up".
 */

import { InvalidPaymentAmount } from "../errors";
import type { Cents } from "../money";

/** A distribution record about to be written — everything except the surrogate id the store assigns. */
export interface NewDistributionRecord {
  /** The surrogate id of the customer served — the slot's holder, not the customer number (FR-6). */
  readonly customerId: number;
  /** The instant the hand-out was recorded; the Berlin calendar day of it is the once-per-day key. */
  readonly date: Date;
  /** Whether the customer showed up. Always true today — a no-show writes no record at all. */
  readonly showedUp: boolean;
  /**
   * What the household **handed over** — the amount, not a flag (US-29). It may be less than they
   * were asked for (a part payment they make up another week) and occasionally more (they pay ahead
   * so as not to have to remember it next week), so a boolean could not hold it.
   *
   * It is the only thing on the record the balance reads: `Σ (paidCents − priceCents)` over the
   * household's hand-outs is what they owe or have paid ahead, derived at every read and never
   * stored (`./balance`).
   */
  readonly paidCents: Cents;
  /** The price the policy in force on {@link date} set for the customer's household (FR-2). */
  readonly priceCents: Cents;
}

/** A persisted distribution record. `id` is the surrogate key a correction addresses it by. */
export interface DistributionRecord extends NewDistributionRecord {
  readonly id: number;
}

/**
 * Require `paidCents` to be a whole, non-negative number of cents.
 *
 * **The guard the derived balance needs, and the reason it is not left to the form.** `parseEuros`
 * already refuses a negative or fractional amount in the text a staff member types, and the counter
 * is the only screen that writes one today — but a use case that trusts its caller is a rule the
 * *screen* enforces, which is the arrangement FR-8 exists to refuse. The prices in
 * {@link ../policy/settings} are checked in both places for the same reason.
 *
 * It matters more here than it does for a price. A price is stored and can be corrected; the balance
 * is `Σ (paidCents − priceCents)` derived at every read (ADR-015), so there is no stored figure to
 * put right. One bad amount is carried silently by every later balance for that household and by
 * every amount the counter asks them for, and the only repair is editing the record that holds it.
 *
 * Zero is valid and ordinary: a household that hands over nothing still collects food.
 *
 * @throws {InvalidPaymentAmount} if the amount is fractional or below zero.
 */
export function requirePayment(paidCents: Cents): void {
  if (!Number.isInteger(paidCents) || paidCents < 0) {
    throw new InvalidPaymentAmount(paidCents);
  }
}
