# FD-Management — Technical Documentation

Developer-facing reference for the **code as it is actually built**. It complements the other docs
rather than repeating them:

- `tech_stack_architecture_sketch.md` — _why_ the stack and architecture were chosen (rationale).
- `domain_analysis.md` / `user_stories_mvp.md` — _what_ the software must do (domain & requirements).
- `fd_dev_setup_overview.md` — the dev process, pipeline, and TDD approach at a glance.
- `CONTRIBUTING.md` (repo root) — day-to-day workflow and why each quality gate exists.

This file describes _how_ the current codebase is organised and how to work in it.

> **Status:** walking skeleton. The app boots and is fully wired for TDD and CI, but carries no
> domain features yet. Sections below mark clearly what exists vs. what is a documented placeholder.

---

## 1. Technology stack (as installed)

| Concern    | Choice                                      | Version (pinned in `package.json`)       |
| ---------- | ------------------------------------------- | ---------------------------------------- |
| Language   | TypeScript (strict)                         | `^5`                                     |
| Runtime    | Node.js LTS                                 | `22` (`.nvmrc`, `engines.node >=22 <23`) |
| Framework  | Next.js (App Router)                        | `16.2.10` (exact)                        |
| UI runtime | React / React DOM                           | `19.2.4` (exact)                         |
| Styling    | Tailwind CSS v4 (`@tailwindcss/postcss`)    | `^4`                                     |
| Database   | SQLite                                      | file-based                               |
| ORM        | Prisma (native `sqlite` provider)           | `^6` (client generated at 6.19.x)        |
| Validation | Zod                                         | `^3` (installed, not yet used)           |
| Unit tests | Vitest + `@vitest/coverage-v8`              | `^3`                                     |
| E2E tests  | Playwright                                  | `^1.5`                                   |
| Lint       | ESLint 9 flat config + `eslint-config-next` | `^9`                                     |
| Format     | Prettier + `lint-staged`                    | `^3` / `^15`                             |
| Git hooks  | Husky                                       | `^9`                                     |

**Deviations from the original sketch** (all recorded in `fd_dev_setup_overview.md`):

- **Native SQLite provider**, not the `better-sqlite3` driver adapter — deferred until real queries exist.
- **No `next/font/google`** — a system-font stack avoids a build-time network dependency.
- **No `tailwind.config.*`** — Tailwind v4 configures the theme inline in `src/app/globals.css`.
- **shadcn/ui not yet initialised** — added with the first real components.

---

## 2. Repository layout

```text
.
├── .devcontainer/devcontainer.json   # pinned Node 22 + editor extensions (also Codespaces)
├── .github/
│   ├── workflows/ci.yml              # 4-job pipeline (see §7)
│   ├── workflows/codeql.yml          # CodeQL security analysis
│   └── dependabot.yml                # weekly npm + github-actions updates
├── .husky/{pre-commit,pre-push}      # lint-staged / unit tests
├── data/                             # SQLite db lives here at runtime (git-ignored; .gitkeep tracked)
├── docs/                             # all project documentation (this file included)
├── prisma/
│   ├── schema.prisma                 # datasource + models (placeholder model today)
│   └── migrations/                   # committed migration history
├── src/
│   ├── app/                          # Next.js App Router — thin adapter layer
│   │   ├── layout.tsx                # root layout, <html lang="de">, metadata from i18n
│   │   ├── page.tsx                  # home page (reads strings from i18n dictionary)
│   │   └── globals.css               # Tailwind v4 import + theme + base styles
│   ├── domain/                       # pure TypeScript, zero I/O (unit-tested)
│   │   ├── money.ts                  # integer-cents euro formatting (the one real module)
│   │   ├── money.test.ts             # its Vitest spec
│   │   ├── errors.ts                 # DomainError base class + typed error classes
│   │   ├── policy/settings.ts        # policy values + effective-from resolution
│   │   ├── policy/settings.test.ts   # its Vitest spec
│   │   ├── customer/ card/ distribution/           # empty, reserved by the architecture
│   ├── application/
│   │   └── ports.ts                  # repository/service interfaces (Clock today)
│   ├── infrastructure/
│   │   ├── clock.ts                  # systemClock adapter (implements Clock port)
│   │   ├── audit.ts                  # append-only audit log (placeholder)
│   │   └── prisma/                   # reserved for Prisma repository implementations
│   └── i18n/de.ts                    # single German UI-string dictionary
├── tests/e2e/home.spec.ts            # Playwright smoke test
├── eslint.config.mjs  .prettierrc.json  .prettierignore
├── vitest.config.ts   playwright.config.ts
├── next.config.ts     postcss.config.mjs   tsconfig.json
└── package.json       package-lock.json
```

