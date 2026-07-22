# Contributing to FD-Management

FD-Management is the operations software for the Delbrücker Füllhorn food bank: customer
administration, eligibility checks, and food-distribution tracking. It is small, long-lived, and may
one day be maintained by a different developer — so the priorities are **maintainability, high test
coverage, and reliability** over cleverness or breadth.

Read `docs/` first — especially `tech_stack_architecture_sketch.md` (stack + architecture) and
`fd_dev_setup_overview.md` (dev process). This file explains the day-to-day workflow and, more
importantly, **why each quality gate exists**.

The coding standard itself — architecture rules, style, testing approach, git conventions, the
definition of done — lives in the repository-root `CLAUDE.md`. It is stated once there and binds
humans and agents alike; this file does not restate it.

## Getting started

Requires **Node 22** (see `.nvmrc`; `nvm use` picks it up).

```bash
npm install                 # also installs Husky git hooks via the "prepare" script
cp .env.example .env        # sets DATABASE_URL to the local SQLite file
npx prisma migrate deploy   # creates data/fd.db from the committed migrations
npm run db:seed             # seeds the provisional settings version (no-op if one exists)
npm run dev                 # http://localhost:3000
```

## Everyday commands

| Command                 | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `npm run dev`           | Next.js dev server                                       |
| `npm run build`         | Production build                                         |
| `npm start`             | Serve the production build                               |
| `npm run lint`          | ESLint                                                   |
| `npm run typecheck`     | `tsc --noEmit`                                           |
| `npm test`              | Vitest unit suite (domain + application)                 |
| `npm run test:coverage` | Vitest with coverage (thresholds enforced)               |
| `npm run test:e2e`      | Playwright against the built app + a throwaway SQLite db |
| `npm run format`        | Prettier write                                           |

## Architecture in one paragraph

Hexagonal-lite (`docs/tech_stack_architecture_sketch.md` §4). The **domain layer imports nothing
from Next.js, React or Prisma** — it is pure TypeScript, unit-tested in milliseconds. `application/`
holds use cases and the repository interfaces (`ports.ts`) they need; `infrastructure/` is the only
place that touches Prisma, the filesystem, or the wall clock; `app/` is a thin Next.js adapter. Push
logic _down_ — logic in `app/` is a smell.

## Test-driven development

- `domain/` — strict TDD, pure functions, no I/O. TDD the **invariant-breaking case first**
  (duplicate customer number, two active cards, out-of-order week colour) before the happy path.
- `application/` — TDD against hand-written fakes (prefer fakes over mock libraries); let `ports.ts`
  interfaces **emerge** from test needs.
- `infrastructure/` — test-after, thin integration tests vs. a throwaway SQLite file.
- `app/` — test-after or cover via Playwright E2E.
- Time-dependent rules (13th birthday, certificate expiry, week alternation, price effective-from)
  read "now" through an injectable **clock** so tests are deterministic — never call `new Date()` in
  domain code.
- **Test data is synthetic only** (Faker) — never real customer or certificate data in fixtures.

## Git hooks (Husky)

- **pre-commit** → `lint-staged`: `eslint --fix` + `prettier --write` on staged files.
- **pre-push** → `npm test`: the unit suite must pass before a push.

## CI pipeline (`.github/workflows/ci.yml`)

Four jobs run on every PR to `main`; wire them as required branch-protection checks:

| Job                  | Gate                                                           |
| -------------------- | -------------------------------------------------------------- |
| `lint-and-typecheck` | ESLint + `tsc --noEmit` + `prisma validate`                    |
| `unit-tests`         | `vitest --coverage`, thresholds scoped to domain + application |
| `build`              | `next build`                                                   |
| `e2e-tests`          | Playwright vs. the built app + a fresh seeded SQLite file      |

CodeQL, Dependabot, and GitHub secret scanning run alongside.

### Why the gates are shaped this way

- **Coverage is scoped to `src/domain` + `src/application`.** Near-100% there is a _consequence_ of
  TDD on pure logic, not a number to chase across UI and infrastructure where it would only invite
  low-value tests. The threshold guards the layers that carry the business rules.
- **The audit log records no actor.** FD has ruled out login, so the system cannot tell its 3–4
  staff apart. State-change records answer _what / when / why_, never _who_. Do not add an actor
  field unless login is introduced (it would be an additive change).
- **The domain layer must not import Next.js / React / Prisma** ("framework insurance"): if the
  framework is ever replaced, only `src/app/` is thrown away. This is enforced by ESLint
  (`fd/domain-boundary` / `fd/application-boundary` in `eslint.config.mjs`, proved by
  `src/architecture.test.ts`), so a violation fails `npm run lint` and CI rather than waiting for a
  reviewer to notice. The same configs ban wall-clock reads outside `src/infrastructure`.
- **Business rules are configurable data, not constants.** Portions, the price table, the reminder
  threshold, and the quota `N` live in the database with an _effective-from_ date — never hard-coded.
- **Money is integer cents, never floats.** See `src/domain/money.ts`.

## Making a change

1. Branch off `main`.
2. Write the failing test first for domain/application work.
3. Keep the change small and the layers clean.
4. `npm run lint && npm run typecheck && npm run test:coverage && npm run build` locally.
5. Open a PR; ensure all four CI checks are green before merge.
