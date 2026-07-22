# FD-Management — Technical Documentation

Developer-facing reference for the **code as it is actually built**. It complements the other docs
rather than repeating them:

- `tech_stack_architecture_sketch.md` — _why_ the stack and architecture were chosen (rationale).
- `domain_analysis.md` / `user_stories_mvp.md` — _what_ the software must do (domain & requirements).
- `fd_dev_setup_overview.md` — the dev process, pipeline, and TDD approach at a glance.
- `CONTRIBUTING.md` (repo root) — day-to-day workflow and why each quality gate exists.

This file describes _how_ the current codebase is organised and how to work in it.

> **Status:** the app boots, is fully wired for TDD and CI, and carries its first feature end to end
> through every layer — US-14's policy settings: domain rules, use cases, SQLite persistence, seed
> and the `/einstellungen` screen. Sections below mark clearly what exists vs. what is a documented
> placeholder.

---

## 1. Technology stack (as installed)

| Concern            | Choice                                      | Version (pinned in `package.json`)       |
| ------------------ | ------------------------------------------- | ---------------------------------------- |
| Language           | TypeScript (strict)                         | `^5`                                     |
| Runtime            | Node.js LTS                                 | `22` (`.nvmrc`, `engines.node >=22 <23`) |
| Framework          | Next.js (App Router)                        | `16.2.10` (exact)                        |
| UI runtime         | React / React DOM                           | `19.2.4` (exact)                         |
| Styling            | Tailwind CSS v4 (`@tailwindcss/postcss`)    | `^4`                                     |
| Database           | SQLite                                      | file-based                               |
| ORM                | Prisma (native `sqlite` provider)           | `^6` (client generated at 6.19.x)        |
| Validation         | Zod                                         | `^3` (form schemas in `app/`)            |
| Unit tests         | Vitest + `@vitest/coverage-v8`              | `^3`                                     |
| E2E tests          | Playwright                                  | `^1.5`                                   |
| Lint               | ESLint 9 flat config + `eslint-config-next` | `^9`                                     |
| Format             | Prettier + `lint-staged`                    | `^3` / `^15`                             |
| Git hooks          | Husky                                       | `^9`                                     |
| Seed script runner | `tsx` (dev-only, runs `prisma/seed.ts`)     | `^4`                                     |

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
│   ├── schema.prisma                 # datasource + models (SettingsVersion, AuditEntry)
│   ├── seed.ts                       # `npm run db:seed` entry point
│   └── migrations/                   # committed migration history
├── src/
│   ├── app/                          # Next.js App Router — thin adapter layer
│   │   ├── layout.tsx                # root layout, <html lang="de">, metadata from i18n
│   │   ├── page.tsx                  # home page (reads strings from i18n dictionary)
│   │   ├── einstellungen/            # the settings screen (US-14)
│   │   │   ├── page.tsx              # server component: current values + version history
│   │   │   ├── settings-form.tsx     # client component: the form and its save-result state
│   │   │   ├── actions.ts            # "use server": Zod → euros-to-cents → updateSettings
│   │   │   ├── save-settings-state.ts  # the form state (not exportable from actions.ts)
│   │   │   └── deps.ts               # composition root: the real adapters for this screen
│   │   └── globals.css               # Tailwind v4 import + theme + base styles
│   ├── domain/                       # pure TypeScript, zero I/O (unit-tested)
│   │   ├── money.ts                  # integer-cents euro formatting (the one real module)
│   │   ├── money.test.ts             # its Vitest spec
│   │   ├── errors.ts                 # DomainError base class + typed error classes
│   │   ├── policy/settings.ts        # policy values + the rule that picks the current one
│   │   ├── policy/settings.test.ts   # its Vitest spec
│   │   ├── customer/householdComposition.ts  # grown-up/children split, derived from birthdates
│   │   ├── customer/householdComposition.test.ts  # its Vitest spec
│   │   ├── customer/customerNumber.ts # lowest free slot in 1..quotaN
│   │   ├── customer/customerNumber.test.ts  # its Vitest spec
│   │   ├── customer/group.ts          # Group type and the RED/BLUE balancing suggestion
│   │   ├── customer/group.test.ts     # its Vitest spec
│   │   ├── card/ distribution/       # empty, reserved by the architecture
│   ├── application/
│   │   ├── ports.ts                  # Clock, SettingsRepository, CustomerCounter, AuditLog
│   │   └── settings/                 # readCurrentSettings, updateSettings, listSettingsVersions
│   ├── infrastructure/
│   │   ├── clock.ts                  # systemClock adapter (implements Clock port)
│   │   ├── customer-counter.ts       # counts active customers — zero until US-01 adds the model
│   │   └── prisma/                   # Prisma client + repository implementations
│   │       ├── client.ts             # the process-wide PrismaClient
│   │       ├── settings-repository.ts  # PrismaSettingsRepository (implements the port)
│   │       ├── audit-log.ts          # PrismaAuditLog — append-only, no actor column
│   │       ├── seed.ts               # provisional settings version, inserted only if none exists
│   │       └── *.test.ts             # integration specs, throwaway SQLite file
│   └── i18n/de.ts                    # single German UI-string dictionary
├── tests/e2e/
│   ├── home.spec.ts                  # Playwright smoke test
│   └── settings.spec.ts              # settings round-trip vs. the built app
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

