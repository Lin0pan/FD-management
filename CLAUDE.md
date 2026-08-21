# FD-Management

Software supporting the daily operations of the Delbrücker Füllhorn food bank, including customer
administration, eligibility checks, and food distribution tracking.

This file is the **engineering standard** for the project. It is loaded automatically by every Claude
Code session in this repository, including autonomous Ralph runs, so it is the one place these rules
are stated. `CONTRIBUTING.md` covers human onboarding (setup, commands, why each gate exists);
`scripts/ralph/CLAUDE.md` holds only the Ralph loop contract.

## Orientation

| Question                                         | Document                                      |
| ------------------------------------------------ | --------------------------------------------- |
| Why is the architecture the way it is?           | `docs/architecture/` — arc42 chapters + ADRs  |
| How is the code organised, and what lives where? | `docs/architecture/05-building-block-view.md` |
| What must the software do?                       | `tasks/` (one PRD per user story)             |
| What is the domain?                              | `docs/archiv/domain_analysis.md`              |
| How is the dev setup and pipeline built?         | `docs/architecture/07-deployment-view.md`     |
| What am I building next, story by story?         | `tasks/`                                      |
| How do I style a screen?                         | `docs/guideline/ui_styling_guide.md`          |
| What does DF themselves get handed?              | `docs/handout/` (German, printable)           |

`docs/architecture/` is the architecture record: a change that makes a chapter wrong updates that
chapter in the same PR, and a hard-to-reverse choice gets an ADR.

`docs/archiv/` holds the early material the build has overtaken — `domain_analysis.md` is still the
best statement of DF's process, `user_stories_mvp.md` is an early MVP scope and **not current**.
Read them as background, do not extend them, and treat `tasks/` as the record of what is required.

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
  validity. Two sources of truth is the Excel failure we are replacing. There are exactly three
  exceptions, each with an argument of its own kind:
  - `Card.grownUpsAtIssue` / `childrenAtIssue` / `groupAtIssue` — a snapshot of what was _printed_ on
    a physical card, so a birthday that overtook the counts (US-13) or a move between RED and BLUE
    (US-16.4) can be spotted. Never read as the household's counts or group — those are
    `composition(members, today)` and `Customer.group` — and never updated: a reissue is how a change
    is recorded.
  - `Customer.firstNameFolded` / `lastNameFolded` — a **search key**, not a fact (US-11). SQLite can
    fold neither umlauts nor Unicode case in a `WHERE` clause, so `foldName`'s output is stored and
    indexed. Never displayed and never read as the name; written from the names in the same
    statement, so a write that changes a name must rewrite them with it.
  - `Card.customerNumber` — a **key**, in the same sense `firstNameFolded` is one (US-25). The
    `@@unique([customerNumber, index])` that makes a card number unique for good needs the slot on
    the card row itself, and `MAX(index) WHERE customerNumber = ?` is the question the counting rule
    asks. Unlike the three `AtIssue` fields it snapshots **nothing**: a customer number is fixed at
    registration and released only by archiving, so there is no later value for it to disagree with.
    Written by the adapter off the customer row in the same transaction as the insert, and never read
    as the card's number: what a card number _is_ stays the pair `customer.customerNumber` and
    `card.index` put through `formatCardNumber`, derived at every read.

  Any further "just store it" needs an argument of that kind.

- **Money is integer cents**, never a float. Format via `src/domain/money.ts`.
- **Policy values are data, not constants** — the prices per head, portions and the quota `N` live
  in settings, editable in the UI. A saved change is in force immediately; superseded versions are
  kept as read-only history.
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
- **UI work is always driven with the `playwright-cli` skill** — building a screen and reviewing it, not
  only when asked to test one. The e2e suite proves the contracts still hold; `playwright-cli` is how you
  find out whether the screen is any good, because its accessibility snapshot shows what the markup
  _means_ and a screenshot does not. `docs/guideline/ui_styling_guide.md` §11 has the workflow.
- **Two engines, both gated.** DF run Safari, and a replacement machine would bring a Chromium-based
  browser, so the suite runs on both: `npm run test:e2e` and `npm run test:e2e:webkit`, each over
  registers of its own (`tests/e2e/registers.ts`, ADR-012). Never branch on `browserName` in `src/`
  — if the engines disagree, the markup is what is wrong. WebKit is **not** Safari, so UI work also
  needs one look in real Safari on a Mac; the macOS date picker is beyond what CI can see.

## Database migrations

**Migration history is disposable until DF holds real data.** Pre-release, a schema change that
contradicts an earlier migration _replaces_ it: delete `prisma/migrations/`, regenerate with
`npx prisma migrate dev --name init`, then `npm run db:reset`. Do not stack a corrective migration
onto a schema no one has ever run — the history would describe a system that never existed, and the
next reader would take it for a decision DF once made.

**The moment DF enters their first real customer, this reverses.** Migrations become append-only:
never edited, never deleted, because from then on they run against data that cannot be regenerated.
That record — not a version tag or a deploy — is the boundary. A build DF clicks around in with
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
- ❌ Don't hard-delete customer data — archive (status change) and keep it queryable. **No relation
  in `schema.prisma` may carry `onDelete: Cascade`**, so the database refuses the delete rather than
  trusting that no one calls it; `src/infrastructure/prisma/schema.test.ts` fails if one reappears.
  A **nullable** relation must say `onDelete: Restrict` out loud: Prisma's default for an optional
  relation is `SetNull`, which the schema test cannot see, so it also greps the generated migration
  SQL. An integration test that clears the register therefore deletes children first — use
  `clearRegister` from `src/infrastructure/prisma/test-support.ts`. The one deliberate exception is a
  household's member rows: editing a household **replaces** the set (`updateHousehold`, and
  `updateDetails` with it — the customer is one of those rows, so their own name lives there too),
  because no history of past compositions is kept (US-16, FR-2) and what a household was survives on
  the card that printed its counts. Nothing else in the schema may be deleted.
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
