# FD-Management

Software supporting the daily operations of the Delbrücker Füllhorn food bank, including customer
administration, eligibility checks, and food distribution tracking.

This file is the **engineering standard** for the project. It is loaded automatically by every Claude
Code session in this repository, including autonomous Ralph runs, so it is the one place these rules
are stated. `CONTRIBUTING.md` covers human onboarding (setup, commands, why each gate exists);
`scripts/ralph/CLAUDE.md` holds only the Ralph loop contract.

## Orientation

| Question                                 | Document                                 |
| ---------------------------------------- | ---------------------------------------- |
| Why this stack and this architecture?    | `docs/tech_stack_architecture_sketch.md` |
| What must the software do?               | `docs/user_stories_mvp.md`               |
| What is the domain?                      | `docs/domain_analysis.md`                |
| How is the code actually organised?      | `docs/technical_documentation.md`        |
| How is the dev setup and pipeline built? | `docs/fd_dev_setup_overview.md`          |
| What am I building next, story by story? | `tasks/` (one PRD per user story)        |

`docs/` is the source of truth for _what FD needs_ — treat it as given unless a decision changed, in
which case update it. `tasks/` is the implementation-facing translation of it.

## What this project optimises for

Test-driven development, high coverage on the pure layers, and maintainability over five-plus years —
possibly by a different developer. It is a small application (~240 customers, ~4 users, one
distribution a week) that will be extended but will never grow vast. **Volume is irrelevant;
legibility is the constraint.** Prefer boring, stable, replaceable pieces over clever ones.

## Architecture rules (non-negotiable)

Dependencies point inwards only: `app → application → domain`.

- `domain/` is pure: it imports **nothing** from Next.js, React or Prisma, does zero I/O, and never
  reads the wall clock.
- `application/` orchestrates; it reaches persistence and time only through the interfaces in
  `ports.ts`.
- `app/` is thin: validate with Zod → call one use case → render. Business logic here is a bug.
- `infrastructure/` is the only layer that touches Prisma, the filesystem or the clock.

**These four rules are enforced by ESLint**, not by review — see `fd/domain-boundary` and
`fd/application-boundary` in `eslint.config.mjs`, proved by `src/architecture.test.ts`. A violation
fails `npm run lint` and therefore CI. If a rule ever blocks legitimate work, change the config
deliberately and say why in the commit; do not add an inline disable.

## Coding style

- TypeScript **strict**; no `any`, no non-null `!` — narrow or fail loudly.
- **Time is injected.** Take a `Clock`; the only wall-clock read in the codebase is
  `src/infrastructure/clock.ts`. (A zero-argument `new Date()` is a lint error in domain and
  application; `new Date(someValue)` is fine — it transforms a value that was passed in.)
- **Derive, don't store** anything computable — grown-up/children counts, portion allowance, card
  validity. Two sources of truth is the Excel failure we are replacing.
- **Money is integer cents**, never a float. Format via `src/domain/money.ts`.
- **Policy values are data, not constants** — the prices per head, portions and the quota `N` live in
  settings with an `effectiveFrom` date.
- Throw **typed domain errors** from `errors.ts`; no bare `throw new Error("…")`.
- **Identifiers English, UI strings German**, and only in `src/i18n/de.ts` — no German literals in
  components.
- Prefer pure functions and value objects (`CardNumber`) over primitives passed around.
- Formatting and import order are Prettier's and ESLint's job — never argue about them in review.

## Testing

| Layer             | Approach                                                                     |
| ----------------- | ---------------------------------------------------------------------------- |
| `domain/`         | Strict TDD, red → green → refactor. Write the invariant-breaking test first. |
| `application/`    | TDD against hand-written fakes. Prefer fakes over mocking libraries.         |
| `infrastructure/` | Test-after, thin integration tests against a throwaway SQLite file.          |
| `app/`            | Cover via Playwright. Logic here is a smell — push it down.                  |

- One named test per business rule, named after the rule rather than the function:
  `turns grown-up on the 13th birthday, not the day before`.
- **Synthetic test data only** (Faker). Never real names, addresses or certificates in fixtures.
- Coverage on `domain/` and `application/` is gated at 100% in `vitest.config.ts`. That number is a
  _consequence_ of TDD on pure logic — don't chase it in UI or infrastructure, where it invites
  low-value tests.
- Time-dependent rules deserve named boundary tests against a fake clock: the day before, the day of
  and the day after, plus 29 February.

## Database migrations

**Migration history is disposable until FD holds real data.** Pre-release, a schema change that
contradicts an earlier migration _replaces_ it: delete `prisma/migrations/`, regenerate with
`npx prisma migrate dev --name init`, then `npm run db:reset`. Do not stack a corrective migration
onto a schema no one has ever run — the history would describe a system that never existed, and the
next reader would take it for a decision FD once made.

**The moment FD enters their first real customer, this reverses.** Migrations become append-only:
never edited, never deleted, because from then on they run against data that cannot be regenerated.
That record — not a version tag or a deploy — is the boundary. A build FD clicks around in with
seeded data is still pre-release.

`npm run db:reset` deletes `data/fd.db`, re-applies the migrations and re-seeds. Reach for it after
any history rewrite: the schema and the database drift apart silently, and the first symptom is the
settings screen reporting that nothing is configured.

## Git

- **Small commits, one intent each.** A commit either refactors or changes behaviour — never both.
- **Conventional commit messages:** `feat(domain): derive household composition from birthdates`.
  Subject in imperative, ≤72 chars. Use the body for _why_, not _what_ — the diff says what.
- **Branch per unit of work**, rebase on `main`, squash-merge via PR. For hand-written changes that
  is typically one story (`feat/us-01-register-customer`); for a Ralph run it is one PRD batch
  (`ralph/us-01-register-customer`, see `scripts/ralph/prds/README.md`). `main` is ruleset-protected —
  everything lands through a PR.
- **Green before push.** Hooks run lint + unit tests; don't `--no-verify`.
- Never commit `data/fd.db`, `.env`, or anything containing real customer data.

## Don'ts

- ❌ Don't put business rules in a server action, React component or Prisma query.
- ❌ Don't hard-code a price, portion count or threshold.
- ❌ Don't hard-delete customer data — archive (status change) and keep it queryable.
- ❌ Don't skip the audit entry on a state change (archive, block, group move, card reissue, policy
  edit). With no login, the log is the only accountability the system has — and it records _what,
  when and why_, never _who_. The _why_ is required where it is the record (archive, block) and
  optional where the changed fields already say it (a policy edit).
- ❌ Don't add a dependency to avoid ~50 lines of code, and don't reach for a heavier pattern
  (events, CQRS, aggregates) than the problem needs.
- ❌ Don't bump the Next.js major casually — it is pinned on purpose.

## Done means

Tests written first for domain and application work, CI green, the architecture boundary intact,
German strings in the dictionary, an audit entry wherever state changed, and documentation updated if
a decision changed.