The interfaces the application layer depends on. Per the TDD approach, ports **emerge from test
needs** rather than being designed up front. Type-only, so it adds no runtime code to the
coverage-measured layers.

| Port                 | Shape                               | Notes                                                     |
| -------------------- | ----------------------------------- | --------------------------------------------------------- |
| `Clock`              | `now(): Date`                       | The one seam to the wall clock.                           |
| `SettingsRepository` | `listVersions()`, `append(version)` | No update/delete — policy history is append-only.         |
| `CustomerCounter`    | `countActive()`                     | The reality the quota `N` may not fall below.             |
| `AuditLog`           | `append(entry)`                     | `AuditEntry` = `what` / `changedFields` / `when` / `why`. |

`AuditEntry` deliberately has **no actor field** — see §5.2 of the architecture sketch.

### `src/application/settings/`

The three use cases over the policy versions:

- **`readCurrentSettings(deps)`** loads every version and resolves it against `deps.clock.now()`.
  This is the single seam other features use to reach configuration.
- **`updateSettings(deps, input)`** validates the values (`createSettings`), refuses a `quotaN`
  below `customers.countActive()`
  (`QuotaBelowActiveCustomers`, carrying both numbers), then **appends** a version stamped with
  `deps.clock.now()` — never mutates — and records an audit entry naming the changed fields, under
  the same instant. The saved values are in force from that moment: there is no effective-from date
  to pick. Nothing is written unless every check passes.

- **`listSettingsVersions(deps)`** returns the whole history, newest first. The order is imposed
  here rather than assumed of the repository, which is free to return rows however its query does.

All three are tested against hand-written fakes and a fake clock in `settings.test.ts`.

### `src/infrastructure/clock.ts`

`systemClock` — the real, wall-clock implementation of the `Clock` port and the **only** place
`new Date()` is called. Every time-dependent rule (13th-birthday reclassification, certificate
expiry, week-colour alternation, stamping a settings change) reads "now" through this port so a
settable fake clock can drive deterministic tests.

### `src/domain/errors.ts`

The `DomainErrorCode` union — the closed set of failure modes — plus an abstract `DomainError` base
class and one concrete subclass per kind (`InvalidSettings`, `NoSettingsInForce`,
`QuotaBelowActiveCustomers`, `MissingAuditReason`, `EmptyHousehold`, `BirthDateInFuture` today).
Each carries the values that made it fail, so the UI can render a
German message naming concrete numbers without re-deriving them, and callers switch on `code`
instead of parsing strings.

### `src/domain/policy/settings.ts`

