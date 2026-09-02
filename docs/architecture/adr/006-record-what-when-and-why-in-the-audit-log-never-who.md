# ADR-006 — Record what, when and why in the audit log, never who

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** the maintainer, following DF's decision on login

## Context

Households get blocked and archived, moved between groups, issued replacement cards, and the prices
everyone pays get changed. Those are consequential acts on records about vulnerable people, and
without a trail there is nothing to look back at when someone asks why a family was archived in
March.

The system has no login and cannot tell its staff apart
([ADR-003](003-ship-without-login-and-bind-the-application-to-localhost.md)). So the question is not
whether to log — it is what an honest log can claim.

## Considered options

- **Append-only entries recording what changed, when, and why, with no actor** — chosen.
- **Add an actor field filled from a "who is at the counter" dropdown** — rejected. An unverified
  self-declaration in an accountability record is worse than an empty column: it looks like evidence
  and is not.
- **No audit log at all until login exists** — rejected. _What_ and _why_ are most of the value, and
  they are the part staff actually go looking for.
- **A full change-history table capturing every field's before and after** — rejected as more than
  the MVP needs; it is listed as deliberately out of scope in the stories.

## Decision

`AuditEntry` records `what` (a stable event name such as `settings.updated`), `changedFields`,
`when` (from the injected clock) and `why`. There is no actor column. Entries are appended and never
amended or deleted. Every state change writes one: archive, block and unblock, a move to another
customer number, card reissue, note edit, policy edit. The _why_ is **required** where the judgement is the record —
blocking and archiving a household — and optional where the changed fields already say it, as on a
settings edit.

## Consequences

- The log makes an honest claim. It answers what happened, when and on what grounds, and never
  implies it knows who did it.
- Skipping the entry on a state change is a defect, because with no login this log is the only
  accountability the system has.
- Blocking and archiving cannot be completed without a written reason — a refusal staff will meet.
- If login is ever introduced, adding an actor column is an additive migration; nothing already
  written becomes wrong, it just stops being the newest thing known.
- SQLite has no array type, so `changedFields` is a comma-joined string, read back only for display.

## More information

- [Chapter 8 — audit](../08-crosscutting-concepts.md#audit)
- `src/application/ports.ts` (`AuditLog`), `src/infrastructure/prisma/audit-log.ts`
- Commits `378663d`, `e2f0e18`