---

## 3. Architecture — layered core with thin adapters

The pattern is **hexagonal-lite**. The one rule that matters:

> **The domain layer imports nothing from Next.js, React, or Prisma.**

Everything else is a replaceable adapter around it. Dependencies point inward only:

```text
   app/ (Next.js)  ─────────────┐
                                 ▼
   infrastructure/  ──────►  application/  ──────►  domain/
   (Prisma, clock,           (use cases,           (pure rules,
    audit, fs, time)          ports.ts)             value objects)
```

| Layer          | Directory            | Responsibility                                                         | I/O?      |
| -------------- | -------------------- | ---------------------------------------------------------------------- | --------- |
| Domain         | `src/domain`         | Pure business rules & value objects. Deterministic, unit-tested.       | Never     |
| Application    | `src/application`    | Use cases (one per business action); declares the ports it needs.      | Via ports |
| Infrastructure | `src/infrastructure` | The only place that touches Prisma, the filesystem, or the wall clock. | Yes       |
| Presentation   | `src/app`            | Next.js routes/components. Validate input (Zod), call one use case.    | HTTP/UI   |

**Why:** testability (the interesting logic is pure functions tested in milliseconds), change
tolerance (policy values are data, not code), and framework insurance (replacing Next.js touches
only `src/app`). See `tech_stack_architecture_sketch.md` §4 for the full argument.

**Enforcement:** the dependency rule is a **build failure**, not a convention. `eslint.config.mjs`
carries two boundary configs — `fd/domain-boundary` and `fd/application-boundary` — combining
`no-restricted-imports` (framework, Prisma, filesystem and outer-layer imports) with
`no-restricted-syntax` (a zero-argument `new Date()` or `Date.now()`, i.e. a wall-clock read).
`src/architecture.test.ts` lints code samples through the real config to prove each rule fires, and
that legitimate code — `new Date(valuePassedIn)`, importing the domain from the application layer —
still passes. Review is not part of the enforcement path, which matters because autonomous Ralph runs
have no reviewer in the loop.

---

## 4. Key modules (what exists today)

### `src/domain/money.ts`

The proof-of-life pure module and the seam for the **money-as-integer-cents** rule (SQLite has no
decimal type; prices are never floats). `formatEuros(cents)` renders `150 → "1,50 €"` with manual
formatting (not `Intl`) so output is deterministic across environments, and throws `RangeError` on
non-integer input. Fully unit-tested (`money.test.ts`), which is what keeps domain coverage at 100%.

### `src/application/ports.ts`

The interfaces the application layer depends on. Today it holds only the **`Clock`** port
(`now(): Date`). Per the TDD approach, ports **emerge from test needs** rather than being designed
up front — repository interfaces are added as use cases require them. Type-only, so it adds no
runtime code to the coverage-measured layers.

### `src/infrastructure/clock.ts`

`systemClock` — the real, wall-clock implementation of the `Clock` port and the **only** place
`new Date()` is called. Every time-dependent rule (13th-birthday reclassification, certificate
expiry, week-colour alternation, price effective-from dating) reads "now" through this port so a
settable fake clock can drive deterministic tests.

### `src/domain/errors.ts`

