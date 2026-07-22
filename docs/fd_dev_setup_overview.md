# FD — Dev Process & Pipeline Overview

Brief reference for the CI/CD, local dev setup, and TDD approach.

## Bootstrap status (as built)

The walking-skeleton bootstrap has been implemented on branch `bootstrap-walking-skeleton`. What
exists today: a runnable Next.js app (German home page), the hexagonal folder structure with
documented placeholders, one TDD'd pure-domain module (`src/domain/money.ts`) proving the harness,
Prisma + SQLite with an initial migration, Vitest + Playwright, ESLint/Prettier + Husky hooks, and
the four-job CI pipeline. Concrete choices and small deviations from the original sketch:

- **Versions:** Node 22, Next.js 16 (App Router, exact-pinned) + React 19, Tailwind CSS v4
  (`@tailwindcss/postcss`, no `tailwind.config` file — theme lives in `src/app/globals.css`), ESLint
  9 flat config, Vitest 3, Prisma 6.
- **SQLite driver:** the skeleton uses Prisma's **native** SQLite provider. Wiring the
  `better-sqlite3` driver adapter named in the stack doc is deferred until `infrastructure/` gains
  real repositories — it buys nothing while there are no queries.
- **Fonts:** the default `next/font/google` (Geist) was dropped in favour of a system-font stack, so
  neither build nor runtime needs network access to Google Fonts.
- **shadcn/ui:** not yet initialised — added when the first real components are built.
- **Coverage:** placeholder files in the covered layers (`errors.ts`, `ports.ts`) are intentionally
  **type-only**, so 100% thresholds pass without untested runtime code.
- **CodeQL / Dependabot:** committed as `.github/workflows/codeql.yml` and `.github/dependabot.yml`.

Branch-protection required-check wiring on `main` is a repo-settings task for the maintainer; the
jobs are named and ready to be marked required.

## CI Pipeline (GitHub Actions)

Four jobs, required as branch protection checks on `main`:

```
lint-and-typecheck   →  eslint + tsc --noEmit + prisma validate
unit-tests           →  vitest --coverage (domain + application only)
build                →  next build
e2e-tests            →  needs: build; playwright vs. built app + fresh sqlite
```

- **Lint:** ESLint (`typescript-eslint`, Next.js/React-hooks plugins)
- **Format:** Prettier via lint-staged (auto-fix locally, not a CI gate)
- **Types:** `tsc --noEmit` as its own fast-failing step
- **Unit tests:** Vitest, coverage threshold scoped to `src/domain` + `src/application` only
- **Schema drift:** `prisma validate` + `prisma migrate diff`
- **E2E:** Playwright on `ubuntu-latest`, `npx playwright install --with-deps`, runs against `npm start` + a throwaway seeded SQLite file — runs fine in GitHub Actions, no Docker needed
- **Dependencies/security:** Dependabot + CodeQL (both built-in, free) + GitHub secret scanning
- **Test data:** synthetic only (Faker-generated) — never real customer/certificate data in fixtures

## Local Dev Setup

- **Pre-commit hook** (Husky + lint-staged): `eslint --fix` + `prettier --write` on staged files
- **Pre-push hook:** `vitest run` before allowing a push
- **Node version pin:** `.nvmrc` / `engines` in `package.json`
- **`.env.example`** for `DATABASE_URL` etc.
- **Devcontainer** (`.devcontainer/devcontainer.json`): pins Node + editor extensions (ESLint, Prisma, Playwright) — also enables GitHub Codespaces
- **`CONTRIBUTING.md`:** documents the pipeline and _why_ each gate exists (esp. coverage scope, no-actor audit log, framework-insurance boundary)

## TDD Approach

| Layer             | Approach                                                          |
| ----------------- | ----------------------------------------------------------------- |
| `domain/`         | Strict TDD — pure functions, no I/O, fast                         |
| `application/`    | TDD against hand-written fakes (prefer fakes over mock libraries) |
| `infrastructure/` | Test-after, thin integration tests vs. real throwaway SQLite      |
| `app/` (Next.js)  | Test-after or skip to E2E; logic here is a smell — push it down   |

Key habits:

- Write a fake, settable **clock** first — nearly every domain rule (13th birthday, certificate expiry, week alternation, stamping a settings change) depends on it
- TDD the **invariant-breaking case first** (duplicate customer number, two active cards, out-of-order week) before the happy path
- Let `ports.ts` interfaces **emerge** from application-layer test needs, not be pre-designed
- Coverage near 100% on domain/application is a _consequence_ of TDD, not a goal to chase elsewhere
- Design the **policy/price-table schema** up front on paper — that's data modeling, not something to derive from failing tests
