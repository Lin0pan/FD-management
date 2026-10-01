# ADR-022 — Record when a card was printed on the card row

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** the maintainer, with DF on how a card that still has to be printed is kept track of
  (their requirement „Karten drucken", refined 01.10.2026, decisions D1–D12)

## Context

The software prints no cards. DF sometimes hand a household a **temporary card** and print the real
one later, and today nothing but memory keeps track of that, so a household can be left on a
temporary card for good. DF asked for a list of the cards still to be printed, ticked off one at a
time, with an undo right after a tick (D5, D7, D8), and for the card history to say „gedruckt am …"
(D9).

Whether a card has been printed happens **outside** the software. Nothing in the register implies
it, so it cannot be derived: the only source is DF's own statement, and a statement that is not
stored is lost. That puts it outside
[ADR-007](007-derive-anything-computable-rather-than-storing-it.md)'s question altogether — it is a
recorded **event**, like an archive, not a computable value someone chose to store. What had to be
decided is where and in what shape.

Two further facts shape it. A card is immutable once issued: every column on the row is a snapshot
of what was printed ([ADR-016](016-a-customer-number-may-be-changed-and-a-card-keeps-the-number-it-was-printed-with.md)),
and a change is recorded by issuing a new card. And the tick can be taken back (D7), so the stored
fact has to be able to return to "not printed".

## Considered options

- **A nullable `printedAt` date on the card row** — chosen. One fact, one place, read beside the
  card it belongs to; `null` means not yet printed.
- **A separate `CardPrint` table**, one row per tick. Would keep the card row free of any column
  that changes. Rejected: a card is printed once, so the table would hold at most one row per card
  and need a join on every read of a card, and the history of ticks and undos it could hold is
  already in the audit log (D9). Undoing would mean deleting a row — a fourth exception to
  [ADR-010](010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md) for a fact that
  is simpler as a value.
- **A boolean `printed` without a date.** Rejected: D9 asks for the date on the card view, and the
  date is what answers "has this household had its proper card yet, and since when?".

## Decision

Every card row carries `printedAt`, a nullable date: `null` means not yet printed. A card issued by
hand states it at issue — the moment of issue if DF tick „Karte ist bereits gedruckt", else `null`;
a card issued by a customer-number change is always `null`. Ticking a card off sets it to now and
refuses a card already printed; taking the tick back clears it and refuses a card not printed. It
is the **only** column of a card row written after the insert; every other column stays a
never-updated snapshot. Each tick and each undo writes an audit entry
(`customer.card.printed`, `customer.card.printUndone`).

## Consequences

- **A card row is no longer wholly immutable.** `printedAt` sits beside the snapshot columns and
  changes; they do not. The schema comment and the `CardRepository.setPrintedAt` port say so, and
  the adapter touches that column and nothing else.
- **It is not a fifth "derive, don't store" exception.** Root `CLAUDE.md` names it beside the
  snapshots in one line so a reader does not take it for drift.
- **The column holds the latest state only.** An undo erases the first date; the audit log is the
  record that a tick was made and taken back.
- **A card is ticked off by `(customerId, index)`**, the index of the row DF saw, so a card
  replaced in the meantime is refused (`CardSuperseded`) rather than a card DF never looked at being
  ticked off in its place.
- **Every writer states the value**; there is no default in the schema or the domain type. A
  direct insert that omits it — an e2e spec, a future import — produces an unprinted card that lands
  on the list, which is why every such insert names it.
- **Go-live needs a decision for existing cards** (D10): they count as printed. Pre-release the
  seeds write `printedAt = issuedAt`; once DF hold real data
  ([ADR-009](009-regenerate-migration-history-until-fd-holds-real-data.md)), any later column of
  this kind needs an appended migration that backfills it instead.
- Revisit if DF ever need a card printed more than once to be told apart (a reprint of a damaged
  card without a new number) — at which point the print, not the card, becomes the thing with a
  history.

## More information

- [ADR-006 — record what, when and why in the audit log, never who](006-record-what-when-and-why-in-the-audit-log-never-who.md)
- [ADR-007 — derive anything computable rather than storing it](007-derive-anything-computable-rather-than-storing-it.md)
  (not amended: this is an event, not a stored derivation)
- [ADR-016 — a customer number may be changed, and a card keeps the number it was printed with](016-a-customer-number-may-be-changed-and-a-card-keeps-the-number-it-was-printed-with.md)
- [Chapter 5 — building block view](../05-building-block-view.md),
  [chapter 12 — glossary](../12-glossary.md)
- `tasks/prd-us-39-cards-to-print.md`
- `src/domain/card/card.ts` (`markPrinted`, `unmarkPrinted`),
  `src/application/customers/{mark-card-printed,undo-card-printed,cards-to-print}.ts`,
  `src/infrastructure/prisma/card-repository.ts`, `prisma/schema.prisma`