The policy values FD can change without a deploy — quota `N`, portions per grown-up and per child,
the price per grown-up and per child, the week-cycle anchor and the distribution weekday — and
the rule that decides which of them apply at a point in time. A saved change is **in force
immediately**; versions are **immutable and stamped with the instant they were recorded**:
`resolveSettingsAt(versions, date)` returns the version with the greatest `recordedAt` that is not
after `date` (of two recorded in the same instant, the later one written wins), and throws
`NoSettingsInForce` rather than returning a partial object. Keeping superseded versions matters
because a distribution record stores only a `paid` flag (US-05), so the only way to answer "what did
that customer owe last March" is to resolve the version that was in force then.

`createSettings(input)` validates every invariant on construction (quota ≥ 1, portions ≥ 0,
ISO weekday 1–7, an `YYYY-Www` anchor, non-negative integer cents) and throws
`InvalidSettings` naming the field. `priceFor(settings, grownUps, children)` derives what a
household owes — `grownUps × pricePerGrownUp + children × pricePerChild` — because FD charges per
head. Every household size is therefore priceable and no table has to be kept in step with the
sizes that actually turn up. The module is pure: no I/O, no wall clock, and it works over an already-loaded array so
the counter screen (US-04) resolves settings without a per-field query.

`changedSettingsFields(previous, next)` names the policy fields that differ between two versions —
what the audit entry records as _what changed_. With no previous version (the seed) every field
counts as new.

### `src/domain/customer/householdComposition.ts`

`composition(members, today)` derives the grown-up/children split of a household from the members'
birthdates. A member is a grown-up **on** their 13th birthday and a child the day before; both
dates are compared as UTC calendar days, so the time of day a record was written cannot change a
count. A 29 February birthdate has no anniversary in a non-leap year and rolls over to 1 March,
following § 188 Abs. 3 BGB — thirteen years after a leap year is never itself a leap year, so this
happens every time.

The counts are **never stored**: they drive the portion allowance and the price (US-07), and the
Excel sheet FD is replacing kept them as typed-in numbers that drifted with every birthday. An empty
household raises `EmptyHousehold` rather than answering `{ 0, 0 }` (which would read as a household
that owes nothing), and a birthdate after `today` raises `BirthDateInFuture` carrying the offending
date so the UI can point at the row.

### `src/domain/customer/customerNumber.ts`

`lowestFreeNumber(takenNumbers, quotaN)` picks the slot a new customer occupies. A customer number
is a **slot, not an identity**: FD serves at most `quotaN` households (US-14), and archiving one
returns their number to the pool while the archived row keeps it as a historical record. Identity is
the surrogate row id, which is what every foreign key targets (US-01.5).

Allocation is the _lowest_ free number rather than the next-highest, for two reasons: FD's paper
cards are numbered, so reusing a freed number keeps the range dense instead of exhausting the
numbering long before the places run out; and it makes registration reproducible — the same register
and quota always yield the same number. `takenNumbers` holds the **active** customers' numbers only;
duplicates and numbers above the quota are ignored, since neither can make a slot inside the range
more or less free. A full range raises `NoFreeCustomerNumber` carrying the quota, so the UI can name
the limit FD has to raise or free.

The function is advisory in the same sense as `suggestGroup`: the database's partial unique index is
the final authority on whether the number was still free when the write landed (US-01.4).

### `src/domain/customer/group.ts`

`Group = 'RED' | 'BLUE'` is the half of the two-week cycle a customer belongs to: RED households
come one week, BLUE the next, so roughly half the register turns up on any distribution day. The two
groups therefore have to stay roughly equal in size — a lopsided split overwhelms the volunteers one
week and wastes the food collected for the other.

`suggestGroup({ red, blue })` answers with whichever group holds fewer **active** customers;
archived customers do not turn up, so they do not count. On a tie the answer is always `RED`, never
random: a shuffled suggestion would make registration irreproducible and would leave staff unable to
tell a deliberate assignment from a coin flip. The result is **advice only** — the caller may store
a different group (US-01.4), which is why `Group` is a separate type from `WeekColour` in
`src/domain/policy/settings.ts` despite sharing its two values. A week's colour follows from the
anchor in settings; a customer's group is editable by hand, and aliasing the types would make one
changeable through the other.

