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
 * This is the one place the sign is read. Every screen asks here and renders the answer — „−2,00 €",
 * „+2,00 €", „ausgeglichen", and the tint that goes behind them — rather than comparing to zero
 * itself, which is what keeps the rule from being re-decided one screen at a time. That the screens
 * now print a sign changes nothing here: what they print it from is still this answer and not a
 * comparison of their own.
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
 * The difference is the whole point of the two quantities. A household that owes 3,00 € and is asked
 * for 8,00 € against a 5,00 € price hands over 8,00 € and is `EXACT`: they paid what they were asked
 * for. Compared with the price it would read `OVER`, and the record would mark a household clearing
 * an old debt in the colour of one paying ahead — which is the opposite of what happened.
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
  /** The hand-out itself, handed back untouched so the caller keeps its date, id and anything else. */
  readonly record: T;
  /** What the counter asked for that day: the price offset by the balance of the *earlier* records. */
  readonly askedCents: Cents;
  /** How {@link record}'s payment stood against {@link askedCents}. */
  readonly standing: PaymentStanding;
  /** The running balance once this hand-out is counted in. */
  readonly balanceAfter: Cents;
}

/**
 * Walk a household's hand-outs oldest first and say, for each, what was asked for on the day.
 *
 * The amount asked for is not stored — nothing is — so it is re-derived here from the balance of
 * every earlier hand-out, which is exactly the number the counter had in front of it that morning.
 * That makes the history explain itself: a row saying „5,00 € gefordert, 2,00 € gezahlt" is readable
 * a year later without knowing what the household owed at the time.
 *
 * It **sorts its input by `date` itself** rather than trusting the caller. Order is the whole meaning
 * of a running balance, and the port that supplies the rows promises nothing about it — the same
 * bargain {@link ../policy/eggs.createEggRule} strikes by sorting inside the constructor. The sort is
 * on a copy: the caller's array comes back as it was passed.
 *
 * The last `balanceAfter` is {@link balanceOf} of the same rows, necessarily — the two walk the same
 * sum — and a test says so, because two functions computing one number must not be able to disagree.
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
