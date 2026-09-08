/**
 * The customer balance: what a household still owes DF, or has paid ahead (US-29). A record carries
 * the **amount** handed over, and the difference from what the week cost accumulates per customer.
 *
 * **Never stored** (ADR-015) — so removing a hand-out puts the balance back for free, because there
 * is nothing to put back.
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
 * replaying the history — see {@link replayPayments}.
 *
 * The module holds **no limit of any kind**: no floor, no ceiling, no warning threshold. DF's
 * balances stay within ±20 € in practice, and a debt has no automatic consequence — the household is
 * served normally and a human decides.
 *
 * Pure: no I/O, no clock, and nothing here knows what a customer is.
 */

import type { Cents } from "../money";

/**
 * A hand-out as the arithmetic sees it. Deliberately not `DistributionRecord`: this module is about
 * money, and taking the whole record would let a later change drag a date or an id into a sum.
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
 * `Σ (paidCents − priceCents)` — negative when the household owes DF money, positive when they have
 * paid ahead. Does not sort, a sum having no order; an empty history is `0`, settled like any other.
 */
export function balanceOf(records: ReadonlyArray<PaidRecord>): Cents {
  return records.reduce((total, record) => total + record.paidCents - record.priceCents, 0);
}

/**
 * What to collect today: the week's price offset by the balance, floored at zero — credit is never
 * paid out in cash, an unspent remainder pays for the following week.
 *
 * `priceCents` already includes the cap (US-26). The Maximalpreis caps what a week of food costs, not
 * what a household is asked for, so an old debt is added on top of a capped price and is not itself
 * capped. That falls out of this line, and is not to be "fixed" later.
 */
export function amountToPay(priceCents: Cents, balanceCents: Cents): Cents {
  return Math.max(0, priceCents - balanceCents);
}

/**
 * Name a balance, so nobody does sign arithmetic. The one place the sign is read: every screen asks
 * here and renders the answer rather than comparing to zero, which keeps the rule from being
 * re-decided one screen at a time.
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

/** How a payment stood against what the household was asked for that day. */
export type PaymentStanding = "SHORT" | "EXACT" | "OVER";

/**
 * How a payment stood against `askedCents` — **what was asked for that day**, never the price.
 *
 * A household owing 3,00 €, asked 8,00 € against a 5,00 € price, hands over 8,00 € and is `EXACT`.
 * Against the price it would read `OVER`, marking a household clearing a debt in the colour of one
 * paying ahead.
 */
export function standingOf(paidCents: Cents, askedCents: Cents): PaymentStanding {
  if (paidCents > askedCents) {
    return "OVER";
  }
  if (paidCents < askedCents) {
    return "SHORT";
  }
  return "EXACT";
}

/** One hand-out as the history reads it: the record, what it asked for, and where it left things. */
export interface Settlement<T extends PaidRecord> {
  /** The hand-out itself, untouched, so the caller keeps its date, id and anything else. */
  readonly record: T;
  /** What the counter asked for that day: the price offset by the balance of the *earlier* records. */
  readonly askedCents: Cents;
  /** How {@link record}'s payment stood against {@link askedCents}. */
  readonly standing: PaymentStanding;
  /** The running balance once this hand-out is counted in. */
  readonly balanceAfter: Cents;
}

/**
 * Walk a household's hand-outs oldest first and say, for each, what was asked for on the day —
 * re-derived from the balance of every earlier hand-out, which is the number the counter had in front
 * of it that morning. That makes a row readable a year later without knowing what was owed then.
 *
 * It **sorts by `date` itself** rather than trusting the caller: order is the whole meaning of a
 * running balance and the port promises nothing about it. The sort is on a copy.
 *
 * The last `balanceAfter` is necessarily {@link balanceOf} of the same rows, and a test says so.
 */
export function replayPayments<T extends PaidRecord & { date: Date }>(
  records: ReadonlyArray<T>,
): ReadonlyArray<Settlement<T>> {
  const oldestFirst = [...records].sort((a, b) => a.date.getTime() - b.date.getTime());

  const settlements: Settlement<T>[] = [];
  let balance: Cents = 0;
  for (const record of oldestFirst) {
    const askedCents = amountToPay(record.priceCents, balance);
    balance = balance + record.paidCents - record.priceCents;
    settlements.push({
      record,
      askedCents,
      standing: standingOf(record.paidCents, askedCents),
      balanceAfter: balance,
    });
  }
  return settlements;
}

/**
 * What was asked for on the day `record` was made, replayed from `records` — asked by the counter and
 * by a same-day correction, so answered here once rather than in each.
 *
 * The record's *own* payment is deliberately not folded in. Today's amount to pay already counts that
 * payment, so comparing a stored payment against it would read a household settling an old debt as
 * paying ahead.
 *
 * When `records` does not contain `record`, the answer is its own price: a record no history knows
 * about has no earlier rows to be offset by.
 */
export function askedForRecord<T extends PaidRecord & { date: Date; id: number }>(
  records: ReadonlyArray<T>,
  record: T,
): Cents {
  const settlement = replayPayments(records).find((walked) => walked.record.id === record.id);
  return settlement?.askedCents ?? record.priceCents;
}
