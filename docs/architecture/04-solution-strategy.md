# 4. Solution strategy

_Last reviewed: 2026-08-25_

Six statements. Each names an approach, why it was taken given a goal or constraint, what it makes
easier and what it makes harder, and where the full reasoning lives.

## 1. A pure core with thin adapters, and the boundary is a build failure

**Approach.** Four layers — `domain`, `application`, `infrastructure`, `app` — with dependencies
pointing inwards only, and the rule enforced by two ESLint rule blocks rather than by review.

**Rationale.** DF's rules are the part of this system worth protecting for five years
([goal 1](01-introduction-and-goals.md#quality-goals)), and part of the code is written by unattended
agent runs, where no reviewer exists to notice a violation.

**Consequence.** Rules are testable by calling a function, which is what makes strict TDD and a 100 %
coverage gate affordable. Replacing Next.js would discard `src/app/` and nothing else. The cost is
indirection: a new field is touched in four places even when it is a plain string.

→ [ADR-001](adr/001-layer-the-system-hexagonal-lite-and-enforce-the-boundary-in-the-build.md),
[chapter 5](05-building-block-view.md)

## 2. Local-first: one machine, one file, no server, no login

**Approach.** SQLite in `data/fd.db`, the app started with `npm start` and bound to
`localhost:3000`, no authentication.

**Rationale.** DF has no IT staff to administer anything and holds sensitive data about vulnerable
people ([constraints](02-architecture-constraints.md), [goal 3](01-introduction-and-goals.md#quality-goals)).
Physical control of the machine is a form of access control DF already has and understands.

**Consequence.** Backup is a file copy and restore is a copy back — operations a non-technical person
can perform. Nothing to patch, nothing exposed. Against that: an unlocked machine is an open
register, the system cannot say who did anything, and multi-machine use would require revisiting
both decisions.

→ [ADR-002](adr/002-store-the-register-in-a-single-sqlite-file.md),
[ADR-003](adr/003-ship-without-login-and-bind-the-application-to-localhost.md),
[chapter 7](07-deployment-view.md)

## 3. Policy is data DF owns, not constants a developer owns

**Approach.** Quota, prices, the price cap, the distribution weekday, the week anchor and the egg
allowance live in append-only, clock-stamped `SettingsVersion` rows, editable in the UI and in force
immediately. The egg allowance is the first of them that is a **list** rather than a number — a
staircase of (household size → eggs) rows, kept as a child table of the version rather than as a
JSON blob or a fixed set of columns.

**Rationale.** Every number in DF's process is a decision they revisit. Behind a deploy, "changeable"
means "not changeable" for an organisation with no developer on call.

**Consequence.** DF change their own rules, and a past distribution can still be priced because the
version in force that day survives. It also means nothing in the codebase may hard-code a price or a
threshold — not the prices per head, not the cap, not the quota, and not the egg counts or the
household sizes that earn them. That is a standing rule, and the reason there is no configurable
reminder escalation: whether an expired certificate ends in archiving is a judgement, not a number.

→ [ADR-005](adr/005-keep-business-rules-as-dated-append-only-settings-data.md),
[ADR-014](adr/014-store-the-egg-allowance-as-versioned-threshold-rows.md),
[chapter 8](08-crosscutting-concepts.md#configuration-as-data)

## 4. Derive anything computable; a stored duplicate needs an argument

**Approach.** Household composition, price, card validity, certificate state and week colour are
computed at the point of use. Four stored duplicates exist and each carries its
justification in the schema.

**Rationale.** The drifting typed-in counts in DF's spreadsheet are the specific failure this system
was built to remove ([goal 2](01-introduction-and-goals.md#quality-goals)).

**Consequence.** A count that contradicts the household is not expressible. Age-based reclassification
needs no scheduled job — the derivation simply starts answering differently. In exchange, every rule
that derives against "today" must take an injected clock, and some questions cannot be a `WHERE`
clause: the cards-due-for-reissue comparison reads the whole register, accepted at a few hundred
rows.

→ [ADR-007](adr/007-derive-anything-computable-rather-than-storing-it.md),
[ADR-008](adr/008-treat-a-customer-number-as-a-reusable-slot-not-an-identity.md)

## 5. The database is the final authority on every hard invariant

**Approach.** Each invariant that must never break is stated twice: once as a rule in `domain/`, and
once as a constraint the database enforces — the partial unique index on non-archived customer
numbers, `(customerId, index)` and `(customerNumber, index)` on cards, `(customerId, dayKey)` on
distribution records, `(customerId, loggedOn)` on reminders. Nothing carries `onDelete: Cascade`.

**Rationale.** A read-then-write guard cannot settle a race, and the invariants in
[goal 2](01-introduction-and-goals.md#quality-goals) are the ones where being _usually_ right is
worthless.

**Consequence.** A lost race becomes a typed domain refusal on screen rather than a duplicate row,
and a stray `delete` becomes a loud error instead of silent data loss. The cost is that adapters must
translate Prisma's `P2002` into the right domain error — including working out _which_ of two unique
indexes fired — and that integration tests must delete children explicitly.

→ [ADR-010](adr/010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md),
[chapter 8](08-crosscutting-concepts.md#concurrency-and-consistency)

## 6. Test where it pays, and let each level do only what it can

**Approach.** Strict TDD and a 100 % coverage gate on `domain/` and `application/`; hand-written
fakes rather than a mocking library; thin integration tests against a throwaway SQLite file for
constraints; Playwright for anything that spans a `"use server"` boundary, several screens, or an
absence.

**Rationale.** Coverage on pure logic is a consequence of TDD and costs nothing to keep. Chased into
UI and infrastructure it buys low-value tests instead. And a `"use server"` module that exports a
non-function builds cleanly and only fails at page load — no unit test can see that.

**Consequence.** The unit suite is fast enough to run before every push, and the e2e suite is the
only thing that can tell you a screen is broken. Against that: `src/app/` is invisible to the unit
gate by construction, so logic there is a defect rather than a style issue, and the e2e suite runs
serially (`workers: 1`) because a flaky gate is worth less than a slow one.

→ [chapter 8](08-crosscutting-concepts.md#testing-strategy),
[chapter 10](10-quality-requirements.md)

## Open questions

- **How the existing Excel register gets in.** Import script or re-key by hand — undecided, and it
  must be answered before go-live. It is also the trigger for
  [ADR-009](adr/009-regenerate-migration-history-until-fd-holds-real-data.md)'s reversal.
- **Who copies `data/fd.db`, where to, and how often.** The backup is the whole disaster-recovery
  story and no schedule exists.
- **When the pinned Next.js major stops being tenable**, and what the upgrade costs then.

All three are tracked in [chapter 11](11-risks-and-technical-debt.md).

---

Previous: [3. Context and scope](03-context-and-scope.md) · Next: [5. Building block view](05-building-block-view.md)
