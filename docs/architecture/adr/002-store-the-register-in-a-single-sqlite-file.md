# ADR-002 — Store the register in a single SQLite file

- **Status:** Accepted
- **Date:** 2026-07-21
- **Deciders:** the maintainer, with FD on the domain questions

## Context

FD is a charity with no IT staff and no server. The register holds roughly 240 households, four
people use it, and one distribution happens per week — so throughput plays no part in the choice.
What does play a part is that whoever operates this in three years must be able to back it up,
restore it and move it to a new machine without help, and that the data is sensitive personal
information about vulnerable people, which argues against putting it anywhere it does not have to be
(see [chapter 2](../02-architecture-constraints.md)).

## Considered options

- **SQLite, one file at `data/fd.db`, accessed through Prisma** — chosen.
- **PostgreSQL, locally or hosted** — rejected. It is a service to install, patch, secure and
  administer, and there is nobody to do that. Hosted, it would also put FD's customer data on a
  third party's infrastructure for no operational gain at this size.
- **A cloud application with a managed database** — rejected for the same data-protection reason,
  plus it makes the app unusable on a day FD's internet is down, which is a real day.
- **Keep the Excel sheet and build reporting on top of it** — rejected: the drifting derived columns
  in that sheet are the problem this system exists to remove.
- **Prisma's `better-sqlite3` driver adapter rather than the native provider** — deferred, not
  rejected. It buys nothing while the schema is small, and the native provider is one less moving
  part.

## Decision

The register lives in a single SQLite file at `data/fd.db`, reached only through Prisma from
`src/infrastructure/prisma/`. Backup is a copy of that file; restore is a copy back. All money
columns are `Int` cents, because SQLite has no decimal type.

## Consequences

- Backup and restore are operations a non-technical person can perform and verify.
- No database server exists to administer, secure or keep patched.
- SQLite's limits shape the schema in ways that show up throughout: no decimal type
  ([money is integer cents](../08-crosscutting-concepts.md#money)), no enum type (groups, statuses and
  reasons are validated strings), no timezone arithmetic (`dayKey` is written by the domain), and no
  case- or umlaut-folding in `WHERE` (the folded search keys in [ADR-007](007-derive-anything-computable-rather-than-storing-it.md)).
- Prisma cannot express a partial unique index, so the one the slot rule needs is hand-written at the
  end of the init migration and must be re-added whenever the migration is regenerated
  ([ADR-009](009-regenerate-migration-history-until-fd-holds-real-data.md)).
- Concurrent writers are limited, which is invisible at four users and would not be at four hundred.
- No backup schedule exists yet. That is the single most important operational gap and is tracked in
  [chapter 11](../11-risks-and-technical-debt.md).
- Moving to PostgreSQL later is a provider change in `schema.prisma` plus new migrations — the
  application layers do not move, because they only ever see the ports.

## More information

- [Chapter 7 — deployment view](../07-deployment-view.md)
- `prisma/schema.prisma`, `.env.example`, `src/infrastructure/prisma/`
- Commit `1f9fc09`