### `src/infrastructure/prisma/audit-log.ts`

The **append-only audit log** (`PrismaAuditLog`). Every state change is recorded with a timestamp
and, where one was asked for, a reason — but **never an actor**: FD has ruled out login, so the
system records _what / when / why_, never _who_. A settings edit stores an empty `why` when staff
gave none, because `changedFields` already says what happened; the judgement calls (block, archive)
require one. Adding an actor field would be an additive change if login is ever introduced.
There is no update and no delete: an entry that could be rewritten would be worth nothing. The field
list is stored comma-separated because SQLite has no array column and the list is only ever read
back for display.

### `src/infrastructure/customer-counter.ts`

Implements the `CustomerCounter` port. There is no `Customer` model yet — registration is US-01, and
US-14 is built first because registration needs the quota — so the count is genuinely zero and the
`quotaN` check never fires. **When US-01 lands, replace this with a Prisma adapter**; the port, the
rule in `updateSettings` and its tests already cover the behaviour, so only this file and
`src/app/einstellungen/deps.ts` change.

### `src/app/einstellungen/` — the settings screen

The first real screen, and the reference for how a route is wired:

- **`deps.ts`** is the composition root: the one place the real adapters are chosen. The route hands
  this object to a use case and does nothing else with it, so swapping SQLite or the clock touches
  this file alone.
- **`page.tsx`** is a server component. It reads the values in force (`readCurrentSettings`) and the
  history (`listSettingsVersions`) and renders them; it is `dynamic = "force-dynamic"` because
  settings change through the form. A `NoSettingsInForce` error renders the German "not seeded yet"
  message rather than a stack trace.
- **`settings-form.tsx`** is a client component **only** because `useActionState` reports the save
  result back into the page. It holds no rules.
- **`actions.ts`** is the `"use server"` adapter: Zod gives the submitted strings a shape,
  `parseEuros` turns euro text (`2,50`) into whole cents **before it leaves the adapter**, and a
  typed domain error is translated into a German sentence. Each error carries the values that made
  it fail, so the message names concrete numbers without re-deriving them.

⚠️ **A `"use server"` module may export nothing but async functions** — every export becomes a
callable server endpoint. That is why the form's state object lives in `save-settings-state.ts`.
The failure is a _runtime_ error at page load, not a build error, so it will not be caught by
`npm run build`.

⚠️ **German error text for a field** comes from `de.settings.errorFields`, keyed by the `field`
value the `InvalidSettings` error carries. Add a key there when adding a validated settings field,
or the screen quotes an English identifier at staff.

### `src/i18n/de.ts`

A single `const de = {…} as const` dictionary of German UI strings, plus the derived `Dictionary`
type. All user-facing text lives here; **code identifiers stay English**. `layout.tsx` and
`page.tsx` read from it, so there are no hard-coded strings in components.

---

## 5. Data & persistence

### Prisma + SQLite

- `prisma/schema.prisma` declares a `sqlite` datasource whose URL comes from `env("DATABASE_URL")`
  and a `prisma-client-js` generator (client generated to the default `node_modules/@prisma/client`).
- The only model today is `SettingsVersion` — the append-only policy values (the placeholder
  `SchemaMarker` is gone). Its `recordedAt` is the indexed, machine-stamped instant the values took
  over — deliberately not unique, because two saves in the same millisecond are a concurrency
  accident, not a business error. It carries `pricePerGrownUpCents` / `pricePerChildCents` rather than a per-household
  price table: what a household owes is derived, never stored. Customer, HouseholdMember, Card and
  DistributionRecord follow with the stories that need them.
- **All money columns are `Int` cents.** `Float` and `Decimal` appear nowhere in the schema.
- SQLite has no enum type, so the week colour is a `String` narrowed back to `WeekColour` by
  `parseWeekColour` on read — a hand-edited database cannot widen the cycle.
