/**
 * The customer balance: what a household still owes DF, or has paid ahead (US-29).
 *
 * A hand-out used to be paid or not paid, and reality has a third case DF wrote in the Excel list by
 * hand: the household owes 5,00 € and hands over 2,00 €, or — rarely — hands over more so as not to
 * have to remember it next week. So a record carries the **amount** that was handed over, and the
 * difference between that and what the week cost accumulates into one number per customer.
 *
 * The balance is **never stored**. It is the arithmetic of the household's own hand-out history,
 * exactly as the price, the counts and the eggs are the arithmetic of the household's own record: a
 * stored balance beside the hand-outs that produced it would be two answers to one question, which
 * is the Excel failure this project replaces. Removing a hand-out then puts the balance back for
 * free, because there is nothing to put back.
 *
 * ```
 * balance     = Σ (paidCents − priceCents)
 * amountToPay = max(0, priceCents − balance)
 * ```
 *
 * | Week | Price  | Balance before | Asked for | Paid   | Balance after |
 * | ---- | ------ | -------------- | --------- | ------ | ------------- |
 * | 1    | 5,00 € | 0,00 €         | 5,00 €    | 2,00 € | −3,00 €       |
 * | 2    | 5,00 € | −3,00 €        | 8,00 €    | 8,00 € | 0,00 €        |
 * | 3    | 2,00 € | 0,00 €         | 2,00 €    | 5,00 € | +3,00 €       |
 * | 4    | 2,00 € | +3,00 €        | 0,00 €    | 0,00 € | +1,00 €       |
 * | 5    | 2,00 € | +1,00 €        | 1,00 €    | 1,00 € | 0,00 €        |
 *
 * **The sum is against the price, not against the amount that was asked for.** This is the single
 * most likely thing for a later reader to "correct", and the table says why it must not be: read the
 * other way the balance never settles. In week 2 the household hands over the full 8,00 € it was
 * asked for — `8,00 − 8,00 = 0` — and the 3,00 € debt is still there next week to be charged a
 * second time; in week 4, `0 − 0 = 0` and the credit is never consumed by the week it pays for, so
 * the household eats free for ever. A balance that can only move when a payment *differs* from what
 * was asked can never return to zero.
 *
 * The amount that was asked for on a past day is a different quantity, and it is derived by
 * replaying the history — see {@link replayPayments} in US-29.2.
 *
 * The module holds **no limit of any kind**: no floor, no ceiling, no warning threshold. DF's
 * balances stay within ±20 € in practice, and a debt has no automatic consequence — the household is
 * served normally and a human decides.
 *
 * Pure: no I/O, no clock, and nothing here knows what a customer is.
 */

import type { Cents } from "../money";

/**
 * A hand-out as the arithmetic sees it: what the week cost, and what the household handed over.
 *
 * Deliberately not {@link ./distributionRecord.DistributionRecord}. The module is about money, and
 * taking the whole record would let a later change drag a date or a customer id into a sum.
 */
export interface PaidRecord {
  /** The price the policy in force set for the household that week (US-05 FR-2). */
  readonly priceCents: Cents;
  /** What the household actually handed over — possibly less, occasionally more, than was asked. */
  readonly paidCents: Cents;
}

/** What a balance means to the staff member reading it, so no screen compares a sign to zero. */
export type BalanceKind = "CREDIT" | "DEBT" | "SETTLED";

/**
 * The household's balance over `records`: `Σ (paidCents − priceCents)`, negative when they owe DF
 * money and positive when they have paid ahead.
 *
 * It does **not** sort — a sum has no order — and an empty history gives `0`, a household that has
 * never collected being settled like any other.
 */
export function balanceOf(records: ReadonlyArray<PaidRecord>): Cents {
  return records.reduce((total, record) => total + record.paidCents - record.priceCents, 0);
}

/**
 * What to collect today: the week's price offset by the balance, floored at zero.
 *
 * A debt raises it, a credit lowers it, and it never goes below zero because credit is never paid
 * out in cash — an unspent remainder stays in the balance and pays for the following week.
 *
 * `priceCents` is the price the policy already settled, cap included (US-26). The Maximalpreis caps
 * what a week of food costs a household; it does not cap what they are asked for, so an old debt is
 * added on top of a capped price and is not itself capped. That falls out of this line for free and
 * is not to be "fixed" later.
 */
export function amountToPay(priceCents: Cents, balanceCents: Cents): Cents {
  return Math.max(0, priceCents - balanceCents);
}

/**
 * Name a balance, so nobody does sign arithmetic.
 *
 * This is the one place the sign is read. Every screen asks here and words the answer — „Guthaben
 * 2,00 €", „Offen 2,00 €", „ausgeglichen" — rather than comparing to zero itself, which is what
 * keeps the rule from being re-decided one screen at a time.
 */
export function balanceKind(balanceCents: Cents): BalanceKind {
  if (balanceCents > 0) {
    return "CREDIT";
  }
  if (balanceCents < 0) {
    return "DEBT";
  }
  return "SETTLED";
}
