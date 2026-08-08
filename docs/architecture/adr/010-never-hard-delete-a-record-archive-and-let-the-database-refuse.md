# ADR-010 — Never hard-delete a record: archive, and let the database refuse

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** the maintainer, with FD on what must remain answerable

## Context

Households leave the register and applicants leave the waiting list, and FD must still be able to
answer questions about them afterwards: who collected last March, why a family was archived, whether
"first come, first served" was actually honoured a year ago. A household that comes back is also
common enough that re-registering from the archived record is its own story (US-11).

Three relations originally carried `onDelete: Cascade`. Nothing in the code called `delete`, so it
was harmless — which is precisely the problem. The day a clean-up script or a mistyped test called
it, a household's members, certificates and cards would go with it, silently.

## Considered options

- **Archive as a status change; every relation refuses the delete** — chosen.
- **Hard delete with cascades** — rejected: it destroys the history FD needs and does so without a
  trace.
- **Soft-delete flags with cascades left in place** — rejected. It relies on nobody ever calling
  `delete`, and leaves the trap armed for whoever does.
- **A retention or deletion rule after N years** — deliberately out of scope. FD has no such rule
  today; archived records are kept indefinitely, and this may change.

## Decision

Customer data is never hard-deleted. Leaving the register is a status change to `ARCHIVED` with a
reason and a timestamp, and the record stays queryable. **No relation in `schema.prisma` may carry
`onDelete: Cascade`**, so SQLite refuses the delete rather than trusting that no one calls it. A
nullable relation must say `onDelete: Restrict` out loud, because Prisma's default there is
`SetNull`. Waiting-list rows are stamped `removedOn`/`removalReason` and retained; the active list is
a filter, never a delete.

The one deliberate exception is a household's member rows: editing a household **replaces** the set,
because no history of past compositions is kept and what a household was survives on the card that
printed its counts.

## Consequences

- A refused delete is a loud error instead of silent data loss.
- `src/infrastructure/prisma/schema.test.ts` fails if a cascade reappears, and greps the generated
  migration SQL as well as the schema — because the `SetNull` default on an optional relation is
  invisible in the schema file.
- Integration tests that clear the register must delete children first; `clearRegister` in
  `src/infrastructure/prisma/test-support.ts` exists for exactly that and is the only sanctioned way.
- Archiving is irreversible: `archiveReason` and `archivedAt` are written once and never cleared. A
  returning household is a new customer with a new number, a card at index 1 and a reminder count of
  zero, linked back only as display metadata.
- The database grows monotonically. At FD's scale that is measured in kilobytes a year.
- Revisit if a legal retention obligation ever requires deletion — at which point deletion is a
  deliberate, audited operation, not a cascade.

## More information

- [Chapter 8 — domain model and persistence](../08-crosscutting-concepts.md#domain-model-and-persistence)
- `prisma/schema.prisma`, `src/infrastructure/prisma/schema.test.ts`,
  `src/infrastructure/prisma/test-support.ts`, `src/domain/customer/status.ts`
- Commit `1476bab`