The `DomainErrorCode` union — the closed set of failure modes — plus an abstract `DomainError` base
class and one concrete subclass per kind (`InvalidSettings`, `NoSettingsInForce`,
`NoPriceForHousehold` today). Each carries the values that made it fail, so the UI can render a
German message naming concrete numbers without re-deriving them, and callers switch on `code`
instead of parsing strings.

### `src/domain/policy/settings.ts`

The policy values FD can change without a deploy — quota `N`, portions per grown-up and per child,
the reminder threshold, the price table, the week-cycle anchor and the distribution weekday — and
the rule that decides which of them apply on a given day. Versions are **immutable and dated**:
`resolveSettingsAt(versions, date)` returns the version with the greatest `effectiveFrom` that is
not after `date`, and throws `NoSettingsInForce` rather than returning a partial object. This
matters because a distribution record stores only a `paid` flag (US-05), so the only way to answer
"what did that customer owe last March" is to resolve the version in force then.

`createSettings(input)` validates every invariant on construction (quota ≥ 1, portions ≥ 0,
threshold ≥ 1, ISO weekday 1–7, an `YYYY-Www` anchor, non-negative integer cents, no duplicate
household row) and throws `InvalidSettings` naming the field. `priceFor(settings, grownUps,
children)` returns the exactly matching row's cents or throws `NoPriceForHousehold` — it never
interpolates, because an unpriced household size is a settings gap for staff to fix, not a number
to invent. The module is pure: no I/O, no wall clock, and it works over an already-loaded array so
the counter screen (US-04) resolves settings without a per-field query.

### `src/infrastructure/audit.ts`

Placeholder for the **append-only audit log**. Every state change will be recorded with a timestamp
and reason — but **never an actor**: FD has ruled out login, so the system records _what / when /
why_, never _who_. Adding an actor field would be an additive change if login is ever introduced.

### `src/i18n/de.ts`

A single `const de = {…} as const` dictionary of German UI strings, plus the derived `Dictionary`
type. All user-facing text lives here; **code identifiers stay English**. `layout.tsx` and
`page.tsx` read from it, so there are no hard-coded strings in components.

---

## 5. Data & persistence

### Prisma + SQLite

- `prisma/schema.prisma` declares a `sqlite` datasource whose URL comes from `env("DATABASE_URL")`
  and a `prisma-client-js` generator (client generated to the default `node_modules/@prisma/client`).
- The schema currently holds a single placeholder model (`SchemaMarker`) so `prisma validate`,
  `migrate diff`, and `migrate deploy` all have something valid to run against in CI and E2E. The
  real models (Customer, HouseholdMember, Card, DistributionRecord, Setting, …) replace it next.
- Migration history is committed under `prisma/migrations/`. Apply it with
  `npx prisma migrate deploy`; create new migrations during development with `npx prisma migrate dev`.

### ⚠️ SQLite path resolution (important gotcha)

Prisma resolves a relative `file:` URL **relative to the `prisma/schema.prisma` directory**, _not_
the repo root or the current working directory. To place the database in the repo-root `data/`
directory (the backup unit named in the architecture sketch), the URL therefore uses `../data/…`:

```
DATABASE_URL="file:../data/fd.db"      # → <repo>/data/fd.db
```

This is consistent across `.env`, the Playwright web-server env, and the CI job envs (which use
`../data/ci.db` and `../data/e2e.db`). The `data/` directory is tracked via `.gitkeep`; the `*.db`
files themselves are git-ignored. When the first real runtime queries are added, re-verify that the
**generated client** resolves the same path at runtime (relative SQLite paths are a known Prisma
footgun) — until then only the CLI touches the DB.

---

## 6. Configuration & environment

| File                  | Purpose                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `.env` (git-ignored)  | Local `DATABASE_URL`. Copy from `.env.example`.                              |
| `.env.example`        | Template; documents the `../data/…` path resolution.                         |
| `.nvmrc`              | Node `22`; `nvm use` / CI `node-version-file` read it.                       |
| `next.config.ts`      | Next.js config (default; extension point).                                   |
| `postcss.config.mjs`  | Wires `@tailwindcss/postcss`.                                                |
| `src/app/globals.css` | `@import "tailwindcss";` + `@theme` tokens + base body styles (Tailwind v4). |
| `tsconfig.json`       | `strict`, `moduleResolution: bundler`, path alias `@/* → src/*`.             |

