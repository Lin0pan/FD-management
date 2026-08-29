# ADR-015 — Derive the customer balance from the hand-out history, never store it

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** the maintainer, confirmed with DF on 2026-08-28

## Context

A hand-out used to be paid or not paid: `DistributionRecord.paid` was a boolean and the counter
offered a checkbox. Reality has a third case DF have been writing into the Excel list by hand — the
household owes 5,00 € and hands over 2,00 €, or, rarely, hands over more so as not to have to
remember it next week. A flag loses that either way, so a record now carries the **amount** handed
over (`paidCents`), and the difference between that amount and what the week cost accumulates into
one number per household: the balance.

That number has to come from somewhere, and a running balance is the classic candidate for a fourth
exception to [ADR-007](007-derive-anything-computable-rather-than-storing-it.md) — the three the root
`CLAUDE.md` grants each carry an argument of its own kind (a snapshot of what a physical card
printed, a search key SQLite cannot fold in a `WHERE` clause, a key a unique constraint needs). A
`Customer.balanceCents` column would join them by habit rather than by argument, and it is the
habitual choice: it is one integer, it is trivially readable, and every system with an account
balance seems to have one.

The force against it is the one this project exists to answer. A stored balance and the hand-out rows
that produced it are **two answers to one question**, and they can disagree without anything
noticing. The system deliberately lets a record made today be corrected (US-05, FR-7) and removed,
so the disagreement is not hypothetical — it is a normal Thursday afternoon. Silent drift between a
typed-in number and the facts beneath it is precisely the Excel failure named in
[chapter 1's quality goals](../01-introduction-and-goals.md#quality-goals), and a wrong balance is
worse than a wrong count: it is money, in front of the household it belongs to.

## Considered options

- **Derive the balance from the household's own hand-outs on every read** — chosen. One source of
  truth, and a correction or a removal is consistent for free because there is nothing to put back.
- **Store `Customer.balanceCents` and update it inside the same transaction as every hand-out** —
  rejected. The transaction closes the obvious hole and leaves the real one: a record corrected or
  removed later, a migration, a repair by hand, or simply a second write path added in two years, all
  leave a column that no longer follows its rows and no read that would notice. It also cannot be
  reconstructed after the fact — the history could always rebuild the column, never the reverse.
- **Store the balance and reconcile it against the history on a schedule** — rejected for the reason
  [ADR-007](007-derive-anything-computable-rather-than-storing-it.md) rejected the same shape: the
  machine is switched off most of the week, and between runs the stored value is wrong. It is the
  Excel failure with extra machinery.
- **Store the amount that was asked for on each record, so the history need not be replayed** —
  rejected, and worth naming because it looks cheaper than it is. The asked-for amount is derivable
  from the balance of the _earlier_ rows (`replayPayments`), so storing it duplicates the same
  question one row at a time; and it would have to be rewritten on every earlier row whenever one of
  them was corrected. What DF actually asked for is that the history explain itself, which the replay
  gives.
- **Keep the boolean and let DF go on writing part payments in the margin** — rejected by DF on
  2026-08-28: the margin of a spreadsheet is the thing being replaced.

## Decision

The customer balance is derived at the point of use as `Σ (paidCents − priceCents)` over the
household's hand-outs, in `src/domain/distribution/balance.ts`, and is stored nowhere. The amount to
collect today is `max(0, priceCents − balance)`, and the amount asked for on a past day is re-derived
by replaying the history in date order. The sum is taken against the **price**, never against the
amount that was asked for — read the other way the balance never returns to zero, in either
direction.

## Consequences

- A balance that contradicts the household's hand-outs is not a state the system can express. There
  is no repair procedure, no reconciliation report and no "recalculate balances" button, because
  there is nothing that could have gone out of step.
- Correcting a payment and removing a hand-out are ordinary operations with no balance-keeping of
  their own: the sum simply answers differently afterwards. Removing today's record puts the balance
  back exactly, which is why the removal warning can name the figure it will return to.
- **Every read of a balance replays that household's history.** At DF's size this is irrelevant and
  the note says so out loud: one distribution a week is about 50 rows a year per household, over
  about 240 households, all of them in a local SQLite file. The counter loads a household's records
  once and derives the balance, the amount to pay and the whole settled history from that one read —
  no second query. If DF's register were ever to grow by an order of magnitude, or a report were ever
  to want every household's balance at once, that is the measurement worth taking before this is
  revisited; nothing else here changes.
- The sign is read in exactly one place, `balanceKind`, so no screen compares a balance to zero
  itself and the wording — „Guthaben", „Offen", „ausgeglichen" — cannot be re-decided one screen at a
  time.
- A mistake found on a **later** day cannot be edited away: corrections are permitted only on the day
  the record was made. DF put such a mistake right by recording a compensating amount at the
  household's next hand-out, which the balance absorbs by construction. That procedure is written for
  volunteers in the **Saldo** section of
  [the Betriebsanleitung](../../handout/betriebsanleitung.md).
- The balance is deliberately unbounded: no floor, no ceiling, no warning threshold, and a debt has
  no automatic consequence — the household is served and a human decides. An old debt is added on top
  of a capped price and is **not** itself capped, because the Maximalpreis caps what a week of food
  costs, not what a household is asked to hand over.
- [ADR-007](007-derive-anything-computable-rather-than-storing-it.md)'s exception table is unchanged:
  this decision adds no fifth row, and that is the point of recording it.

## More information

- [Chapter 5 — the domain building blocks](../05-building-block-view.md#level-2--inside-each-layer)
- [Chapter 6, scenario 1 — serving a household at the counter](../06-runtime-view.md#scenario-1--serving-a-household-at-the-counter)
- [Chapter 8 — money](../08-crosscutting-concepts.md#money)
- [ADR-007 — derive anything computable rather than storing it](007-derive-anything-computable-rather-than-storing-it.md)
- `src/domain/distribution/balance.ts`, `src/application/distribution/record-attendance.ts`,
  `src/application/customers/lookup-customer.ts`, `prisma/schema.prisma`
- `tasks/prd-us-29-customer-balance.md` — the requirement, and DF's answer of 2026-08-28