- Rows re-enter the domain through `createSettings`, so a database edited outside the app cannot
  smuggle a fractional price or an impossible weekday past the invariants.
- Migration history is committed under `prisma/migrations/`. Apply it with
  `npx prisma migrate deploy`; create new migrations during development with `npx prisma migrate dev`.
- **Seeding.** `npm run db:seed` (`prisma/seed.ts`, run with `tsx`) inserts one provisional settings
  version — quota 240, 2 portions per grown-up, 1 per child, 200c per grown-up + 100c
  per child, anchor `2026-W02` = RED, Thursday — _only_ when the table is empty, so running it after
  every deploy is safe and never overwrites an operator's edit. Every one of those numbers is
  provisional and must be confirmed with FD; correcting them is a settings edit, not a migration.

### ⚠️ SQLite path resolution (important gotcha)

Prisma resolves a relative `file:` URL **relative to the `prisma/schema.prisma` directory**, _not_
the repo root or the current working directory. To place the database in the repo-root `data/`
directory (the backup unit named in the architecture sketch), the URL therefore uses `../data/…`:

```
DATABASE_URL="file:../data/fd.db"      # → <repo>/data/fd.db
```

This is consistent across `.env`, the Playwright web-server env, and the CI job envs (which use
`../data/ci.db` and `../data/e2e.db`). The `data/` directory is tracked via `.gitkeep`; the `*.db`
files themselves are git-ignored. Note that the **generated client** resolves a relative SQLite path
against the _current working directory_, not against `prisma/` as the CLI does (a known Prisma
footgun) — which is why the app is always started from the repo root, and why the integration tests
pass an **absolute** `datasourceUrl`.

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
- Infrastructure specs run in the same Vitest command but are **integration** tests: they migrate a
  throwaway SQLite file under the OS temp directory (`prisma migrate deploy` in `beforeAll`) and
  delete it afterwards, so `data/fd.db` is never touched. They need a generated Prisma client — CI
  runs `prisma generate` before `vitest`.
- Run: `npm test` (or `npm run test:coverage`, `npm run test:watch`).

### End-to-end — Playwright (`playwright.config.ts`)

- `testDir: tests/e2e`; runs Chromium against the **built** app.
- `webServer` **deletes `data/e2e.db`**, then runs `npx prisma migrate deploy && npm run db:seed &&
npm run start` over it, mirroring the CI `e2e-tests` job. `reuseExistingServer` is on locally, off
  in CI. The delete matters locally: the settings specs edit the seeded price and then assert the
  value they wrote, so a second run against its own leftovers would start from the wrong number.
- Today: a smoke test asserting the German `<h1>` renders, plus `settings.spec.ts` — the settings
  round-trip (change a price, save, reload, see it applied and listed in the
  history), a second save on the same day — the behaviour the screen exists for, and once an error —
  and a rejected save that must leave the stored value untouched. Those specs run
  **serially** against the one shared database, each building on the price the previous one saved. The distribution-day and registration flows are
  added alongside the features they cover.
- E2E is where an `app/` bug actually surfaces: `npm run build` passes on a `"use server"` module
  that exports a non-function, and only a real page load fails. Any story touching a route needs a
  spec here.
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
| `npm run db:seed`                           | Seed the provisional settings version          |

---

## 11. Conventions

- **German UI, English code.** All user-facing text goes through `src/i18n/de.ts`; identifiers,
  comments, and filenames are English and greppable.
- **Money is integer cents**, never floats. Format via `src/domain/money.ts`.
- **Time comes from the `Clock` port**, never `new Date()` in domain/application code.
- **Policy values are data, not constants** — portions, prices per head and quota `N` live in the
  DB, editable in the UI. A change applies immediately; superseded versions are kept as history.
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
- shadcn/ui component setup; the counter, registration, and list screens.
- The concrete append-only audit log behind the `AuditLog` port (`infrastructure/audit.ts`), and the
  `SettingsRepository` / `CustomerCounter` Prisma adapters.

```

```