The `@/*` alias is honoured by TypeScript, Next.js, and Vitest (the latter via an explicit
`resolve.alias` in `vitest.config.ts`).

---

## 7. Testing

### Unit tests — Vitest (`vitest.config.ts`)

- `environment: node`; test files matched as `src/**/*.{test,spec}.ts`.
- **Coverage is deliberately scoped** to `src/domain/**` + `src/application/**` only, with 100%
  line/branch/function/statement thresholds. High coverage there is a _consequence_ of TDD on pure
  logic — not a number chased across UI/infrastructure where it would invite low-value tests.
- Type-only files in those layers (`ports.ts`) transpile to no runtime statements, so they pass the
  thresholds without needing tests. Files that do carry runtime code — including the error classes
  in `errors.ts` — are covered by the spec of the rule that raises them.
- Run: `npm test` (or `npm run test:coverage`, `npm run test:watch`).

### End-to-end — Playwright (`playwright.config.ts`)

- `testDir: tests/e2e`; runs Chromium against the **built** app.
- `webServer` runs `npx prisma migrate deploy && npm run start` over a throwaway `data/e2e.db`,
  mirroring the CI `e2e-tests` job. `reuseExistingServer` is on locally, off in CI.
- Today: one smoke test asserting the German `<h1>` renders. The distribution-day and registration
  flows are added alongside the features they cover.
- Run: `npm run test:e2e` (first time locally: `npx playwright install --with-deps chromium`).

### TDD approach per layer

| Layer             | Approach                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| `domain/`         | Strict TDD — pure, fast; test the **invariant-breaking case first**.      |
| `application/`    | TDD against hand-written fakes (prefer fakes over mock libraries).        |
| `infrastructure/` | Test-after, thin integration tests vs. a throwaway SQLite file.           |
| `app/`            | Test-after or cover via Playwright; logic here is a smell — push it down. |

Test data is **synthetic only** (Faker) — never real customer or certificate data in fixtures.

---

## 8. Quality gates & tooling

- **ESLint** (`eslint.config.mjs`): flat config composing `eslint-config-next` (core-web-vitals +
  typescript) with `eslint-config-prettier` last (disables formatting-conflicting rules). Generated
  and build output are globally ignored. Run: `npm run lint`.
- **Prettier** (`.prettierrc.json`, `.prettierignore`): `printWidth 100`, trailing commas. Run:
  `npm run format` / `npm run format:check`. Formatting is a local auto-fix, not a CI gate.
- **lint-staged** (config in `package.json`): `eslint --fix` + `prettier --write` on staged code;
  `prettier --write` on staged json/css/md/yaml.
- **Husky** (`.husky/`): `pre-commit` → `lint-staged`; `pre-push` → `npm test`.

---

## 9. CI/CD pipeline (`.github/workflows/ci.yml`)

Runs on every push and PR to `main`. Concurrency cancels superseded runs. A dummy workflow-level
`DATABASE_URL` lets `prisma validate` / `next build` resolve `env("DATABASE_URL")`.

| Job                  | Steps                                                                      | Purpose                                                                                 |
| -------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `lint-and-typecheck` | `npm ci` → `prisma generate` → eslint → `tsc --noEmit` → `prisma validate` | Static correctness & schema validity                                                    |
| `unit-tests`         | `npm ci` → `prisma generate` → `vitest run --coverage`                     | Domain/application logic + coverage gate                                                |
| `build`              | `npm ci` → `prisma generate` → `next build`                                | Production build compiles                                                               |
| `e2e-tests`          | `needs: build`; install Chromium `--with-deps` → build → `test:e2e`        | Real-browser smoke vs. built app + fresh sqlite; uploads the Playwright report artifact |

Alongside the four jobs: **CodeQL** (`codeql.yml`, javascript-typescript, weekly + on PR),
**Dependabot** (weekly npm + github-actions, minor/patch grouped), and GitHub secret scanning.

