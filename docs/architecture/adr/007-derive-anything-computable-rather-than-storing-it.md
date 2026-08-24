# ADR-007 — Derive anything computable rather than storing it

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** the maintainer

## Context

The Excel sheet this system replaces keeps the grown-up and children counts as typed-in numbers. They
were right on the day they were typed and wrong from the next birthday onwards, and nothing in the
sheet notices. That silent drift — two sources of truth for one fact — is the specific failure the
software exists to remove, and it is the reason
[correctness of the hard invariants](../01-introduction-and-goals.md#quality-goals) is a stated
quality goal.

The same shape recurs everywhere: price, card validity, certificate state, which group collects
this week, a household's place on the waiting list. Every one of them is computable
from something already on file plus, in some cases, today's date.

## Considered options

- **Derive on every read; store only what cannot be computed** — chosen.
- **Store the computed values and recompute them on a schedule** — rejected. It needs a scheduled job
  on a machine that is switched off most of the week, and between runs the stored value is wrong —
  which is the Excel failure with extra machinery.
- **Store the computed values and recompute them on every write** — rejected. A birthday is not a
  write. Nothing happens on the day a child turns 13, which is exactly why storing the count fails.
- **Store them and accept the drift** — rejected; it is the status quo being replaced.

## Decision

Anything computable is derived at the point of use and is not stored. A stored duplicate of a
derivable fact needs an argument of its own kind, and there are exactly four:

| Stored value                                              | Why it is not a violation                                                                                                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Card.grownUpsAtIssue`, `childrenAtIssue`, `groupAtIssue` | A snapshot of what was _printed on a physical card_, so a birthday or a group move that overtook it can be spotted. Never read as the household's counts or group; never updated — a reissue is how a change is recorded.                      |
| `Customer.firstNameFolded`, `lastNameFolded`              | A **search key**, not a fact. SQLite can fold neither umlauts nor Unicode case in a `WHERE` clause, so the fold cannot live in the query. Never displayed; written from the names in the same statement, so a name edit rewrites them with it. |
| `Card.customerNumber`                                     | A **key the constraint needs**: `@@unique([customerNumber, index])` cannot reach through the relation. It snapshots nothing — a customer number is fixed at registration — and is never read as the card's number.                             |
| `DistributionRecord.priceCents`                           | Deliberate redundancy so a past hand-out is self-describing in a single-table read, alongside the settings history that could re-derive it. Not to be "cleaned up".                                                                            |

## Consequences

- A count that contradicts the household is not something the system can express.
- Age-based reclassification needs no job and no trigger: the derivation simply starts answering
  differently, and the cards-due-for-reissue list picks it up — see
  [chapter 6, scenario 4](../06-runtime-view.md#scenario-4--a-birthday-moves-a-child-to-grown-up).
- Every rule that derives against "today" must take an injected `Clock`, which is why the clock is a
  port and a wall-clock read is a lint error outside `infrastructure/`.
- Some questions cannot be a `WHERE` clause. The cards-due-for-reissue comparison has a rule over
  birthdates on one side, so it reads the whole register — accepted at a few hundred rows, documented rather
  than worked around.
- The exceptions carry their argument in the schema comments, so a later reader does not remove the
  duplication as a violation.
- Revisit an individual exception only by adding a fifth with an argument of the same kind.

## More information

- [Chapter 8 — domain model and persistence](../08-crosscutting-concepts.md#domain-model-and-persistence)
- `src/domain/customer/householdComposition.ts`, `src/domain/card/staleCard.ts`,
  `src/domain/customer/nameSearch.ts`, `prisma/schema.prisma`
- Commits `5beb708`, `2a20e60`, `df666a5`, `e52505c`, `f1853c5`, `3f9da6d`
