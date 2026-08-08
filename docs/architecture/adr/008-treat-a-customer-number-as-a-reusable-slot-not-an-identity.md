# ADR-008 — Treat a customer number as a reusable slot, not an identity

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** the maintainer, with FD on how the numbers are actually used

## Context

FD hands out customer numbers `1..N`, where `N` is the quota — the number of households they can
supply. When a household is archived, its number goes back into the pool and the next registration
fills the gap. That is not an accident of the paper process; it is how the quota is enforced, because
the count of numbers in use _is_ the count of households served.

So a customer number is a place in a fixed-size set, and it changes hands. If it were also the
identity of a household, every record ever written against number 50 would silently merge two
different families the day the slot was reused.

## Considered options

- **A surrogate `id` as the only identity; `customerNumber` as a reusable slot** — chosen.
- **`customerNumber` as the primary key** — rejected. Reuse would make historical records ambiguous,
  and archiving could not release the number at all.
- **Never reuse numbers; count upwards forever** — rejected by the domain. The numbering would
  exhaust long before the quota's places do, and the quota would stop meaning anything.
- **A human-facing composite key such as `50-1`, `50-2`** — rejected (sketch §5.3). It re-couples
  identity to the reusable slot, it is a smart key that invites parse and sort bugs, and generating
  it needs a stateful per-slot lookup.

## Decision

`Customer.id` is the surrogate primary key and the only identity in the system; every foreign key
targets it. `customerNumber` is a slot in `1..quotaN`, released by archiving and refilled by the next
registration. At most one non-archived customer may hold a given number — enforced by a **partial
unique index** over non-archived rows, hand-written at the end of the init migration because Prisma
has no syntax for one. Since US-24 the staff choose the number at registration from the free ones
rather than being assigned the lowest free slot.

## Consequences

- Allocation fills gaps rather than counting upwards, so the range stays dense and the quota keeps
  its meaning.
- The database, not the application, settles the race between reading the free numbers and writing
  the row. A lost race surfaces as a domain refusal on screen.
- Because staff now choose the number, a lost race can no longer be silently retried onto the next
  free slot — the refusal goes back to the screen, because a number a person chose has no substitute.
- Historical records stay unambiguous across a reuse: they point at an `id`, never at a number.
- A card number must be unique for good even though its slot is not, which is a separate constraint —
  `Card.index` counts the cards issued on a _customer number_ across every household that has ever
  held it, so a card number names one physical card forever.
- The partial unique index is dropped whenever the migration is regenerated and must be re-added.
  This is a real trap and is called out in the schema comments and
  [ADR-009](009-regenerate-migration-history-until-fd-holds-real-data.md).

## More information

- [Chapter 6 — registering a customer](../06-runtime-view.md#scenario-2--registering-a-customer)
- [Chapter 12 — glossary](../12-glossary.md)
- `src/domain/customer/customerNumber.ts`, `src/domain/card/cardNumber.ts`,
  `prisma/migrations/20260807065541_init/migration.sql`
- Commits `5beb708`, `57ee3d9`, `3f9da6d`