**Branch protection:** wire these four jobs as required checks on `main` in repo settings — the plan
names them so they are ready to be marked required; the toggle itself is a maintainer action.

---

## 10. Local development workflow

```bash
nvm use                      # Node 22
npm install                  # also installs Husky hooks (prepare script)
cp .env.example .env
npx prisma migrate deploy    # creates data/fd.db
npm run dev                  # http://localhost:3000
```

Before opening a PR:

```bash
npm run lint && npm run typecheck && npm run test:coverage && npm run build
```

| Command                                     | What it does                                   |
| ------------------------------------------- | ---------------------------------------------- |
| `npm run dev`                               | Dev server                                     |
| `npm run build` / `start`                   | Production build / serve it                    |
| `npm run lint` / `typecheck`                | ESLint / `tsc --noEmit`                        |
| `npm test` / `test:coverage` / `test:watch` | Vitest variants                                |
| `npm run test:e2e`                          | Playwright                                     |
| `npm run format` / `format:check`           | Prettier                                       |
| `npm run prisma:*`                          | `generate` / `validate` / `migrate` / `deploy` |

---

## 11. Conventions

- **German UI, English code.** All user-facing text goes through `src/i18n/de.ts`; identifiers,
  comments, and filenames are English and greppable.
- **Money is integer cents**, never floats. Format via `src/domain/money.ts`.
- **Time comes from the `Clock` port**, never `new Date()` in domain/application code.
- **Policy values are data, not constants** — portions, price table, reminder threshold, quota `N`
  will live in the DB with an _effective-from_ date, editable in the UI.
- **No actor in state records** — there is no login, so audit records never say _who_.
- **Push logic down** — anything non-trivial in `src/app` belongs in a use case or the domain.

---

## 12. Extending the system — adding a feature

A feature is a vertical slice through the layers, built bottom-up and test-first:

1. **Domain** — model the rule as pure functions / value objects in `src/domain/<area>`; TDD the
   invariant-breaking case first (e.g. duplicate customer number, wrong group for the week).
2. **Ports** — if the use case needs to read or persist data, add the interface it requires to
   `src/application/ports.ts` (let it emerge from the test).
3. **Use case** — add `src/application/<action>.ts`, orchestrating the domain against the ports;
   TDD it with a hand-written fake repository and a fake clock.
4. **Infrastructure** — implement the port with a Prisma repository in `src/infrastructure/prisma`;
   add/adjust the schema and a migration; cover with a thin integration test vs. a throwaway db.
5. **Presentation** — add a Next.js route/server action in `src/app` that validates input with Zod,
   calls the one use case, and renders. Add German strings to `src/i18n/de.ts`.
6. **E2E** — add a Playwright spec for the user-visible flow.

The recommended build order for the MVP is **US-14 → US-01 → US-02 → US-03 → US-04 → US-05** (config
and week-cycle first, because registration needs the quota `N` and the counter needs today's
colour). See `user_stories_mvp.md` §5.

---

## 13. Operations (summary)

- **Run:** `npm run build && npm start` → `http://localhost:3000`, bound to localhost only.
- **Backup:** copy `data/fd.db` (with a WAL checkpoint) to an external location — the single most
  important operational task.
- **Auth:** none by design — 3–4 trusted staff share one machine; physical access is the access
  control. Full rationale in `tech_stack_architecture_sketch.md` §6.

---

## 14. Roadmap / deferred

- Domain value objects, TDD-first: injectable **fake clock**, **CardNumber** (`<no>k<index>`),
  **WeekColor** alternation, **HouseholdComposition** (13th-birthday split against a fake clock,
  incl. the day-before / day-of / day-after and 29 Feb edge cases).
- Real Prisma models & repositories; the `better-sqlite3` driver adapter.
- Policy/price-table schema with effective-from dating.
- shadcn/ui component setup; the counter, registration, and list screens.
- Typed domain error classes and the concrete append-only audit log.

```

```
