/**
 * One hand-out: a customer showed up on a day, handed over an amount, and owed the price the policy
 * set for their household then (US-05, FR-1). Rows are appended, never overwritten (FR-6), and a
 * no-show is simply the absence of one.
 *
 * *When* a hand-out may be written and *whether* it may still be changed live in `./attendance`; the
 * record carries only {@link requirePayment}, the field a later reading derives money from.
 *
 * `priceCents` is deliberate redundancy (PRD §6) — the settings history could resolve it from the
 * date, but capturing it makes a record self-describing, so reporting prices a past distribution
 * with one table read. Not to be "cleaned up".
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
   * What the household **handed over** — an amount, not a flag (US-29), since it may be less than
   * asked (a part payment) or more (paying ahead). The only field `./balance` reads:
   * `Σ (paidCents − priceCents)` is derived at every read and never stored.
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
 * Require `paidCents` to be a whole, non-negative number of cents. Zero is ordinary — a household
 * that hands over nothing still collects food.
 *
 * Checked here as well as in `parseEuros` because a rule only the *screen* enforces is the
 * arrangement FR-8 refuses. It matters more than for a price: a price is stored and correctable,
 * while the balance is derived at every read (ADR-015), so one bad amount is carried silently by
 * every later balance until the record holding it is edited.
 *
 * @throws {InvalidPaymentAmount} if the amount is fractional or below zero.
 */
export function requirePayment(paidCents: Cents): void {
  if (!Number.isInteger(paidCents) || paidCents < 0) {
    throw new InvalidPaymentAmount(paidCents);
  }
}
