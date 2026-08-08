# ADR-009 — Regenerate migration history until DF holds real data

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** the maintainer

## Context

The schema changed direction several times during the build, and will again before go-live: the
price table became per-head rates, a staff-entered "effective from" date was removed, and three
relations that carried `onDelete: Cascade` were changed to refuse the delete. The conventional move
is to stack a corrective migration on top — and it is also what an unattended autonomous run would
reach for by default.

But none of those migrations had ever run outside a developer's machine. Stacking an add-then-drop
pair onto a schema nobody has ever executed leaves a history that describes a system that never
existed: the next reader finds a migration saying DF once priced by household, and takes it for a
decision DF once made.

## Considered options

- **Regenerate the history while it is fictional; make it append-only the moment it is not** —
  chosen.
- **Append-only migrations from the first commit** — rejected for the pre-release period: it
  preserves a history of decisions that were never in force anywhere, at the cost of misleading every
  future reader.
- **No migrations at all pre-release; `db push` until go-live** — rejected. The migration mechanism
  itself needs to be exercised and in CI before it matters.
- **Tie the switch to a version tag or a deploy** — rejected as the wrong trigger. A build DF click
  around in with seeded data is still pre-release; what makes data irreplaceable is that it is real.

## Decision

While DF holds no real data, a schema change that contradicts an earlier migration **replaces** it:
delete `prisma/migrations/`, regenerate with `npx prisma migrate dev --name init`, then
`npm run db:reset`. **The moment DF enters their first real customer this reverses** and migrations
become append-only — never edited, never deleted. That record, not a tag and not a deploy, is the
boundary.

## Consequences

- The migration history describes the system as it is, in one honest `init`, rather than as a
  sequence of positions nobody ever held.
- Regenerating drops the hand-written partial unique index on `Customer.customerNumber` that
  [ADR-008](008-treat-a-customer-number-as-a-reusable-slot-not-an-identity.md) depends on. It must be
  re-appended to the generated SQL every time, or the slot rule rests on application code alone.
  `src/infrastructure/prisma/schema.test.ts` greps the generated SQL, which is the guard against
  forgetting.
- The schema and any existing local database drift apart silently after a rewrite. The first symptom
  is the settings screen reporting that nothing is configured, and the fix is `npm run db:reset` —
  which every checkout must run after a history rewrite lands.
- The reversal is a judgement call that has to be _noticed_, not automated. If it is missed, real
  customer data is destroyed by the next regeneration. This is the sharpest edge in the project and
  is recorded as a risk in [chapter 11](../11-risks-and-technical-debt.md).
- Revisit — that is, execute the reversal — on the day DF registers their first real household.

## More information

- [Chapter 7 — deployment view](../07-deployment-view.md)
- `CLAUDE.md` §"Database migrations", `prisma/migrations/`,
  `src/infrastructure/prisma/schema.test.ts`
- Commits `d3ecc88`, `8552752`, `1476bab`
