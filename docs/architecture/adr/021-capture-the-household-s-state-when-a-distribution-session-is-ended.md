# ADR-021 — Capture the household's state when a distribution session is ended

- **Status:** Accepted
- **Date:** 2026-09-20
- **Deciders:** the maintainer, with DF on what a past afternoon has to show (their additional
  requirement of 19.09.2026, E-1…E-10, and answers G-3, G-7, H-2, H-3, J-1)

## Context

[ADR-020](020-the-distribution-session-not-the-calendar-is-what-a-hand-out-belongs-to.md) made a
hand-out belong to a session. DF then asked for something the software has never been able to do: a
past session must show the households **as they stood then** (E-1, E-2) — the name they had that
afternoon, the counts that were true then, the number they held, the card they carried, the
certificate date on file, the reminders given. Not today's.

Most of that cannot be reconstructed (E-7). The price and the amount paid are on the hand-out; the
card, the certificate date and the reminder count could be assembled out of three append-only
histories; the number and the group only indirectly, via the card valid then. **The name and the
household counts cannot be recovered at all**, because editing a household overwrites the names and
replaces the member rows — which is US-16 §FR-2 working as designed, not a defect.

The driver is [quality goal 1 — legibility](../01-introduction-and-goals.md#quality-goals): a table
in which half the columns show what was and the other half a reconstruction assembled from three
histories is one nobody can check, and a screen nobody can check is worse than no screen. Doing
nothing is not neutral either — it has an expiry date. Every session ended before a capture rule
exists loses its detail view for good, because ordinary editing overwrites the values it would have
shown.

## Considered options

- **Capture all the details together when the session is ended** — chosen, and DF's own
  recommendation (E-8). It is the same kind of thing a printed card already is: the hand-out becomes
  the **receipt** of who stood at the counter that afternoon.
- **Capture only the two irrecoverable values and reconstruct the rest** — the name and the counts
  stored, the card, certificate and reminders read back out of their histories. Rejected on E-8: two
  mechanisms answering one question, so a row that looked wrong could not be traced to either, and
  every future column would have to be classified before it could be shown.
- **Give households a general history** — version the names, keep past member rows, add an "as of"
  read to customer administration. Rejected: it reverses US-16 §FR-2 wholesale for a requirement
  bounded to the session, and DF explicitly ruled it out (E-9 — nothing outside the session gains a
  history). It would also put a date on every read of a household, everywhere.
- **Capture at the moment of the hand-out** rather than at the ending. Rejected by DF (G-3): while
  the session runs everything about it can still be put right, and a misspelt name noticed after the
  hand-out has to reach the record. Capturing early would close that window earlier than the
  correction window §2.3 already draws.
- **Freeze once and never thaw**, leaving a reopened session's receipts in place. Rejected on H-2: a
  reopened session must behave exactly like a running one, and two rules for one state would not be
  explainable. It would also make a reopened session's hand-out unremovable.
- **Do nothing for now and revisit after the first real afternoons.** Rejected — this is the one
  dependency in the project with an expiry date (E-10, §4): what is not captured is not merely
  missing later, it is unrecoverable.

## Decision

Ending a distribution session writes one **receipt** per hand-out, holding the household's customer
number, first and last name, grown-ups and children, the slot and index of the card it carried, the
certificate's validity date and the reminder count, as they stand at the **ending instant**. Price
and amount paid are not copied — they are already on the hand-out. While a session runs, including a
reopened one, nothing is frozen and every correction reaches the record; **reopening removes the
receipts and ending again takes them afresh**. A receipt is never updated: a change is a thaw and a
new freeze. It belongs to its hand-out by `DistributionRecord.customerId`, the surrogate id, so a
past session can never name a household that was not there (E-4). The **group and the card number
stay derived** — `groupOf(customerNumber)` and `formatCardNumber(cardCustomerNumber, cardIndex)` of
the captured values, never columns of their own.

## Consequences

- **US-16 §FR-2 is now bounded rather than absolute.** "No history of past household compositions"
  holds everywhere except inside an ended session, which is the one place DF asked for it. Customer
  administration goes on showing today's state only, and there is still no "as of" view of a
  household anywhere else (E-9).
- **The receipt is the fifth row of
  [ADR-007](007-derive-anything-computable-rather-than-storing-it.md)'s table** — the fourth in the
  shorter list root `CLAUDE.md` keeps, which has never counted `DistributionRecord.priceCents`. Its
  argument is of the same kind as `Card.grownUpsAtIssue`'s: it is a snapshot of what was true at a
  named moment, read as that and never as the household's current name, number or counts.
- **The thaw is a delete, and it is the third deliberate exception to
  [ADR-010](010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md)** — beside a
  household's member rows and a `CertificateType`. A receipt is not history; it is the freeze
  itself, re-taken whole by the next ending. It is also what keeps the correction window open: a
  reopened session may have a hand-out removed, and a receipt still pointing at it would make the
  database refuse that removal.
- **A child who turns 13 during the afternoon is counted as the ending instant says**, not as the
  price charged earlier says. The divergence is real, it is exactly what `Card.grownUpsAtIssue`
  already exposes, and it is not to be "fixed".
- **A household moved to another number while the session runs is captured under the new number**,
  and therefore the new group — in a RED-only session possibly as BLUE. Accepted and deliberately
  not prevented (J-1): the row shows the state at the end of the session, which is what was asked
  for, and a number change is administration that rarely happens on a distribution afternoon.
- **Ending a session now reads every served household**, so it costs one register read per hand-out
  and can fail. A freeze that fails leaves the afternoon running rather than closing one that cannot
  be read back.
- **Nothing is migrated** (E-10). Sessions ended before this rule simply have no receipts, and the
  screens that read them must render that case rather than assume it away.
- **A receipt duplicates what the register holds while the household is unchanged**, which is the
  cost: a reader meeting the table for the first time will take it for the drift
  [ADR-007](007-derive-anything-computable-rather-than-storing-it.md) forbids. The schema comment
  carries the argument for that reason.
- Revisit if DF ever ask for a household history outside a session — at which point the receipt
  becomes a projection of that history rather than the only record of it.

## More information

- [ADR-007 — derive anything computable rather than storing it](007-derive-anything-computable-rather-than-storing-it.md)
  (amended, not superseded: the receipt is a fifth argued exception)
- [ADR-010 — never hard-delete a record: archive, and let the database refuse](010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md)
  (amended, not superseded: the thaw is a third deliberate deletion)
- [ADR-016 — a customer number may be changed, and a card keeps the number it was printed with](016-a-customer-number-may-be-changed-and-a-card-keeps-the-number-it-was-printed-with.md)
  (why the card's own slot is captured, never the holder's current one)
- [ADR-017 — the customer number decides the group](017-the-customer-number-decides-the-group.md)
  (why the group is not a column here either)
- [ADR-020 — the distribution session, not the calendar, is what a hand-out belongs to](020-the-distribution-session-not-the-calendar-is-what-a-hand-out-belongs-to.md)
  (the session this freeze hangs off, and the reopening it has to survive)
- [Chapter 5 — building block view](../05-building-block-view.md),
  [chapter 8 — domain model and persistence](../08-crosscutting-concepts.md#domain-model-and-persistence),
  [chapter 12 — glossary](../12-glossary.md)
- `tasks/prd-us-35-session-receipt.md`, `tasks/prd-us-16-maintain-customer-record.md` §FR-2
- `src/domain/distribution/handoutReceipt.ts`,
  `src/application/distribution/{end,reopen}-distribution-session.ts`,
  `src/infrastructure/prisma/distribution-record-repository.ts`, `prisma/schema.prisma`
