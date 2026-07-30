# FD-Management — Technical Documentation

Developer-facing reference for the **code as it is actually built**. It complements the other docs
rather than repeating them:

- `tech_stack_architecture_sketch.md` — _why_ the stack and architecture were chosen (rationale).
- `domain_analysis.md` / `user_stories_mvp.md` — _what_ the software must do (domain & requirements).
- `fd_dev_setup_overview.md` — the dev process, pipeline, and TDD approach at a glance.
- `CONTRIBUTING.md` (repo root) — day-to-day workflow and why each quality gate exists.

This file describes _how_ the current codebase is organised and how to work in it.

> **Status:** the app boots, is fully wired for TDD and CI, and carries three features end to end
> through every layer — US-14's policy settings (`/einstellungen`), US-01's customer registration
> (`/kunden/neu` and the card view at `/kunden/[id]`) and US-03's week colour (`/ausgabe`): domain
> rules, use cases, SQLite persistence, seed and screens. Sections below mark clearly what exists vs. what is a documented placeholder.

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
│   ├── schema.prisma                 # datasource + models (SettingsVersion, AuditEntry, Customer,
│   │                                 #   HouseholdMember, Certificate, Card, DistributionRecord)
│   ├── seed.ts                       # `npm run db:seed` entry point
│   └── migrations/                   # committed migration history
├── src/
│   ├── app/                          # Next.js App Router — thin adapter layer
│   │   ├── layout.tsx                # root layout, <html lang="de">, metadata from i18n
│   │   ├── page.tsx                  # home page: the links + the cards-due badge (US-13.4)
│   │   ├── ausgabe/                  # distribution screen (US-03), counter (US-04), hand-out (US-05), reminder (US-06)
│   │   │   ├── page.tsx              # server component: colour banner, counter lookup, week lookup
│   │   │   ├── counter-lookup.tsx    # the verdict banner + the customer details below it (US-04.4)
│   │   │   ├── serve-controls.tsx    # client: record a hand-out, correct/remove today's record (US-05.4)
│   │   │   ├── certificate-controls.tsx  # client: log today's reminder, record a renewal (US-06.4)
│   │   │   ├── actions.ts            # "use server": Zod → the serve/correct/reminder/renewal use cases
│   │   │   ├── serve-state.ts        # the state the counter's forms exchange with their actions
│   │   │   └── deps.ts               # composition roots: the read deps and the write (audit) deps
│   │   ├── kunden/                   # the customer screens (US-01)
│   │   │   ├── page.tsx              # the customer list: GET-form filters in the URL (US-15.3)
│   │   │   ├── deps.ts               # composition root for the routes below
│   │   │   ├── archive-controls.tsx  # client: Archivieren — shared by the record AND the counter (US-10.4)
│   │   │   ├── archive-actions.ts    # "use server": Zod → archiveCustomer, revalidates both screens
│   │   │   ├── archive-state.ts      # the archive form state (not exportable from an action module)
│   │   │   ├── neu/                  # the registration screen
│   │   │   │   ├── page.tsx          # server component: reads the proposal, renders the screen
│   │   │   │   ├── registration-screen.tsx  # client: the archive panel, the pre-fill banner and the form (US-11.4)
│   │   │   │   ├── registration-form.tsx  # client component: repeatable rows + live counts
│   │   │   │   ├── archive-search-panel.tsx  # client: "Im Archiv suchen" + the result list (US-11.4)
│   │   │   │   ├── archive-search-actions.ts # "use server": searchArchivedCustomers / draftFromArchived
│   │   │   │   ├── archive-search-state.ts   # the panel's state + the draft as the form's strings
│   │   │   │   ├── actions.ts        # "use server": Zod → registerCustomer → redirect
│   │   │   │   ├── register-customer-state.ts  # form state (not exportable from actions.ts)
│   │   │   │   └── registration-input.ts  # the form's Zod schema + German error mapping, shared with /warteliste
│   │   │   ├── [id]/page.tsx         # the customer overview a registration lands on; hosts the block, reissue + archive controls
│   │   │   ├── [id]/block-controls.tsx  # client: Sperren / Sperre aufheben (US-08.4)
│   │   │   ├── [id]/reissue-controls.tsx  # client: Karte neu ausstellen (Verlust) (US-09.3)
│   │   │   ├── [id]/actions.ts       # "use server": Zod → blockCustomer / unblockCustomer / reissueCard
│   │   │   ├── [id]/block-state.ts   # the block/unblock form state (not exportable from actions.ts)
│   │   │   ├── [id]/reissue-state.ts # the reissue form state (not exportable from actions.ts)
│   │   │   └── [id]/karte/page.tsx   # the digital customer card (US-02.4) + the issued-card counts (US-09.3)
│   │   ├── karten-neuausstellung/    # the cards-due-for-reissue screen (US-13.4)
│   │   │   ├── page.tsx              # server component: one row per household, both count sets
│   │   │   ├── stale-card-controls.tsx  # client: Karte neu ausstellen, reason STALE_COUNTS
│   │   │   ├── actions.ts            # "use server": Zod → reissueCard(STALE_COUNTS)
│   │   │   └── reissue-state.ts      # the row's form state (not exportable from actions.ts)
│   │   ├── warteliste/               # the waiting-list screen (US-12.4)
│   │   │   ├── page.tsx              # server component: banner, list in arrival order, add form
│   │   │   ├── add-applicant-form.tsx  # client: "Auf die Warteliste setzen"
│   │   │   ├── remove-applicant-controls.tsx  # client: Entfernen, reason required, entry retained
│   │   │   ├── free-slot-banner.tsx  # shared by /warteliste and the home screen
│   │   │   ├── actions.ts            # "use server": Zod → addToWaitingList / removeFromWaitingList
│   │   │   ├── waiting-list-state.ts # the two form states (not exportable from actions.ts)
│   │   │   ├── deps.ts               # composition root: list + register + cards + settings
│   │   │   └── [entryId]/registrieren/  # promoting one applicant off the list
│   │   │       ├── page.tsx          # server component: promoteFromWaitingList → pre-filled form
│   │   │       ├── promotion-screen.tsx  # client: the expired-certificate step before the form
│   │   │       └── actions.ts        # "use server": Zod → registerFromWaitingList
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
│   │   ├── customer/customer.ts       # the customer record, validated on construction
│   │   ├── customer/customer.test.ts  # its Vitest spec
│   │   ├── customer/certificate.ts    # certificate expiry + the VALID/EXPIRING_SOON/EXPIRED state (US-06, US-15)
│   │   ├── customer/certificate.test.ts  # its Vitest spec
│   │   ├── customer/nameSearch.ts     # foldName — the comparable form of a name (US-11)
│   │   ├── customer/nameSearch.test.ts  # its Vitest spec
│   │   ├── customer/waitingList.ts     # first-come-first-served ordering of applicants (US-12)
│   │   ├── customer/waitingList.test.ts  # its Vitest spec
│   │   ├── card/card.ts              # what an issued card is + why it was issued
│   │   ├── card/card.test.ts         # its Vitest spec
│   │   ├── card/cardNumber.ts        # the derived card number, e.g. `12k1`
│   │   ├── card/cardNumber.test.ts   # its Vitest spec
│   │   ├── card/staleCard.ts         # does the card still print the truth, and what changed (US-13)
│   │   ├── card/staleCard.test.ts    # its Vitest spec
│   │   ├── distribution/weekColour.ts  # RED/BLUE alternation derived from the ISO calendar
│   │   ├── distribution/weekColour.test.ts  # its Vitest spec
│   │   ├── distribution/distributionDay.ts  # is today a distribution day, and when is the next
│   │   ├── distribution/distributionDay.test.ts  # its Vitest spec
│   │   ├── distribution/counterVerdict.ts  # evaluateAtCounter — the one verdict at the counter
│   │   ├── distribution/counterVerdict.test.ts  # its Vitest spec
│   │   ├── distribution/attendance.ts  # canRecord/canCorrect — the once-per-Berlin-day rules
│   │   ├── distribution/attendance.test.ts  # its Vitest spec
│   │   ├── distribution/noShows.ts    # consecutiveNoShows — own distributions missed in a row
│   │   ├── distribution/noShows.test.ts  # its Vitest spec
│   │   ├── distribution/distributionRecord.ts  # the hand-out record type (id, paid, priceCents)
│   ├── application/
│   │   ├── ports.ts                  # Clock, SettingsRepository, CustomerCounter, CustomerRepository,
│   │   │                             #   CardRepository, DistributionRecordRepository,
│   │   │                             #   ReminderLogRepository, CertificateRepository,
│   │   │                             #   WaitingListRepository, AuditLog
│   │   ├── customers/                # registerCustomer, proposeRegistration, readCustomer,
│   │   │                             #   readCard, issueCard, lookupCustomer (the counter lookup),
│   │   │                             #   recordReminder / renewCertificate (US-06),
│   │   │                             #   blockCustomer / unblockCustomer (US-08),
│   │   │                             #   reissueCard (US-09, delegates to issueCard),
│   │   │                             #   archiveCustomer (US-10, frees the slot),
│   │   │                             #   countNoShows (US-10, the seam both read models use),
│   │   │                             #   searchArchivedCustomers (US-11, the archive search),
│   │   │                             #   draftFromArchived (US-11, the registration pre-fill),
│   │   │                             #   listCardsDueForReissue (US-13, cards a birthday overtook),
│   │   │                             #   listCustomers (US-15, the searchable customer list),
│   │   │                             #   updateHousehold (US-16, replaces the member set),
│   │   │                             #   updateCustomerDetails / updateNotes (US-16, record edits),
│   │   │                             #   changeGroup (US-16, moves between RED and BLUE)
│   │   ├── settings/                 # readCurrentSettings, updateSettings, listSettingsVersions
│   │   ├── distribution/             # getWeekColour; recordAttendance / correctAttendance (US-05)
│   │   ├── waiting-list/             # addToWaitingList, listWaiting, removeFromWaitingList,
│   │   │                             #   promoteFromWaitingList, registerFromWaitingList (US-12)
│   │   └── allowance/                # describeAllowance — counts, portions and price at a date
│   ├── infrastructure/
│   │   ├── clock.ts                  # systemClock adapter (+ the FD_FIXED_NOW_FILE test seam)
│   │   └── prisma/                   # Prisma client + repository implementations
│   │       ├── client.ts             # the process-wide PrismaClient
│   │       ├── settings-repository.ts  # PrismaSettingsRepository (implements the port)
│   │       ├── customer-repository.ts  # PrismaCustomerRepository + PrismaCustomerCounter
│   │       ├── card-repository.ts    # PrismaCardRepository — the (customer, index) constraint
│   │       ├── distribution-record-repository.ts  # PrismaDistributionRecordRepository — (customer, Berlin dayKey)
│   │       ├── reminder-log-repository.ts  # PrismaReminderLogRepository — (customer, loggedOn) cap
│   │       ├── certificate-repository.ts   # PrismaCertificateRepository — appends renewals
│   │       ├── waiting-list-repository.ts  # PrismaWaitingListRepository — removals stamp, never delete
│   │       ├── audit-log.ts          # PrismaAuditLog — append-only, no actor column
│   │       ├── seed.ts               # provisional settings version, inserted only if none exists
│   │       ├── test-support.ts       # clearRegister — the children-first teardown the specs share
│   │       └── *.test.ts             # integration specs, throwaway SQLite file (schema.test.ts
│   │                                 #   reads the schema and migrations instead of a database)
│   ├── i18n/de.ts                    # single German UI-string dictionary
│   └── i18n/format.ts                # German value formatting (germanDate) + its spec
├── tests/e2e/
│   ├── age-13.spec.ts                # a 13th birthday moves the numbers with nobody touching them
│   ├── archive.spec.ts               # archiving frees the number and keeps the record findable
│   ├── block.spec.ts                 # block shows its reason at the counter and is reversible
│   ├── card.spec.ts                  # registration issues k1 and the card view shows it
│   ├── counter.spec.ts               # every counter verdict, and that a lookup writes nothing
│   ├── customer-list.spec.ts         # search, filters and the group balance on /kunden
│   ├── customer-record.spec.ts       # four edits on the record, each read back off another screen
│   ├── distribution.spec.ts          # the week-colour banner against a fixed clock
│   ├── home.spec.ts                  # Playwright smoke test
│   ├── portions.spec.ts              # portions and price follow the household, not a stored column
│   ├── registration.spec.ts          # register a customer and get a card vs. the built app
│   ├── reissue.spec.ts               # a lost card is replaced and stops working at the counter
│   ├── reminders.spec.ts             # the reminder trail: three visits, three reminders, renewal
│   ├── reregistration.spec.ts        # back from the archive: same household, new number and card
│   ├── serve.spec.ts                 # record a hand-out, block a duplicate, store an unpaid one
│   ├── settings.spec.ts              # settings round-trip vs. the built app
│   └── waiting-list.spec.ts          # a full register, the list and a promotion (isolated project)
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

| Port                           | Shape                                                                                                                                                                                                                                                                                                                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Clock`                        | `now(): Date`                                                                                                                                                                                                                                                                                                                           | The one seam to the wall clock.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SettingsRepository`           | `listVersions()`, `append(version)`                                                                                                                                                                                                                                                                                                     | No update/delete — policy history is append-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `CustomerCounter`              | `countActive()`                                                                                                                                                                                                                                                                                                                         | The reality the quota `N` may not fall below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `CustomerRepository`           | `takenActiveNumbers()`, `groupCounts()`, `findById(id)`, `findByCustomerNumber(n)`, `listWithStatus(status)`, `list(query)`, `searchArchived(query, limit)`, `create(customer)`, `updateHousehold(id, members)`, `updateDetails(id, details, household)`, `updateNotes(id, notes)`, `setGroup(id, group)`, `setStatus(…)`, `archive(…)` | `create` is one transaction; it reports a lost race for a number as `CustomerNumberTaken`. `setGroup` is a single column write (US-16.4) that deliberately leaves the cards printing the group they were issued with. `listWithStatus` is the one whole-register read — lowest number first, households and cards attached, for the cards-due list (US-13.2). `list` is the customer list's filtered read (US-15.2): every criterion of `CustomerListQuery` is a `WHERE` clause, ordered by ascending customer number. |
| `CardRepository`               | `currentCard(customerId)`, `listCards(customerId)`, `issueCounts(customerId)`, `issue(customerId, card)`                                                                                                                                                                                                                                | `currentCard` is the highest index — there is no `valid` flag to read; `issueCounts` counts the run and its losses in one aggregate (US-09.2); `issue` reports a lost race as `CardIndexTaken`.                                                                                                                                                                                                                                                                                                                        |
| `DistributionRecordRepository` | `listForCustomer(id)`, `findById(id)`, `create(record)`, `setPaid(id, paid)`, `remove(id)`                                                                                                                                                                                                                                              | `create` reports a lost race on the day as `AlreadyServedToday` via the unique `(customerId, Berlin dayKey)` constraint; records outlive customer status changes (no cascade).                                                                                                                                                                                                                                                                                                                                         |
| `ReminderLogRepository`        | `findOnDay(customerId, loggedOn)`, `record(customerId, entry)`                                                                                                                                                                                                                                                                          | `record` writes the log entry and the customer's new `reminderCount` in one transaction; it reports a lost race on the day as `ReminderAlreadyLoggedToday` via the unique `(customerId, loggedOn)` constraint (US-06.3).                                                                                                                                                                                                                                                                                               |
| `CertificateRepository`        | `renew(customerId, certificate, recordedAt)`                                                                                                                                                                                                                                                                                            | Appends the renewed certificate and resets `reminderCount` to 0 in one transaction; certificates are never overwritten, so the history of renewals stays readable.                                                                                                                                                                                                                                                                                                                                                     |
| `WaitingListRepository`        | `listWaiting()`, `findWaiting(entryId)`, `add(entry)`, `remove(entryId, reason, removedOn)`                                                                                                                                                                                                                                             | The applicants waiting for a slot (US-12). There is no `delete`: `remove` stamps the row, so the order of past promotions stays reconstructable (FR-7). It promises no ordering — that is `inArrivalOrder`'s.                                                                                                                                                                                                                                                                                                          |
| `AuditLog`                     | `append(entry)`                                                                                                                                                                                                                                                                                                                         | `AuditEntry` = `what` / `changedFields` / `when` / `why`.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

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

### `src/application/distribution/`

**`getWeekColour(deps, date?)`** is the single seam the distribution screen reads. It answers for the
clock's today by default and for a looked-up date on request, returning everything the banner states:
the day, its ISO week (`2026-W30`), the colour, whether FD distributes that day and the next
distribution at or after it (US-03, FR-1/4/5).

Two decisions are worth knowing:

- It resolves the settings **at the date asked about**, not at today, so a lookup for a past week
  answers with the anchor that was in force _then_ (FR-6). That is why it reads the version history
  directly rather than going through `readCurrentSettings`.
- It resolves at the asked-about _instant_ and normalises only the calendar arithmetic to a UTC day,
  so a settings change saved this morning is in force this morning.

**`recordAttendance(deps, { customerId, paid? })`** writes one distribution record — the customer
showed up, paid (default `true`, clearable), and owed the price `describeAllowance` derives for their
household at today's instant (US-05.2, FR-1/2). It stands two guards of its own before writing, so the
counter screen is not the only one (FR-8): it re-runs `evaluateAtCounter` and refuses an `ARCHIVED`,
`BLOCKED` or `WRONG_GROUP` customer with `NotClearToServe`, and it runs `canRecord` to reject a second
record on the same Berlin day with `AlreadyServedToday`, writing nothing. A bare-number hand-out
presents no card, so `OUTDATED_CARD` cannot arise. Both the record and the audit entry take one read
of the clock, so the stored price, the day-key and the log all agree on "now".

**`correctAttendance(deps, { recordId, action })`** amends the same day's record — `SET_PAID` flips
the paid flag, `REMOVE` deletes it — guarded by `canCorrect`, which rejects anything older than today
with `RecordNoLongerCorrectable` (FR-7); a missing record is `DistributionRecordNotFound`. Removal is
the one deletion the append-only history permits. Each correction writes its own audit entry with no
reason, because the event name and changed field already say what happened. Both use cases are tested
against hand-written fakes and a fake clock (`record-attendance.test.ts`, `correct-attendance.test.ts`).

### `src/application/allowance/`

**`describeAllowance(deps, household, date?)`** is the single seam the counter screen (US-04) and the
customer record (US-05) both read for a household's `{ grownUps, children, portions, priceCents }`, so
neither recomputes the arithmetic and the two can never disagree (US-07.3). Everything is derived,
nothing stored: the split from the birthdates, portions from `portionsFor` and the price from
`priceFor`, all against the settings **in force on the evaluated date**.

Both the counts and the settings resolve at the _same_ instant — the given date, or the clock's today
— so a past distribution is priced with the members' ages and the policy values as they stood then,
not as they stand now. That is why it reads the version history directly rather than going through
`readCurrentSettings`.

**`describeAllowances(deps, households, date)`** answers the same question for many households at
once, reading the settings history a single time. The customer list (US-15) derives all four values
for every row it shows, and a version-history read per row would be a query per household on a screen
that already holds them all. The arithmetic is the same private function, so the list and the counter
cannot disagree about what a household receives. Its date is **required** rather than defaulted: a
caller holding many households has already fixed the instant it is asking about, and a second clock
read could price two rows of one list on different days.

Nothing is persisted: a week colour is a function of the date and the anchor, so there are no week
rows and `SettingsRepository` is the only port needed. Tested against hand-written fakes and a fake
clock in `distribution.test.ts`.

### `src/infrastructure/clock.ts`

`systemClock` — the real, wall-clock implementation of the `Clock` port and the **only** place
`new Date()` is called. Every time-dependent rule (13th-birthday reclassification, certificate
expiry, week-colour alternation, stamping a settings change) reads "now" through this port so a
settable fake clock can drive deterministic tests.

It also carries the one seam end-to-end tests need, since they drive the built app from outside and
cannot pass a fake: if the environment variable **`FD_FIXED_NOW_FILE`** names a file, `now()` returns
the ISO instant that file holds instead of the wall clock. The file is re-read on every call, so a
spec can move the app's today from one distribution week to the next without restarting the server,
and deleting it hands the wall clock straight back. The variable is read once at module load, is set
only by `playwright.config.ts` (to `data/e2e-now.txt` for the shared server and
`data/e2e-isolated-now.txt` for the isolated one, both git-ignored), and an unreadable or unparsable
file falls back to the wall clock rather than failing a request.

### `src/domain/errors.ts`

The `DomainErrorCode` union — the closed set of failure modes — plus an abstract `DomainError` base
class and one concrete subclass per kind (`InvalidSettings`, `NoSettingsInForce`,
`QuotaBelowActiveCustomers`, `MissingAuditReason`, `EmptyHousehold`, `BirthDateInFuture`,
`NoFreeCustomerNumber`, `CustomerNumberTaken`, `CustomerNotFound`, `CustomerArchived`,
`CustomerNotArchived`, `InvalidCustomerRecord`, `MissingRequiredField`, `InvalidCardNumber`,
`CardIndexTaken`,
`InvalidEuroAmount` today).
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
`InvalidSettings` naming the field. `priceFor(values, grownUps, children)` derives what a
household owes — `grownUps × pricePerGrownUp + children × pricePerChild` — because FD charges per
head. Every household size is therefore priceable and no table has to be kept in step with the
sizes that actually turn up. It takes a `PriceValues` — the two per-head prices picked off
`Settings`, mirroring `portionsFor`'s `PortionValues` — so that the record's household editor can
price a household in the browser from the four numbers that bear on the answer, without being handed
the quota and the week anchor as well (US-16.5). The module is pure: no I/O, no wall clock, and it works over an already-loaded array so
the counter screen (US-04) resolves settings without a per-field query.

`changedSettingsFields(previous, next)` names the policy fields that differ between two versions —
what the audit entry records as _what changed_. With no previous version (the seed) every field
counts as new.

### `src/domain/customer/householdComposition.ts`

`composition(members, today)` derives the grown-up/children split of a household from the members'
birthdates. A member is a grown-up **on** their 13th birthday and a child the day before, so the
counts, the portion allowance and the price follow a birthday with **no staff action** — the age-13
reclassification (US-13) is this read-time derivation and nothing else: no job, no trigger, no event.

The two sides of the comparison are read as calendar days, so the time of day cannot change a count,
but they are read in different calendars, and deliberately so. A **birthdate** is a stored calendar
day, anchored at UTC midnight by the registration form, and is compared as its UTC day. **`today`**
is the one real moment involved — it comes from the clock while somebody is standing at the counter
in Germany — so the day it belongs to is the **Europe/Berlin** one, taken from the same `berlinDayKey`
the attendance rules count the day with. A member born on the 15th is therefore a grown-up from 00:00
Berlin on the 15th, not from 01:00 (CET) or 02:00 (CEST) as a UTC-only comparison would have it.

A 29 February birthdate has no anniversary in a non-leap year and rolls over to 1 March, following
§ 188 Abs. 3 BGB — thirteen years after a leap year is never itself a leap year, so a 29 February
child comes of age on 1 March every time; a leap-year anniversary is only ever observable on a later
birthday, which `ageInYears` covers.

The counts are **never stored**: they drive the portion allowance and the price (US-07), and the
Excel sheet FD is replacing kept them as typed-in numbers that drifted with every birthday. An empty
household raises `EmptyHousehold` rather than answering `{ 0, 0 }` (which would read as a household
that owes nothing), and a birthdate after `today` raises `BirthDateInFuture` carrying the offending
date so the UI can point at the row.

`ageInYears(birthDate, today)` answers the same question in years rather than in a split — the age
the customer record shows beside each birthdate (US-16.5) — and shares every convention above: the
Berlin day, the anniversary on the birthday itself, and the 1 March roll-over. Both are pinned by
boundary tests at the day before, the day of, the day after, 29 February in a leap and a non-leap
year, and hour by hour across a birthday, where the answer must flip exactly once, at Berlin
midnight (US-13.1).

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

### `src/domain/customer/nameSearch.ts`

`foldName(value)` is the comparable form of a name, and the whole of how the archive search matches
one (US-11.1). Staff type the name they hear rather than the name that was stored — `Mueller` for
`Müller`, `WEISS` for `Weiß`, `Sanchez` for `Sánchez` — and SQLite has neither `unaccent` nor a
Unicode-aware `LIKE`, so the comparison cannot be made in the query.

The fold lower-cases, then **spells German out the way Germans do without an umlaut key** (`ä → ae`,
`ö → oe`, `ü → ue`, `ß → ss`), then drops any remaining diacritic, collapses whitespace and trims.
The order matters: spelling out has to happen before stripping, or `ü` would already be `u` and
`Mueller` would no longer match. Everything is composed to NFC first, so a `u` carrying a separate
combining diaeresis folds like a single `ü`.

It is deliberately **not** fuzzy matching — no Soundex, no edit distance (PRD §5). A search that
guessed would put the wrong household's data into a registration form; the cost of a miss is that
staff type the name again.

Because the fold cannot run in SQL, its output is **stored** beside the names, in
`Customer.firstNameFolded` / `lastNameFolded`, and indexed — the last name with the birthdate, the
pair the archive search types together, and the first name on its own, because the customer list
matches a prefix of either (US-15.2). That is the one
derived value stored outside a card snapshot, and it is a search _key_ rather than a fact: nothing
reads it as the household's name. The columns are non-nullable and have no default, so every writer
has to state them — and the adapter derives both from the names in the same statement.

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

### `src/domain/customer/customer.ts`

The customer record: personal data, a flat German address (street, house number, ZIP, city), the
needs certificate (`type`, `validUntil`) and the household members, each a name plus a birthdate.
`createCustomerDetails(input, today)` is the only way to make one — it trims every text field,
raises `MissingRequiredField` naming the blank one (down to `householdMembers.1.firstName`, so the
form can mark the row), and validates the household **by deriving its composition**, which is what
raises `EmptyHousehold` and `BirthDateInFuture`. The derived counts are then discarded: what is
deliberately absent from the record is any grown-up or children count, any portion allowance and
any price, because all three follow from the birthdates and the settings in force wherever they are
needed. The Excel sheet FD is replacing stored them, and they drifted with every birthday.

`NewCustomer` adds what registration decides — `customerNumber`, `group`, `status`,
`reminderCount`, the first `card` — and `RegisteredCustomer` adds the surrogate `id`, which is the
only identity there is: a customer number is a slot another household may hold once this one is
archived, plus `blockReason`, non-null **exactly** when the customer is blocked, and
`archiveReason`/`archivedAt`, non-null **exactly** when they are archived. It also carries
`registeredOn`, the day the household joined: there is no registration column, so it is **derived on
read** from their _first_ card — the one handed over with the registration — and a card replaced
after a loss therefore cannot move a household's start (US-10.1). The block reason is
cleared when the block is lifted; the archive pair never is, because there is no way back out of
`ARCHIVED` (US-10, FR-7). `CustomerStatus` is `ACTIVE | BLOCKED | ARCHIVED`; a blocked customer still
holds their slot (US-08), an archived one releases it (US-10). The legal moves between the three
states live in `status.ts` (`transition`), so an illegal transition is impossible rather than merely
unlikely — and the two moves that turn on a human judgement, `→ BLOCKED` and `→ ARCHIVED`, are
refused there without a reason (`MissingAuditReason`, naming `customer.blocked` or
`customer.archived`). Stating that in the machine rather than in each use case is what stops a future
caller from writing a reason-less archive.

### `src/domain/customer/certificate.ts`

`isExpired(certificate, today)` is the whole expiry rule: a needs certificate is still valid **on**
its `validUntil` day — the printed end date is the last day it counts — and expired the day after.
Both dates are compared as UTC calendar days, so the time of day either value was recorded cannot
change the verdict. Expiry never blocks a hand-out; it starts the reminder trail at the counter
(US-06).

Deliberately absent is any escalation function or reminder threshold. FD reminds "about three times"
as a habit, but every case is a staff judgement, so the domain exposes only the expiry and the
running `reminderCount` — encoding a threshold would misrepresent a judgement as a rule and is a
named non-goal of US-06.

`certificateState(certificate, today)` places that same date in one of three states the customer
list filters by (US-15.1): `EXPIRED`, `EXPIRING_SOON` — inside the next `EXPIRING_SOON_DAYS` (30) —
or `VALID`. Expiring soon is a **narrowing of valid**, not a state beside it: the household may still
shop, and the label exists so staff can start the renewal conversation before the counter has to, so
asking for `VALID` also returns the ones expiring soon.

`validUntilRangeFor(state, today)` says the same thing as a half-open range over `validUntil`
(`from` included, `before` excluded), which is what a `WHERE` clause can be built from — the list
filters in SQL rather than by loading the register (US-15.2). Both functions read one window, so the
rows a filter returns and the label the screen prints on them cannot disagree. Whether 30 days should
become a setting (US-14) is an open question in `tasks/prd-us-15-customer-list.md` §9; until somebody
asks, it is a constant.

### `src/domain/customer/waitingList.ts`

The waiting list's ordering rule (US-12.1). `inArrivalOrder(entries)` sorts a copy of the applicants
by `addedOn`, earliest first, breaking a tie on the same instant by ascending `id`; `nextInLine(entries,
today)` names the head of that order.

The rule is **strictly first come, first served** — no priority, urgency or hardship override (FR-3) —
and it lives in the domain rather than in an `ORDER BY` so that fairness is a property the tests pin
down, and so the waiting-list screen, the home-screen banner and the promotion use case cannot each
arrive at a slightly different head of the queue. The tie-break is the surrogate id and never the order
the rows came back in: two applicants added the same morning would otherwise swap places between two
page loads, which is exactly the unfairness the strict order exists to prevent. Ids ascend with time,
so the tie-break only ever refines arrival order and never contradicts it.

`nextInLine` returns a discriminated union — `WAITING_LIST_EMPTY` when nobody is waiting, so a caller
cannot mistake "no one" for "not asked", otherwise `NEXT_IN_LINE` carrying the entry and
`certificateExpired`. `today` decides **nothing** about the order: it is read only to flag an applicant
whose certificate lapsed while they waited (via `isExpired`, so there is one expiry comparison in the
system). The flag never filters. Skipping the head silently would hand somebody else's slot away
without anyone deciding to; what happens about the renewal is FD's judgement, taken at the counter
(US-12, FR-5).

Both functions are generic over the caller's entry shape, like `recordForDay`: the rule reads `id`,
`addedOn` and `certificate` and hands the caller's own richer row straight back, so it never grows a
field it does not use.

`daysWaiting(entry, today)` is the one number on the screen that says what the list costs the people
on it. It counts **calendar days** — both ends reduced to their UTC day, so the answer does not depend
on what time of day either happened and no daylight-saving hour is lost across a long wait — and it is
0 on the day the applicant joined. An entry dated after `today` counts as no wait rather than a
negative one: nobody has waited a negative number of days, and a screen that said so would report a
clock problem as a fact about the applicant. It lives here rather than in the page for the same reason
the ordering does: two screens counting days apart is how the same applicant appears to have waited
two different lengths of time.

`createWaitingListDetails(input, today)` is the module's other half: the **entry bar** (US-12.2,
FR-1). It validates an application the way `createCustomerDetails` validates a registration — every
name, address part and certificate type trimmed and required, and a birthdate that lies after `today`
refused through the same `composition` guard — and it refuses a certificate that has already lapsed
with `CertificateExpired`. An applicant joins with a valid certificate in hand or does not join.

That is the opposite of what a certificate lapsing _during_ the wait means, and the two must not be
confused: the entry bar is a door, checked once; the flag `nextInLine` reports is a note to staff and
never bars anybody, because the applicant earned their place by waiting and a renewal is what they
are asked for. `WaitingListDetails` deliberately holds no household — FD does not ask who someone
lives with until they are registered (PRD §7) — and no customer number, group or card, because an
applicant is not a customer and must not occupy a slot.

### `src/domain/card/card.ts`

What an issued card _is_: `IssuedCard` = `index` + `issuedAt` + `reason` + `countsAtIssue` +
`groupAtIssue`, and
`CardIssueReason` = `FIRST_ISSUE | LOST | STALE_COUNTS | OTHER`. `parseCardIssueReason(value)` reads a
stored reason word back — SQLite has no enum type, so the word is checked rather than trusted, exactly
as `group` and `status` are, and an unknown one raises `InvalidCustomerRecord` instead of quietly
becoming `OTHER`.

`countsAtIssue` is a `HouseholdComposition` and is **the one count stored anywhere in the system**.
It is not an exception to "derive, don't store" but its counterpart: the physical card is a real
object out in the world with two numbers written on it, and those numbers stop being true the moment
a child turns 13 (US-13.3). Nothing reads it to answer _what the household is_ — that is always
`composition(members, today)`. It is read only to answer _what the card in the customer's pocket
claims_, so the two can be compared and a reissue proposed. It is never updated: a card whose printed
counts have been overtaken is replaced by a new card with reason `STALE_COUNTS`, and the reissue _is_
how the change is recorded.

`groupAtIssue` is the same kind of snapshot and carries the same argument (US-16.4). The card also
prints which week the household collects in, so moving them between RED and BLUE makes the printed
card wrong although nothing about the household changed. Nothing reads it as the household's group —
that is `customer.group`, the only editable one — and, like the counts, it is never updated in place:
without the snapshot there would be nothing to notice a move against, and a group change could not
reach the cards-due list at all.

It is the **one** shape of a card in the system: `NewCustomer.card` is an `IssuedCard` too, so the
card written with a registration and the card written by `issueCard` cannot drift into two row
shapes.

There is deliberately **no `valid` flag**. A card is current _because_ it carries the highest index
the customer has been issued (FR-4), so validity cannot drift away from the cards that actually
exist — the same argument that keeps the household counts derived. The reason is a closed set rather
than free text because the audit log is read by people who did not make the change, and four words
they can scan tell them more than a sentence typed to get past a form.

### `src/domain/card/staleCard.ts`

The counterpart to the two snapshots above: `staleCardReason(printedOnCard, today)` answers `null`
when the card still prints what the record says, and otherwise names what changed —
`AGE_13 | HOUSEHOLD_CHANGE | GROUP_CHANGE`. Both sides are a `CardFacts` — `{ counts, group }` — so
neither can quietly grow a field the other does not have.

A birthday is blamed only when it is the **whole** explanation: the household is the same size and
grown-ups have gone up, so the same people are on the card and one or more crossed 13. A different
size means somebody joined or left, and grown-ups going down is something no birthday can do; both
are changes a human made to the record, and reporting them as `AGE_13` would tell staff a story that
did not happen. The distinction is shown on the reissue list so it reads as "the software moved these
numbers" rather than as an accusation that a record was filled in wrongly.

The counts answer first and the group only when they agree. A reissue replaces the whole card at
once, so the reason is not a work list but the sentence that explains the row, and when both moved the
counts are the difference worth naming: they decide the portions and the price, while the group
decides only which week the household is expected in.

The module takes **no clock and no members** — both sides are already-derived facts, so deciding
_when_ "today" is stays with the caller and this rule cannot acquire a second opinion about it.

### `src/domain/card/cardNumber.ts`

The card number staff read out at the counter, `<customer number>k<index>` — `12k1` is the first
card of customer 12 and `12k2` the one issued after they lost it (US-09). It is **derived, never
stored**: the string is the customer's slot and the index of the card they hold, so persisting it
would give the same fact two homes and every reissue would have to keep them in step — the mistake
the Excel sheet made with the household counts.

`formatCardNumber(customerNumber, index)` writes it and validates nothing: both arguments come off a
persisted card the register already guarantees is a positive whole number, so a check here would only
be an unreachable branch. `nextCardNumber(card)` gives the number that replaces one, same customer
and index + 1. Issuing it invalidates every earlier card as a consequence, because validity is
_being the highest index_ rather than a flag somebody has to remember to clear (FR-4); the function
says only what the next index is, and deciding a card is due belongs to the application layer, which
is the only one that knows the highest issued index.

`parseCardNumber(text)` reads a typed number back and is where the strictness lives. It is forgiving
where forgiveness cannot change which card is meant — an uppercase `K` and surrounding whitespace,
both of which someone copying a number off a card produces — and strict where it can: a **leading
zero is rejected**, because reading `050k3` as customer 50 would teach staff that padding carries
meaning when the register never pads, and the two forms would then drift apart on screen. Customer
number 0 and index 0 are refused for the reason neither is ever written: counting starts at 1.
Anything else raises `InvalidCardNumber` carrying the text as entered, so the counter screen can
quote back what was typed — a mistyped `50l3` and an unknown-but-well-formed `50k9` are different
problems for staff, and only the first is this error.

Card numbers are **not unique across the archive**: slot 50 can be reassigned once a household is
archived, so `50k1` may name a different person later (FR-6). Nothing keys a row or a foreign key by
a card number.

### `src/domain/distribution/weekColour.ts`

Which of the two groups collects in a given week. `colourOf(date, anchor)` counts ISO weeks from the
configured anchor week and returns the anchor's colour on an even difference, the other colour on an
odd one — so the RED/BLUE alternation is **derived from the calendar**, never typed in per week
(US-03, FR-2). That is the whole point: a per-week table could hold two RED weeks in a row, which FD
considers unfair, whereas two dates seven days apart land on opposite parities by construction. A
skipped distribution (holiday, weather) therefore does not shift the cycle — the rule is calendar
parity, not "every week FD actually opened".

The arithmetic is **ISO-8601**: weeks start Monday, and week 1 of an ISO year is the one containing 4
January, which is why 1 January 2023 belongs to `2022-W52` and 1 January 2027 to `2026-W53`. All of
it runs on UTC day instants, so the time of day cannot decide a colour and no local-time or DST
boundary enters the calculation. `colourOf` is total in both directions: the week difference goes
negative before the anchor and the parity is taken with a non-negative modulo, so a lookup for a week
that predates the configuration answers instead of failing.

`isoWeekOf(date)` writes the ISO week as `2026-W30` — what the lookup control shows beside a colour
so staff can check it against a wall calendar.

The anchor is validated here as well as in `createSettings`, and for a reason the shape check cannot
cover: `2025-W53` is well-formed but 2025 has only 52 ISO weeks. Both raise `InvalidSettings` against
`weekAnchor.isoWeek`, so the settings screen marks the same input either way.

The two calendar helpers the module needs are exported rather than kept private, because the
distribution-day rules are the same arithmetic: `startOfUtcDay(date)` drops the time of day and
`isoWeekdayOf(date)` numbers weekdays the ISO way (Monday = 1 … Sunday = 7) rather than `Date`'s
Sunday = 0.

### `src/domain/distribution/distributionDay.ts`

When FD hands out food. `isDistributionDay(date, weekday)` compares the ISO weekday of a date against
the configured `distributionWeekday`, and `nextDistribution(date, settings)` returns the next
distribution **at or after** that date together with the colour of the week it falls in (US-03,
FR-5). "At or after" is the rule that matters in the hall: on a distribution day it answers _today_,
not a week hence. On any other day the screen can say which colour is next and when, instead of going
blank.

A skipped week shifts nothing here either — the next distribution is simply the next occurrence of
the configured weekday, and its colour comes from `colourOf`, so the parity is the calendar's.

### `src/domain/distribution/noShows.ts`

How many of their own distributions in a row a household has missed — one of the two triggers that put
archiving in front of staff (US-10, FR-3). `consecutiveNoShows({ records, customerGroup, registeredOn,
settings, today })` walks backwards one two-week cycle at a time from the last distribution of the
customer's colour and stops at the first one they attended, or at their registration day.

A no-show is the **absence** of a record, so it cannot be read off the history alone: the history says
which days the customer came and the calendar says which days were theirs. This is the one module where
the week-colour rule (US-03) and the attendance history (US-05) meet — which is why it takes the
settings rather than a list of dates.

Four boundaries decide what the number means:

| Boundary                         | Counted? | Why                                                                                                                |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| The other group's weeks          | no       | They were never this household's days; counting them would double every figure.                                    |
| Today's own distribution         | no       | It may still be in progress — the count must not read "1 no-show" to the staff member serving them.                |
| The day the household registered | no       | The card is handed over at registration and whether that day's hand-out had finished is nowhere on record.         |
| Weeks the household was blocked  | yes      | PRD §9, **to be confirmed with FD**: excluding them would hide the pattern, and no block _history_ is kept anyway. |

Records are matched to a distribution day by the **Europe/Berlin** calendar day, through the same
`berlinDayKey` the once-per-day attendance rule and the database's unique index use — so a hand-out
entered at 23:45 belongs to the day the staff member lived through, and one entered after Berlin
midnight belongs to the next.

Nothing in the module reacts to the value it returns: there is no threshold here and no configurable one
anywhere (PRD §5). Three consecutive misses are emphasis on a screen; the archive decision is human.

`registeredOn` is a parameter because the domain has no notion of storage — there is no registration-date
column, and the application layer supplies the day from the household's first card (`index` 1), which is
issued with the registration.

### `src/application/customers/registerCustomer`

The one use case that turns a filled-in form into a customer: it reads the clock **once**, builds
the validated details as of that instant, resolves the settings in force through
`readCurrentSettings` for the quota, resolves the group (an explicit choice from the form wins over
`suggestGroup`), takes the lowest free number and writes the customer, household, certificate and
first card in a single `customers.create(…)` — one transaction, so a failure leaves no half-built
household and consumes no number. The card is not a separate action staff can forget.

The concurrent-registration race is real even at four users: two staff can read the same free slot
before either writes. The repository's partial unique index is the final authority and reports the
loss as `CustomerNumberTaken`; `registerCustomer` then retries with a fresh read, up to three
attempts, so the second registration lands on the next free number instead of showing an error that
staff could only answer by pressing the button again. The bound matters more than its size — an
unbounded loop would turn a repository fault into a hang. Anything that is not a lost race is not
retried.

The audit entry is written under `customer.registered` with an empty `why` — a registration needs no
justification — and names `customerNumber`, `group`, `status` and `card`: what the _system_ decided,
rather than repeating the fields staff typed, which are the record itself. A re-registration adds
`previousCustomerId` to that list, so the log accounts for why a second record for the same people
exists.

`previousCustomerId` is the **only** thing about a re-registration that differs from a walk-in
(US-11.3). It is optional on the input, stored as `null` when absent, and nothing branches on it: a
returning household still takes the lowest free number, still starts at card index 1 and still has a
reminder count of zero. There is no second registration path, which is the point — see below.

### `src/application/customers/issueCard`

The **single path by which any card comes into existence**. First issue (US-02), a replacement for a
lost card (US-09) and a replacement whose printed counts a birthday has overtaken (US-13) differ only
in the reason they record, so they are one use case with a different `reason` rather than three code
paths that could drift apart.

`issueCard(deps, { customerId, reason })` reads the clock once — the card's date and the audit
entry's instant are the same event — loads the customer (`CustomerNotFound` for an id nobody holds),
refuses an archived one (`CustomerArchived`, because their slot may already be another household's,
FR-6) but serves a **blocked** one, since a block turns a customer away at the counter without
unregistering them (US-08). The new index is `currentCard(customerId)` + 1, asked of
`nextCardNumber` so "the next card is the next index" is stated once, or 1 when the customer holds
none yet. Reading the _highest_ index rather than counting rows is what makes a gap in the run
harmless.

The counts printed on the card are derived here, from the household's birthdates at the moment of the
issue, and written _with_ the card: from then on the household can change and the printed pair cannot,
which is exactly what makes a stale card detectable (US-13.3). A card issued a week after a member's
13th birthday therefore prints 2/0 where the one before it printed 1/1, and the superseded card keeps
what it said.

Earlier cards are left on record: the history is how a reissue is explained, and every one of them is
invalid by the only definition there is — not being the highest. The audit entry goes under
`customer.card.issued`, names `card` as the changed field, and carries the reason as its `why`: it
was chosen by a human from a closed set, and a sentence beside it would say the same thing less
legibly months later.

The registration card is still written inside `customers.create(…)` rather than through this use
case, because the customer and their first card must land in **one transaction** (US-01.4) and a
second write could not. It records `FIRST_ISSUE` on the same `IssuedCard` shape this use case writes,
so the two paths differ only in the transaction they belong to.

### `src/application/customers/reissueCard`

The counter's answer to "I lost my card" (US-09.1) — and deliberately **not** a second implementation
of it. `reissueCard(deps, { customerId, reason })` hands straight to `issueCard`, so a replacement is
written by the same code as a first issue: the new card takes the next index, and because the highest
index _is_ what valid means, every earlier number stops working as a consequence of that one write
rather than through a second step someone could forget (FR-2). A parallel issuing path is exactly how
the "exactly one valid card" invariant would break.

What delegation alone cannot say is added by the narrower `ReissueReason` — every `CardIssueReason`
except `FIRST_ISSUE`, which belongs to the registration and nothing else. A replacement filed as a
first issue would vanish from the count of losses the card view shows staff (FR-5), and the type makes
it unrepresentable.

There is **no limit check** (FR-4): the tenth reissue is written exactly like the second. Whether a
household loses cards too often is a judgement staff make from a count the software shows them, never
one it makes for them. Nothing but the card run changes — status, customer number, group, reminder
count and the distribution history are untouched, which is what the use case's tests pin.

### `src/application/customers/listCardsDueForReissue`

Which households hold a card that no longer prints what their record says (US-13.2, US-16.4). It
writes nothing, reclassifies nobody and moves nobody: a child becomes a grown-up because `composition`
derives the counts from the birthdates on every read — no job, no trigger, no event. What this adds is
the _consequence_, that the piece of card in the household's pocket still shows the old numbers, or
names the wrong week.

`listCardsDueForReissue(deps)` reads the clock once, asks `customers.listWithStatus("ACTIVE")` for the
register, and for each household compares `{ card.countsAtIssue, card.groupAtIssue }` with
`{ composition(members, today), customer.group }` through `staleCardReason`. Each entry carries the
surrogate id (what a reissue is written against), the customer number, the name, the card number, the
number a reissue would hand out, **both** count sets, **both** groups and the reason. The repository's order — lowest customer number first — is handed on untouched
rather than sorted again here.

`countCardsDueForReissue(deps)` is the same question asked for the home screen's badge, and it
answers by taking the length of that list rather than counting anything of its own — badge and screen
are then one statement and cannot drift apart. It is not a `COUNT(*)` for the same reason the list is
not a `WHERE`.

**Only active households.** A blocked one is not collecting (US-08), so listing them would ask staff
to print a card nobody is coming for; an archived one holds no slot and may not be issued a card at
all (US-10). Neither exclusion loses anything, because the list is derived on every read: a household
returning to `ACTIVE` reappears on it by itself.

The whole active register is read and compared in application code rather than filtered in SQL,
because the comparison is **not expressible as a query** — one side of it is a rule over birthdates
that changes answer as the clock moves without any row changing. At FD's ~240 customers that is one
query and a few hundred date comparisons on a screen nobody stands at, which is the deliberate choice
US-13.3 asks to be recorded rather than a limitation to work around.

Nothing acts on this list on its own. It is a to-do list, not an alert queue: a stale card is never
grounds to turn anyone away (FR-5).

### `src/application/customers/proposeRegistration` and `readCustomer`

The two read-side use cases the customer screens sit on:

- **`proposeRegistration`** answers what the _empty_ form should show: the lowest free number (via
  `findLowestFreeNumber`, the total form of the rule, so a full register is `null` rather than a
  throw), the suggested group, both group sizes and the day to judge birthdates against. Read-only —
  it reserves nothing.
- **`readCustomer`** answers what the customer overview shows: the customer plus everything
  derivable from them, worked out here rather than in the page — the card number from the slot and
  the card index, and the household counts, portions and price from `describeAllowance` (US-07.4), so
  the counts on the record are a slice of the same allowance the counter reads. It throws
  `CustomerNotFound` for an id nobody holds. It also names `nextCardNumber` — the number a
  replacement would carry, from `nextCardNumber()` in the domain — so the record's reissue
  confirmation states the number it is about to hand out without the page working it out (US-09.3).
  It also carries `consecutiveNoShows` (US-10.4) — the household's own distributions missed in a row,
  through the `countNoShows` seam below — which is why it takes the read side of
  `DistributionRecordRepository`: a no-show is the absence of a record, so the history has to be read
  to count one. US-16.5 added three more, all of them for the record screen and none of them a new
  query but one: `history`, the same hand-out records **sorted newest first** and shown with the
  price each one actually cost (the record's own `priceCents`, never re-derived from today's
  settings); `groupCounts`, both group sizes, because moving a household between RED and BLUE is a
  decision made by comparing them (FR-4); and `today`, the day the record's household editor judges
  its rows against while they are being typed — handed out for the reason `proposeRegistration`
  hands out its own, because a browser counting against its own clock would flicker onto a different
  answer than the save derives.
- **`readCard`** answers what the _card_ shows (US-02.4): the current card number, the name, the
  group, the counts, portions and price as of today (all via `describeAllowance`), and the numbers
  this card replaced. It reads the customer's whole
  run of cards in **one** `listCards` call and takes the head as the current card — asking twice,
  once for the current card and once for the rest, would let two answers come from two moments. A
  customer with no card at all is refused as an `InvalidCustomerRecord` rather than shown a card
  without a number: registration writes the first card in the same transaction as the customer, so
  an empty run can only come from a hand-edited database. It also carries `cardsIssued` (the current
  index — how many numbers the household has been through) and `reissuesForLoss`, which come from
  `cards.issueCounts` rather than from filtering the run it already holds (US-09.2): counting here
  would state a second time which reason is a loss, and the two statements would drift the day US-13
  adds one. The counts are shown and never acted on — no threshold, no warning (§FR-4, §FR-5). Two
  further fields serve the reissue control (US-09.3): `nextCardNumber`, the number a replacement
  would carry, and `status`, which is on the card view for the single reason that an archived
  household is offered no replacement — the card itself is not a permission, and a blocked household
  still holds theirs.

`customerNumber.ts` therefore exports the rule in **two forms**: `findLowestFreeNumber` returning
`number | null` for callers that only want to _show_ the next number, and `lowestFreeNumber` throwing
`NoFreeCustomerNumber` for the caller that is about to allocate one. The second is written in terms
of the first, so there is still one statement of the rule.

### `src/application/customers/recordReminder` and `renewCertificate`

The two writes of the certificate reminder trail (US-06), which makes the grace period **documented
rather than remembered**. An expired certificate never blocks a hand-out; it starts a conversation
at the counter, and these use cases record its two possible outcomes.

- **`recordReminder(deps, { customerId })`** logs that the customer was reminded today and returns
  the resulting count. Two guards stand before the write: the certificate must actually have lapsed
  (`isExpired`; otherwise `CertificateStillValid` — there is nothing to remind about), and no
  reminder may exist on today's **Berlin** day (`berlinDayKey`, the same notion of "the same day"
  the attendance rule uses; otherwise `ReminderAlreadyLoggedToday`, writing nothing — a mis-click
  must not consume the grace period). The audit entry goes under `customer.reminder.logged` and
  records the resulting count in its `why` (`reminderCount=2`), so the log alone tells the trail's
  state. Deliberately absent: any threshold or escalation. What a count of three means is a staff
  judgement (PRD §5), so the count is returned, shown, and never acted on.
- **`renewCertificate(deps, { customerId, type, validUntil })`** records the renewed certificate
  and resets the reminder count to zero — one repository call, one transaction, because a renewal
  that landed without its reset would show a customer still owing what they just brought. A blank
  type is refused (`MissingRequiredField`) and so is an end date that has already lapsed
  (`CertificateValidUntilInPast`), decided by the same `isExpired` rule the counter reads — an end
  date of today is accepted, because a certificate is valid through its last day. The certificate
  is appended, never overwritten (FR-8), and the reminder _log_ is untouched: only the running
  count starts over. The audit entry (`customer.certificate.renewed`) needs no reason — the
  changed fields already say it.

Both are tested against hand-written fakes and a fake clock (`certificate-reminder.test.ts`),
including the Berlin-midnight boundary and the valid-through-its-last-day boundary.

### `src/application/customers/blockCustomer` and `unblockCustomer`

The two writes of the manual, temporary **block** (US-08): a household paused with a mandatory
free-text reason, lifted when staff judge the matter settled. A block keeps everything — the
customer number, the card and the record — and does **not** free the slot; only archiving does.

- **`blockCustomer(deps, { customerId, reason })`** trims the reason once, then asks the
  `transition` state machine to move `ACTIVE → BLOCKED`. The machine settles both questions before
  any write: an already-blocked or archived customer is an illegal move (`IllegalStatusTransition`),
  and a whitespace-only reason is a missing record (`MissingAuditReason`, the same error the archive
  and settings changes speak). Persistence is one `setStatus` call storing the status and reason
  together; the audit entry (`customer.blocked`, changed fields `status`, `blockReason`) carries the
  reason verbatim as its `why`, because with the field cleared on unblock the log is the only place
  the text survives.
- **`unblockCustomer(deps, { customerId })`** moves `BLOCKED → ACTIVE` (again the state machine
  refuses lifting a block on a customer who has none) and clears the reason with `setStatus(…, null)`.
  It reads the current reason **before** clearing it so the audit entry (`customer.unblocked`) records
  the block that was lifted; a hand-fixed row with no reason records an empty `why` rather than
  crashing. No new reason is asked for — lifting needs no justification of its own.

Neither use case touches the customer number, the card or any distribution record. Both are tested
against hand-written fakes (`customers.test.ts`), including that a block leaves the number in the
taken-slots query — a block never frees a slot.

### `src/application/customers/archiveCustomer`

How a household **leaves the register** (US-10.2) — and the only write in the system that frees
something: the customer number becomes available to the next registration the moment it lands
(FR-4), which is what makes archiving the answer to a waiting list rather than a tidy-up.

`archiveCustomer(deps, { customerId, reason })` trims the reason once and asks the same `transition`
state machine to move `→ ARCHIVED`, from `ACTIVE` or from `BLOCKED` — a paused household can still
leave. The machine settles both questions before any write: archiving an already-archived customer is
an illegal move (`IllegalStatusTransition`, and not a no-op, because their slot may by now be someone
else's), and a whitespace-only reason is a missing record (`MissingAuditReason("customer.archived")`).
Persistence is one `archive(id, reason, archivedAt)` call writing the status, the reason and the
instant together and clearing any block reason with them; the audit entry (`customer.archived`,
changed fields `status`, `archiveReason`, `archivedAt`) carries the reason verbatim as its `why`.

Everything else stays. The customer number remains **on the archived row** for the historical record
— the slot is freed by the status alone, through the partial unique index that exempts archived rows
(PRD §7) — and cards, certificates, distribution records, reminder logs and notes are untouched,
because nothing about a customer is ever hard-deleted. The fakes prove it as behaviour rather than
signature: `customers.test.ts` snapshots everything the household owns before and after the archive
and compares the two, and asserts that the freed number is what `lowestFreeNumber` offers next.
There is no un-archive; a returning household is registered anew (FR-7, US-11).

### `src/application/customers/searchArchivedCustomers`

The first half of re-registering someone who has been here before (US-11.1). `searchArchivedCustomers
(deps, { lastName?, firstName?, birthDate? })` returns `{ matches, truncated }` — archived households
only, most recently archived first.

It is a **read with no clock and no audit log**: nothing changes, and household _size_ is the number
of people on the record rather than a count of grown-ups and children, so nothing here depends on the
day it is asked. Names are trimmed before they count, so a stray space is not a criterion; a search
with every criterion blank is refused as `EmptySearchQuery` rather than answered with the whole
archive, because a list staff scroll through is a list they pre-fill a registration from the wrong row
of.

The cap is `MAX_ARCHIVE_SEARCH_RESULTS = 20` and there is **no paging**: the use case asks the
repository for twenty-one rows, shows twenty and reports `truncated`, which the screen turns into
"please narrow the search". A count of the remainder would only invite staff to page towards it.

Each match carries what tells two people of the same name apart — name, birthdate, address, household
size — plus `formerCustomerNumber`, the archive date and the reason. The former number is for
recognition only: the slot was freed when they left and may already be someone else's, so
re-registration allocates a number afresh (US-11.3, FR-3). Only `customerId` is followed up on; the
pre-fill reads the record by it (US-11.2).

### `src/application/customers/listCustomers`

The searchable customer list (US-15.1) — the view that replaces the spreadsheet. `listCustomers(deps,
{ search?, status?, group?, certificate?, includeArchived? })` returns `{ rows, groupCounts }`, lowest
customer number first: the call-up order staff think in.

It is a **read with no audit entry**, because nothing changed. Every filter is handed to the
repository as a `CustomerListQuery` and answered in SQL (US-15.2); nothing is loaded to be filtered
afterwards. What the use case decides on its own is only what a store cannot: which statuses to show.
An absent or empty `status` is not a filter — unticking every box means "all of them", never "none" —
and archived households are then taken back out unless `includeArchived` is true or `status` names
`ARCHIVED` explicitly.

The single search box is read here rather than split into three inputs: `counterQueryOrNull` decides
whether what was typed is a customer number, a card number or a name, because what a card number
_looks like_ is a domain rule. A card number resolves to the household holding the slot and its index
is dropped — the list is about households, and whether the card presented is the current one is the
counter's question (US-04). A padded `050` is not customer 50 there either, so it falls through to a
name and finds nobody.

`certificate` is turned into a `validUntilRangeFor` window against `deps.clock.now()`, so the
expiring-soon boundary is the domain's and moves with the day rather than with a stored flag. Every
column of every row is derived: the counts from the birthdates, portions and price from the settings
in force today (through `describeAllowances`, which reads the version history **once** for the whole
screen rather than per row), the card number from the slot and the current index, the certificate
state from today's date.

`groupCounts` is deliberately **not** a count of the rows above it. Staff read it while registering
somebody (US-01) to decide which group keeps the two weeks even, so it counts every active household
regardless of the current filter (PRD FR-3) — a number that moved with the filter would be a
different question wearing the same label.

### `src/application/customers/updateHousehold`

How a household changes after registration (US-16.1). `updateHousehold(deps, { customerId, members })`
**replaces the whole member set** — it is not an add-and-remove pair, because staff edit the list in
front of them and press save, and because no history of past compositions is kept (PRD §FR-2).

The rows are judged by `createHouseholdMembers`, the same domain rule a registration is judged by, so
an edit can never let through a household a registration would refuse: an empty list is
`EmptyHousehold`, a member born after today is `BirthDateInFuture`, and a blank name names its row
(`householdMembers.1.firstName`). The function was extracted from `createCustomerDetails` for exactly
this reason — a second implementation would be free to diverge with the first rule that changed.

A **blocked** household may be edited (a block turns them away at the counter, it does not freeze
their record); an **archived** one may not, and is refused as `CustomerArchived` — their record is
read-only (PRD §FR-8). Persistence is one `updateHousehold(id, members)` call; the audit entry is
`customer.householdUpdated` with the single changed field `householdMembers` and an empty `why`,
because what changed is what the record now says.

**Nothing derived is written, and there is nothing to write.** The counts, the portion allowance and
the price are read off the birthdates wherever they are needed, so they are already right the instant
the call returns; the same is true of the cards-due-for-reissue list, which is why
`maintain-customer.test.ts` proves the consequence rather than a queue — it drives the real
`listCardsDueForReissue` over the fake register: after an edit that changes the counts the household turns
up in `listCardsDueForReissue` with reason `HOUSEHOLD_CHANGE`, and after a spelling fix it does not.
What the household _was_ survives in exactly one place, as a fact about a physical object: the counts
printed on the card they hold.

### `src/application/customers/updateCustomerDetails`

Correcting who a customer is and where they live (US-16.2) — a misspelt surname, a birthdate typed a
year out, a household that has moved house. The data is judged by `createPersonalDetails`, extracted
from `createCustomerDetails` for the same reason `createHouseholdMembers` was: a correction must be
judged by exactly the rules the registration was, and a second implementation would be free to accept
what a registration refuses.

**The customer number is not an input, and cannot be reached from here** (PRD §FR-7). A slot is
assigned when a household joins the register and released when they leave it; editing it would hand a
household a number another one may already hold, and every card ever printed for them would name the
wrong slot. There is no field for it, which is the whole of the guarantee.

#### Decision: the customer is one of their own household members, kept in step in one write

A registered customer's name and birthdate sit on the record **twice** — once as the person the slot
belongs to (`Customer.firstName`…), and once as a row among the people they live with
(`HouseholdMember`), because every rule that counts heads reads the household rows and the customer is
a head like any other. The PRD (§7) asks for a single source of truth. The register cannot have one
without either

- **dropping the customer from their own household**, which would make `EmptyHousehold` meaningless
  and a one-person household unrepresentable — and US-16.1 shipped on the opposite rule; or
- **giving household rows an identity**, which they do not have: two children of the same name and
  birthdate are two rows and nothing tells them apart, which is exactly why `updateHousehold`
  _replaces_ the set rather than diffing it.

So the two copies are **kept in step in one write** instead. `replaceHouseholdMember(members, was,
becomes)` — a pure domain rule — restates the row that held the customer's _old_ name and birthdate
with the new ones, and `updateDetails(id, details, household)` writes the personal data and the
household in a single transaction, so the two halves can never land apart. The row is found by what it
says, because before the edit the customer's row is the one holding exactly their old values; only the
first such row moves, since one person cannot live in a household twice. When **no** row says what the
customer used to, the household is left exactly as it stands: nothing there claims to be them, and
guessing which row meant them is how an edit rewrites somebody else.

The consequence follows for free, and `maintain-customer.test.ts` proves it by driving the real
`listCardsDueForReissue`: correcting a birthdate across the 13-year line changes the counts and puts
the household on the cards-due list with reason `HOUSEHOLD_CHANGE`, while correcting a spelling does
not. The audit entry is `customer.detailsUpdated` with the changed fields `firstName`, `lastName`,
`birthDate`, `address` and an empty `why` — the household is deliberately **not** among them, because
the row that moved is the customer's own name said a second time and not a member joining or leaving.

A **blocked** customer may be corrected; an **archived** one is refused as `CustomerArchived`, because
their record is read-only (PRD §FR-8).

### `src/application/customers/updateNotes`

The free-text note staff leave for the counter (US-16.3). `updateNotes(deps, { customerId, notes })`
saves the text as written, line breaks and all; **an empty note is a legitimate answer**, unlike a
block reason, whose whole purpose is to record a judgement. The one refusal is `NotesTooLong` past
`NOTES_MAX_LENGTH` (4000 characters) — a bound on a text column so a pasted document cannot become a
customer record, deliberately **not** a settings value beside the prices and portions FD edits.

Nothing is derived from a note and nothing follows from changing one, so persistence is a single
column write and there is nothing to keep in step: the counter lookup (US-04.2) reads back the very
column this writes, which `maintain-customer.test.ts` proves by driving the real `lookupCustomer` over
the same fake register. The audit entry is `customer.notesUpdated` with the single changed field
`notes`; the note's **text** is deliberately not in it, neither before nor after, because a copy of
every note ever written would turn the audit trail into a second, undeletable customer record.

It is its own use case rather than a field of `updateCustomerDetails` because it is its own decision
with its own audit entry — and an entry reading `firstName, lastName, birthDate, address, notes` every
time would make the log unreadable for both.

### `src/application/customers/changeGroup`

Moving a household between the two halves of the distribution cycle (US-16.4).
`changeGroup(deps, { customerId, group })` takes the group they should be in afterwards — never a
direction to toggle — writes it through `setGroup`, and **returns the resulting group sizes**, counted
after the write. The two groups have to stay roughly equal or one week overwhelms the volunteers while
the other wastes the food collected for it; registration proposes the smaller group
(`suggestGroup`), the register drifts as households come and go, and this is how staff correct it. The
sizes come back with the answer because the decision it serves is a comparison: staff move somebody
_in order to_ balance the register.

The change is in force **immediately, including for today**: the counter derives its verdict from the
group column every time it is asked (US-04), so a household moved to RED on a RED distribution day is
servable the same afternoon with nothing to re-run. That is a consequence of deriving rather than
anything implemented here, and `maintain-customer.test.ts` says so by driving the real
`lookupCustomer` over the same fake register — `WRONG_GROUP` before the move, `CLEAR_TO_SERVE` after
it, on one instant.

What does _not_ follow automatically is the card, which prints the group. The household is left
carrying a piece of paper naming the wrong week, and the cards-due list derives that on its next read
with reason `GROUP_CHANGE` (see `staleCard.ts`) — nothing is enqueued and nothing can be forgotten.

Moving to the group the customer is already in is refused as `GroupUnchanged` rather than quietly
accepted: it would write an audit entry for a move that never happened and put the household on the
cards-due list for a change nobody made. A **blocked** household may be moved — a block pauses them at
the counter, and balancing the groups is FD's business rather than theirs — an **archived** one may
not (PRD §FR-8). The audit entry is `customer.groupChanged` with the single changed field `group` and
no `why`: unlike a block or an archive it turns on no judgement about the household.

### `src/application/customers/draftFromArchived`

The second half of the pre-fill (US-11.2). `draftFromArchived(deps, { archivedCustomerId })` reads
one archived record by id and returns a `RegistrationDraft`: the applicant's name and birthdate, the
address, and the household members. Nothing else.

It **creates nothing and mutates nothing** — no clock, no audit log, no write of any kind — and the
tests state that as behaviour rather than reading it off the signature: a card store, a distribution
history and an audit log are handed in as witnesses, and the whole register is compared before and
after. The draft is not a reservation and not a half-created customer; discarding it leaves nothing
behind, and registering it goes through the ordinary `registerCustomer` path (US-11.3).

Everything left out is left out for a reason. The **customer number** was freed the day the household
was archived and may be someone else's by now (FR-3); the **certificate** is the paper the applicant
is holding today, and copying the lapsed one forward would record a proof of need nobody has seen
(FR-4); the **group, card and reminder count** are registration's to decide; and the **notes** are a
remark about a household two years ago, not about this registration (PRD §5). A test asserts the
draft's key set, so a field that creeps in later has to be argued for.

Every value is **copied, not shared**. `Date` is mutable and a form writes back into what it is bound
to, so a shared birthdate would let editing the draft reach into the archived record; the test mutates
the draft in every way a form can — overwriting fields, advancing dates, pushing a member — and
asserts the stored record is unchanged.

An id that belongs to nobody is `CustomerNotFound`; an id that belongs to a household **still on the
register** is `CustomerNotArchived`. The archive search only lists archived rows, so the second is
reached by an id from elsewhere — and pre-filling from an active record would walk staff into
registering a household that already holds a slot (FR-6).

### Re-registering a returning household (US-11.3)

There is **no `reRegisterCustomer` use case**, and that is the design. Re-registration is
`draftFromArchived` followed by `registerCustomer`: the screen pre-fills the form from an archived
record, staff correct what has changed and add the certificate the applicant is holding today, and
the form is submitted through the one registration path there is. A parallel path would give the
number allocation, the group balancing, the first card and the audit entry two homes, and only one
of them would be fixed the day a rule changed.

What comes out is a **new customer**, not the old one brought back:

- a new surrogate id, and a **newly allocated lowest free number** — the old slot was released the
  day the household was archived and may be someone else's by now (FR-3), so nothing assumes they
  get it back;
- a card at **index 1** with reason `FIRST_ISSUE`, printing the counts of the household as it stands
  today;
- a **reminder count of 0**, and the certificate presented today recorded as the first row of a
  fresh trail (FR-4);
- `registeredOn` = today, because it is derived from the first card.

The archived record is **untouched** — status, number, cards and distribution history all exactly as
archiving left them (FR-5). Both application and integration tests compare the whole predecessor row
before and after and assert the two are identical; the archived household keeps showing the number it
held, while the returning one holds whichever number was free.

The new record carries `previousCustomerId`, a nullable self-reference to the archived predecessor.
It is **display metadata and nothing else**: no rule reads it, nothing is carried across it, and it
exists so that a future "history of this household" view is additive (PRD §7). Because the
application deliberately does not verify it — a lookup purely to check it would make it a rule — the
foreign key does: a link to an id nobody holds is refused by the database, and the adapter reports it
as the domain's `CustomerNotFound`. Like every other relation it is `onDelete: Restrict`, so a
household with a successor cannot be deleted any more than one with cards can.

### `src/application/waiting-list/`

The five use cases over the waiting list (US-12.2), tested against hand-written fakes and a fake
clock in `waiting-list.test.ts`.

- **`addToWaitingList(deps, input)`** validates the application through
  `createWaitingListDetails` and writes it with `addedOn = deps.clock.now()`. The clock is read
  **once**: the day the applicant is judged eligible and the day that fixes their place in the queue
  are the same day, and an entry admitted on a certificate that lapsed between two reads would be
  indefensible. There is no position column — `addedOn` is the whole of a place in the queue, so
  nothing has to be renumbered when somebody is promoted or withdraws.
- **`listWaiting(deps)`** returns every waiting applicant as a `WaitingListPlace`: their `position`
  counting from 1, the entry, `daysWaiting` and `certificateExpired`. The order, the numbering and the
  wait all come from the domain (`inArrivalOrder`, `daysWaiting`, `isExpired`) rather than from the
  query or the screen — a screen that numbered the rows itself would be a second statement of the
  order, and the two could drift.
- **`removeFromWaitingList(deps, { entryId, reason })`** stamps the row rather than deleting it
  (FR-7) and writes a `waitingList.removed` audit entry. The reason is required
  (`MissingAuditReason`): a waiting list is only worth the claim it makes — that the longest wait was
  served first — and that claim can only be checked against a history that still has the people who
  left in it, each able to say whether they went of their own accord.
- **`promoteFromWaitingList(deps, { entryId })`** is a **read**. It returns the number the applicant
  would take (`lowestFreeNumber`, refusing with `NoFreeCustomerNumber` when the register is full),
  `certificateExpired`, and a `WaitingListRegistrationDraft`. The draft carries two things
  `draftFromArchived` deliberately drops, for the opposite reason in each case: the **certificate**,
  because it was seen when the applicant joined and is re-checked here, and the **contact note** as
  the record's notes, because it is the most current thing FD knows about them. Its household holds
  the applicant alone — they are by definition a member of their own household, and the rest is typed
  at registration. Nobody is registered and nothing is written, so the entry stays on the list.
- **`registerFromWaitingList(deps, input)`** is the one that writes: it checks the entry is still
  waiting, calls **`registerCustomer`** — the only registration path there is, so the slot
  allocation, the first card and the `customer.registered` entry are the ordinary ones — and only
  **then** removes the entry and logs `waitingList.promoted`. The order is the whole point: a
  registration can fail on the last field of the form, and an applicant removed a moment earlier
  would have lost the place they waited months for. A test proves it by failing a registration on an
  empty household and asserting the entry is still there.

The applicant is promoted **by id** rather than taken from the head of the queue. The order is stated
by `listWaiting` and by the banner, which names the longest-waiting applicant and no one else; what
is left open is the one case FD has not decided — an expired certificate at the head, where skipping
to the next applicant is one of the answers on the table (PRD §9). Deciding it in code would close it
off before FD has chosen.

Both removals record _why_. A withdrawal carries the sentence staff typed; a promotion carries
`customerNumber=<n>`, one of the two machine-written reasons in the system (the other is the reminder
trail's `reminderCount=<n>`), because nobody made a judgement — what the row has to say is which slot
the applicant went to. It is stamped at `customer.registeredOn`, the registration's own instant,
rather than at a second reading of the clock.

### `src/application/customers/countNoShows`

The seam both screens that show the no-show count read (US-10.4), so the customer record and the
counter can never disagree about it. The rule itself is `consecutiveNoShows` in the domain; this adds
the one decision the pure module cannot make — **which settings the count is read against**, namely
the version in force at the instant asked about, because the schedule the misses are counted on (the
distribution weekday and the week-colour anchor) is policy FD can change (US-14).

The customer's records are **passed in** rather than loaded here. The counter already holds them from
its single pass over the register (US-04.3), and fetching them again would put a second query on the
busiest screen in the product for a number it has the raw material for; the customer record reads them
alongside the allowance in the same `Promise.all`. `registeredOn` comes off the customer record, where
it is derived from the first card.

### `src/infrastructure/prisma/audit-log.ts`

The **append-only audit log** (`PrismaAuditLog`). Every state change is recorded with a timestamp
and, where one was asked for, a reason — but **never an actor**: FD has ruled out login, so the
system records _what / when / why_, never _who_. A settings edit stores an empty `why` when staff
gave none, because `changedFields` already says what happened; the judgement calls (block, archive)
require one. Adding an actor field would be an additive change if login is ever introduced.
There is no update and no delete: an entry that could be rewritten would be worth nothing. The field
list is stored comma-separated because SQLite has no array column and the list is only ever read
back for display.

### `src/infrastructure/prisma/customer-repository.ts`

`PrismaCustomerRepository` (the `CustomerRepository` port) and `PrismaCustomerCounter` (the
`CustomerCounter` port), together because they answer the same question — who still holds a customer
number — and stating that condition twice is how a number gets handed out twice. Both count
`status <> 'ARCHIVED'`: `ACTIVE` and `BLOCKED` occupy a slot, only archiving releases one.

`create` writes the customer, the household members, the certificate and the first card as **one
nested Prisma create**, which Prisma runs in a single transaction — a failure leaves neither a
half-built household nor a consumed number. A `P2002` naming `customerNumber` is translated into the
domain's `CustomerNumberTaken`, which is what lets `registerCustomer` retry with a fresh read, and a
`P2003` — the only foreign key in the nested write that can name a row which might not exist — into
`CustomerNotFound` for the `previousCustomerId` the caller supplied (US-11.3); any other failure is
rethrown as itself. SQLite reports a foreign-key violation with no `meta`, so the column cannot be
read off the error: every other key in that write points at the row being inserted, which is what
makes the attribution safe. `setStatus(id, status, blockReason)` is the one write behind
`blockCustomer` / `unblockCustomer`: it updates the `status` and `blockReason` columns together, so
the reason a blocked customer carries can never disagree with their status.

`updateHousehold(id, members)` is the one write behind the household editor (US-16.1), and the only
**delete** in this file: it removes the customer's member rows and creates the given ones inside a
single `$transaction`. Matching the given rows against the stored ones is not possible — two children
of the same name and birthdate are two rows and nothing distinguishes them — and a partial match would
leave a household nobody typed. The delete is not customer data leaving the system: past compositions
are deliberately not kept (US-16, FR-2), and the counts a household _had_ survive on the card that
printed them. It is also the reason `HouseholdMember` is the one relation an integration test may
clear directly (`clearRegister` deletes children first anyway).

`setGroup(id, group)` is the write behind `changeGroup` (US-16.4) — one column, and deliberately
nothing beside it. The cards the household has been issued are left alone: each printed the group that
was true when it left the counter, and updating that snapshot is exactly what would hide the fact that
the card in their pocket now names the wrong week.

`updateDetails(id, details, household)` is the write behind `updateCustomerDetails` (US-16.2), and the
one other place the member rows are replaced. The customer's columns, the folded search keys and the
household go out in a **single `$transaction`**: the keys are rewritten from the names in the same
statement, because they are a stored _search key_ rather than a fact and a name edited without them
would leave the register findable only under a spelling nobody uses any more (US-11.1); the household
travels along because the customer is one of its rows, and which row was them has already been decided
by the domain (`replaceHouseholdMember`). It is written even when nothing in it moved, so there is one
code path here rather than a comparison this layer has no business making. No argument reaches the
customer number (PRD §FR-7). `updateNotes(id, notes)` is the shortest write in the file — one column,
one statement — because nothing is derived from a note and there is nothing to keep in step with it.

`archive(id, reason, archivedAt)` is the one write behind `archiveCustomer` (US-10): status, reason
and instant in a single statement, with any block reason cleared alongside them. It is a plain
`WHERE id` update and nothing more — no related row is touched and the customer number stays put,
because freeing the slot is entirely the partial unique index's doing.

`list(query)` is the customer list's read (US-15.2). Every criterion of `CustomerListQuery` becomes a
`WHERE` clause and the order is `customerNumber ASC`; only the derived counts are computed per row
afterwards, because they are a rule over birthdates rather than a comparison a database can make. At
~240 households loading the register and sieving it in JavaScript would work, which is exactly why
the choice is written down: the screen that replaces a spreadsheet must not _be_ one, and an
integration test over fifty seeded households asserts the filtering happens in SQL by reading the
generated statement.

The name search folds **here**, with the same `foldName` that wrote the columns, so this search and
the archive search agree letter for letter — one normalisation in the codebase, not two. A folded
prefix matches either name, because staff type whichever of the two they were given, and both halves
of that `OR` rest on an index: `(lastNameFolded, birthDate)` and `firstNameFolded`. `status` and
`group` are indexed for the two filters and for the group counts, and `customerNumber` for the exact
match a typed number is — `5` is customer 5 and never a prefix of 50. The spelled `lastName` column
is deliberately **not** indexed: nothing compares it, and an index on it would suggest something does.

The certificate filter is the one criterion Prisma cannot express, because `certificates: { some: … }`
matches a notice the household has long since renewed — precisely the household the list must not
show as expired. `idsByCurrentCertificate(range)` is therefore a `$queryRaw` with a correlated
subquery picking the same row `CUSTOMER_INCLUDE` calls current (latest `recordedAt`, id breaking the
tie), fed back as `id: { in: … }`. The bounds are half-open, `from` included and `before` excluded, so
a `validUntil` stored with a time of day still falls on the side its calendar day belongs to.

`searchArchived(query, limit)` is the archive search's read (US-11.1). It filters `status =
'ARCHIVED'` — an active household turning up would invite a second registration of someone who
already holds a slot — and orders by `archivedAt DESC, id DESC`, the id breaking a same-instant tie
so two runs of the same search agree. The name criteria are folded **here**, with the domain's
`foldName`, because only this layer knows the columns hold folded values; the query is then a
`startsWith` on `lastNameFolded` / `firstNameFolded`, a prefix match the
`(lastNameFolded, birthDate)` index serves. A criterion nobody filled in is left out of the `where`
entirely rather than matched against the empty string. The rows come back as `ArchivedCustomer`,
whose archive reason and instant are narrowed to non-null: `archive` writes both with the status in
one statement, so a row without them is a hand-edited database and is refused as an
`InvalidCustomerRecord` rather than displayed with a blank reason.

The **partial unique index** the adapter relies on is not in `schema.prisma` — Prisma has no syntax
for one — but hand-written at the end of the `init` migration:

```sql
CREATE UNIQUE INDEX "Customer_customerNumber_onRegister_key"
    ON "Customer"("customerNumber") WHERE "status" <> 'ARCHIVED';
```

It is the final authority on a free number: the application reads the taken numbers and then writes,
and only the database can settle the race in between. **Regenerating the migration drops it** — re-add
it, or the slot rule is enforced by application code alone.

The include loads the **whole run of cards**, highest index first, rather than only the top one: the
head is the card the household holds and the tail is their _first_ card, whose `issuedAt` is
`registeredOn` (US-10.1). A household's run is two or three rows, so this costs less than a second
query for one date on the counter's hot path — and the number of statements per lookup stays fixed,
which is the invariant the integration test pins. A row with no card at all is refused as an
`InvalidCustomerRecord`: registration writes the first card in the same transaction as the customer.

`findByCustomerNumber(n)` is the counter's read (US-04). Because a customer number is a slot rather
than an identity, it is deliberately **two queries and not one `orderBy`**: an active holder wins over
an archived one whenever there is one, and only when the slot stands empty does recency pick the most
recently archived holder. A reassigned number therefore resolves to its current holder, never to the
household it was taken from. `Customer.customerNumber` and `Customer.status` are both indexed so the
query stays instant while staff work through a queue.

`findById` and `findByCustomerNumber` share one `CUSTOMER_INCLUDE`, which pulls the household, the
certificate and the current card along with the customer. Prisma's SQLite provider has **no join
strategy** (`relationLoadStrategy: "join"` is Postgres/MySQL only), so a lookup is four statements —
the customer plus one per relation — rather than literally one. The property that matters at the
counter is that the number is _fixed_: a ten-person household costs the same four reads as a
two-person one, so there is no N+1. An integration test pins that by measuring the query count for two
household sizes and asserting they are equal, rather than asserting a magic number that a future
relation would invalidate.

### `src/infrastructure/prisma/card-repository.ts`

`PrismaCardRepository` (the `CardRepository` port). It stores cards and reads them back and decides
nothing: `currentCard(customerId)` is the highest-indexed row, because that _is_ what valid means
(FR-4), and there is no flag to set when a replacement supersedes it. An unknown customer id answers
`null` like a customer who simply holds no card — whether the household exists is the use case's
question, asked once of the customer register.

`toCard` puts the flat columns back into the domain's shape in one place, so `currentCard` and
`listCards` cannot come to read a snapshot differently, and checks the stored `groupAtIssue` word
through `parseGroup` rather than trusting it — SQLite has no enum type.

`issue` translates a `P2002` naming `index` into the domain's `CardIndexTaken`. The constraint behind
it is `@@unique([customerId, index])`, and it is what makes "exactly one valid card" (FR-3) true
under two simultaneous issues: if both writes landed, two cards would share the highest index and
neither would be the current one. The constraint is per **customer id**, deliberately not per card
number: slot 50 is reassigned when a household is archived, so two customers may each legitimately
hold `50k1` (FR-6).

The `Card.reason` column is the one thing a superseded card's index cannot say — why the household
needed another one. It is a plain string, narrowed back through `parseCardIssueReason` on the way
out.

`Card.grownUpsAtIssue` and `Card.childrenAtIssue` are flat columns in SQLite and one
`HouseholdComposition` in the domain, so the shape is put back together in a single private
`toCard(row)` that `currentCard`, `listCards` and `issue` all go through — two mappings would be two
readings of the same snapshot. They are the **only** stored counts in the schema and are documented in
`schema.prisma` as a snapshot of the printed card rather than household truth, so a future maintainer
does not "fix" the duplication; `Customer` still has no count column. `Card.groupAtIssue` travels with
them through the same mapping and carries the same argument (US-16.4): the card prints which week the
household collects in, so the printed group is a fact about the artefact and never about the
household, whose group is `Customer.group`.

`issueCounts(customerId)` answers both numbers behind the reissue count (US-09.2) in a **single**
`groupBy(["reason"])`: the highest index is the largest of the groups' maxima and the loss count is
the size of the `LOST` group, so the query costs the same for a household on its first card as for
one on its eleventh. The reason word is parsed rather than string-compared, so a hand-edited row
fails here as loudly as it does in `currentCard` instead of quietly dropping out of the loss count.

### `src/infrastructure/prisma/reminder-log-repository.ts` and `certificate-repository.ts`

The two adapters behind the certificate reminder trail (US-06.3).

`PrismaReminderLogRepository` (the `ReminderLogRepository` port) stores the trail and decides
nothing: the once-per-day rule is the use case's (`recordReminder`), and what the adapter owns is
the unique `(customerId, loggedOn)` constraint that settles which of two simultaneous reminders on
one day got written. `loggedOn` is the **Berlin** calendar day the use case derives with
`berlinDayKey`, mirroring `DistributionRecord.dayKey`, so the constraint and the guard share one
notion of "today". `record` writes the log entry and the customer's new `reminderCount` in **one
transaction**, so the count can never disagree with the trail — a rejected entry moves no count —
and translates a `P2002` naming `loggedOn` into the domain's `ReminderAlreadyLoggedToday`. Like every relation in the schema, this one does not cascade on
delete: a reminder that was given stays given.

`PrismaCertificateRepository` (the `CertificateRepository` port) **appends** a renewal as a new
`Certificate` row rather than editing the one on file, so the history of renewals stays readable
(FR-8); the certificate _on file_ is the latest by `recordedAt`, which is how the customer
repository's `CUSTOMER_INCLUDE` resolves it. The append and the reset of `reminderCount` to zero go
out in one transaction — a renewal that landed without its reset would show a customer still owing
what they have just brought.

### `src/infrastructure/prisma/waiting-list-repository.ts`

`PrismaWaitingListRepository` (the `WaitingListRepository` port) is the store behind the waiting list
(US-12.3). It decides nothing about the queue — `inArrivalOrder` does — and owns the two things the
pure layers cannot.

The first is the **tie-break**: rows are numbered as they are inserted, so `id` ascends with the
order applications were typed in, and two applicants added the same morning cannot swap places
between two page loads. `listWaiting` still orders by `(addedOn, id)` so a page read twice comes back
the same way and the `addedOn` index is the one the query uses, but the application sorts what it
gets back through the domain rule regardless: the query is a stable page, not the authority.

The second is **retention**. `remove` is an `update`, and no statement in the file deletes a row: a
removal stamps `removedOn` and `removalReason`, so the order of past promotions stays reconstructable
(FR-7). Its `where` names a row that is _still waiting_, so a second removal of the same entry
updates nothing rather than overwriting the first reason with a later one. `STILL_WAITING`
(`removedOn: null`) is stated once and shared by the list and the lookup, so a promotion can never
register somebody the screen had already removed; `findWaiting` therefore answers `null` for a
removed entry exactly as it does for an id that never existed. `contactNote` is `null` in SQL when
none was given and `""` in the domain — one representation of an unanswered question per layer, and
the translation is the adapter's.

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

### `src/app/kunden/` — the customer list, the registration screen and the card view

All routes share one `deps.ts`, and all follow the settings screen's wiring. What is worth knowing
beyond it:

- **`page.tsx`** is the **customer list** (US-15.3), the screen that replaces the spreadsheet: one
  dense table over `listCustomers`, sorted by customer number, computing nothing — the counts,
  portions, price, card number and certificate state all arrive derived. The filters are a plain
  **GET form**, which is what puts them in the URL (FR-5); FD share one machine, and a view has to
  survive a reload and be passable to a colleague as a link. Every parameter falls back to "not
  filtered" (a Zod `.catch(undefined)` per field) rather than refusing the page: a hand-typed `status=foo` is a
  filter nobody set, not a broken register. Status is a **single** select rather than the subset the
  use case accepts — staff filter one thing at a time, and a multi-select would be a control to learn
  instead of a question to answer. Archived households are hidden until the labelled checkbox is
  ticked, and their rows are dimmed **and** carry the word "archiviert", because shading alone is a
  distinction not every reader can make. The group balance stands **above** the filters and does not
  move with them: it is `groupCounts`, the number a new household's group is chosen by (US-01), not a
  count of the rows. An empty result names the filters in force — "keine Treffer" under a
  hidden-by-default filter is how a staff member concludes a household was deleted.
- **`neu/page.tsx`** reads a **proposal** (`proposeRegistration`) — the next free number, the
  suggested group, both group sizes, and the day birthdates are judged against. It is a proposal and
  not a reservation: nothing is held, and `registerCustomer` allocates again on submit. The partial
  unique index, not this reading, is the authority on a free slot. A full register arrives as
  `customerNumber: null` rather than as a thrown error, because the screen still has to render.
- **`neu/registration-form.tsx`** is a client component for two reasons: `useActionState`, and the
  household counts have to update **as staff type**. It does not compute them — it calls the domain
  rule (`composition`) against the day the server handed it, so the number on screen is the number
  the save derives. There is no input control for the counts by design.
  The first household row **mirrors the personal-data fields** until somebody edits it: the
  registered person _is_ a household member, and typing their name twice is how a household ends up
  with a phantom extra head. A form pre-filled from the archive (US-11.4) **never** mirrors: its rows
  are the household as the archived record listed it, and there is no promise the applicant is the
  first of them, so overwriting row one would drop a member and duplicate another. The optional
  `previousCustomerId` travels as a hidden input — absent, not blank, for a walk-in — and reaches
  `registerCustomer` as the display metadata it is.
- **`neu/registration-screen.tsx`** is the client half of the screen and holds the one piece of
  state the archive search and the form share: which archived household, if any, the form was filled
  from (US-11.4). The pre-fill is applied by **remounting the form under a new `key`** rather than by
  writing into its fields — the form holds some values in React state and others as plain
  `defaultValue`s, and a key change resets both in one move. That is also what "leer beginnen" means:
  clearing the selection mounts a blank form, with no half-filled field left over from the household
  that was dropped. Between the panel and the form it renders the banner that says, before the form
  is read at all, that a **new** number and a **new** card (`k1`) are being issued and the archived
  record stays untouched — the one mistake this feature could otherwise produce is a staff member
  believing the old record was reactivated (PRD §6).
- **`neu/archive-search-panel.tsx`** is a **sibling** of the registration form, never nested in it:
  HTML forms do not nest, and the search criteria are not part of the registration that gets saved.
  Searching is a `useActionState` form; picking a result is an ordinary button that awaits
  `loadArchivedDraft` and hands the draft upwards through `onSelect`. Each row shows the former
  customer number under a label that says _frühere_, with the sentence explaining that the number was
  freed at archiving directly beneath it — it is there for recognition and is never the number about
  to be assigned (FR-3). The archive reason is rendered `whitespace-pre-line`, verbatim, for the same
  reason the counter does: it was typed by hand and may be exactly what staff need to read.
- **`neu/archive-search-actions.ts`** holds two **reads** and writes nothing, so no audit entry is
  due. It converts the draft's `Date`s to `YYYY-MM-DD` **on the server** (`PrefillDraft`), so a
  calendar day never crosses to the browser as an instant to be re-read in the browser's own zone —
  which is how a birthdate lands on the day before. `MAX_ARCHIVE_SEARCH_RESULTS` is not re-quoted
  here: the "there are more" message is given `matches.length`, the number actually on screen.
- **`neu/actions.ts`** pairs the repeated household inputs back into rows. The three fields arrive as
  three parallel lists, so the row count is the **longest** of them — a row whose birthdate was left
  blank must reach the domain and be rejected there rather than vanishing on the way. `redirect()`
  is called **outside** the `try`: it works by throwing, and catching it would turn a successful
  registration into "could not be saved".
- **`[id]/page.tsx`** is the **customer record** (US-16.5): everything known about one household and
  everything editable about them. It renders what `readCustomer` already derived — the counts from
  the birthdates, the standard portions and price (US-07.4), the card number from the slot and the
  card index, the hand-out history and both group sizes — and reads `readCurrentSettings` beside it
  for the four per-head values the household editor derives its live figures from. A non-numeric id
  and an id nobody holds give the same German answer: there is no such customer. It shows the
  **consecutive-no-show count** only when it is greater than zero (US-10.4): a zero is one more number
  to read past on every record and says nothing a decision could rest on. "Aufgenommen" is the
  household's `registeredOn`, so a reissued card does not read as a later registration. The sections
  run in the order a record is _read_ rather than the order it is written — who this is, where they
  live, who lives with them, what they may collect, what was noted, what they have collected — and
  the **"Aktionen mit Folgen"** section comes last, holding the reissue, block and archive controls
  together behind a heading that says what they are, each with its own confirmation, so none of them
  is a stray click away from the household editor (PRD §6).
- An **archived** record renders **fully read-only** (FR-8): every form is replaced by the same
  values as text and the whole danger section is absent — there is no transition out of `ARCHIVED`,
  the household holds no slot and is issued no card — behind a banner naming the day and the reason,
  stated before anything else on the page. The `grown-ups` / `children` / `portions` / `price` boxes
  and the `household-member` rows carry the same test ids in both modes, so a spec asserting the
  derived figures does not have to know which one it is looking at.
- **Five editing forms, five use cases, five audit entries.** `[id]/actions.ts` deliberately has no
  `saveCustomer` taking every field at once (PRD §7): a merged action would write an entry naming
  every field on every save, and the log would stop saying what was decided. Each action reads its
  fields, calls one use case and translates the typed error through `recordMessage`, which delegates
  the rules about customer _data_ to the registration's own `customerErrorMessage` — so a correction
  and an intake cannot report the same broken rule differently — and adds only what an edit can hit.
  Each revalidates the record **and** `/ausgabe`, because the counter's verdict, the notes it reads
  out and the counts it prices are all derived from what was just written.
  - **`household-editor.tsx`** is a client component because the counts, portions and price must
    update _as staff type_ (FR-1): it calls `composition`, `portionsFor` and `priceFor` against the
    server's `today` and the four policy values, so what is on screen is what the save derives.
    There is no input for any of the four. The edit is a **replacement of the whole set** — rows are
    addressed by position, because two members can share a name and a birthdate and a row has no
    identity to diff on. Each row shows the member's **current age** beside their birthdate, derived
    from the date in the field, which is what makes the 13-year boundary legible (PRD §6).
  - **`details-editor.tsx`** corrects name, birthdate and address. There is no customer-number field
    and nowhere to add one — the use case and the port method take none (FR-7). The hint says out
    loud that the name also stands in the customer's own household row and travels there in the same
    write, because the other reading — that the household list must be corrected too — is the one
    that produces two people where there was one.
  - **`notes-editor.tsx`** saves the free text the counter reads, explicitly and on its own, with a
    hint saying where it turns up. Empty is a legitimate answer.
  - **`group-control.tsx`** shows **both group sizes beside the choice** (FR-4) and states the two
    consequences neither of which is visible here: the move applies to a distribution the same
    afternoon, and the card still names the old group, which puts the household on the cards-due
    list. Its radios are the one **uncontrolled** field on the record — React resets a form after its
    action resolves, and a reset restores a radio from its `checked` _attribute_ rather than the
    property React set, so a controlled radio comes back showing the group the household was in
    before the move, silently disagreeing with the sizes beside it.
  - **`renewal-form.tsx`** records a renewed certificate through the same `renewCertificate` use case
    the counter calls, in the counter's own words, so the two screens cannot describe one event
    differently. Unlike at the counter it is **always** offered rather than only while the
    certificate is expired: a household that brings the renewal early should not have to be turned
    away first for the form to appear. The confirmation names the reset, and the reminder count above
    it comes back as 0 from the revalidated record.
  - **`record-forms.tsx`** holds the field, save button and feedback line all five share; **five
    identical state unions** would be five places to change, so `record-state.ts` defines one
    `RecordFormState` for all of them. Its `saved` carries a **counter** rather than a flag, for the
    reason the registration screen counts: saving the same correction twice produces an identical
    state, and a form that only resets when a value changed would keep the previous text.
- **`block-controls.tsx`** is a client component (`useActionState`, and the save control stays
  disabled until a reason is typed — a block's reason is its only record, so an empty one must be
  impossible to submit). It shows "Sperren" with a required multi-line reason for an `ACTIVE`
  customer, the current reason plus a confirming "Sperre aufheben" for a `BLOCKED` one, and nothing
  for an `ARCHIVED` one — there is no transition out of archived. Like `archive-controls.tsx` it sits
  one level above `[id]/`, because US-16.5 offers it on the **counter** as well: US-08.4 shipped both
  controls on the record only, which left a staff member who had decided at the counter with no route
  off that screen. **`block-actions.ts`** relays a block or unblock to `blockCustomer` /
  `unblockCustomer`, translates the typed error into German, and revalidates the record **and**
  `/ausgabe`. The reason itself is shown verbatim and in full at the counter by the US-04 verdict
  banner — it is not re-derived here.
- **`[id]/reissue-controls.tsx`** is the "Karte neu ausstellen (Verlust)" control, rendered by
  **both** the record and the card view (US-09.3). It is a disclosure holding a confirmation that
  names the number being invalidated and the number about to be issued, then the button. The
  confirmation is not a guard — `reissueCard` decides whether a card may be issued — it is there
  because a reissue cannot be taken back and because the new number is what staff copy onto the
  physical card. Both numbers come off the read model; nothing is counted, compared or warned about
  in the component. **`reissueCardAction`** (in `[id]/actions.ts`) fixes the reason to `LOST` rather
  than reading it off the form: this control is the _loss_ control, and that is what makes the loss
  count mean what it says. It revalidates the record **and** the card view, so whichever screen the
  reissue was started from shows the new number and the other one does too when next opened.
- **`archive-controls.tsx`** is the "Archivieren" control (US-10.4), and it sits one level above
  `[id]/` because it is rendered by **both** the customer record and the **counter** — archiving has to
  be reachable where staff meet the household who has stopped coming (FR-2), and one component means it
  cannot come to mean two different things depending on where it was started. It is a **closed
  disclosure with the confirmation inside it**, never a dialog and never a prompt: at the counter the
  queue is waiting, and an archive suggestion that had to be dismissed before the next customer could be
  served would be worse than none (PRD §6). The confirmation names the customer number and states the
  two things staff would otherwise learn from a support call — the number is freed at once and may be
  reassigned, and the record is kept in full. The save control stays disabled until a non-whitespace
  reason is typed; the reason is the whole record of an irreversible decision. **`archive-actions.ts`**
  relays it to `archiveCustomer`, maps `MissingAuditReason` and `IllegalStatusTransition` to German,
  and revalidates the record **and** `/ausgabe`, so the counter's next lookup of that number answers
  `ARCHIVED`.
- **`[id]/karte/page.tsx`** is the **digital customer card** (US-02.4): the number, the name, the
  group as a coloured German label, the two counts and the standard portions and price (US-07.4),
  set large enough to read across a desk, plus the numbers this card replaced and why each was
  issued. It is a screen, not a document — FD prints through a system they already own, so there is
  deliberately **no print stylesheet and no PDF**. The counts, portions and price come from
  `readCard`, derived per request (`dynamic = "force-dynamic"`), so a birthday can never leave a
  stale number on screen. Both screens state the portions and price are the **standard** values,
  with no control to adjust them — counter-side adjustments are out of scope. Below the card it
  shows **"Ausgestellte Karten"** (US-09.3): the number of cards the household has been through and,
  beside it and separately, how many of those replaced a lost one — a card replaced because a
  birthday overtook the printed counts (US-13) is not a loss, and one number would count the
  software's own reissue against the household. Nothing on the screen reacts to either figure: no
  threshold, no colour that changes, no sentence that appears at a high count. Whether a number means
  anything is FD's judgement (§FR-4).

⚠️ **Dates cross the form boundary as UTC calendar days.** `<input type="date">` submits `YYYY-MM-DD`
and the adapter pins it to `T00:00:00.000Z`, because the domain compares birthdates as UTC calendar
days — parsing it in local time would land a date typed in Germany on the day before.

⚠️ **German error text for a rejected customer field** comes from `customerFieldLabel()` in
`src/i18n/de.ts`, which reads `de.customers.errorFields` and expands the domain's indexed household
fields (`householdMembers.1.firstName`) into "Haushaltsmitglied 2: Vorname". Rows count from 1 on
screen and from 0 in the domain.

⚠️ **`eslint` forbids constructing JSX inside a `try`** (`react-hooks/error-boundaries`): React
renders the component after the function has returned, so the `catch` would never fire. Await the
read into a variable inside the `try` and build the JSX after it.

### `src/app/ausgabe/` — the distribution screen and the counter

The screen that answers the question the counter asks first — which group collects (US-03.4) — and
then the question it asks about every person in the queue: may _this_ one collect (US-04.4).

- **`deps.ts`** holds two composition roots. `distributionDeps` — the page's — carries
  `CustomerRepository`, `SettingsRepository`, the **reading** sides of `DistributionRecordRepository`
  (for the hand-out already made today, shown beside the serve action) and `ReminderLogRepository`
  (for whether today's reminder is already logged, so the button stays disabled) and `Clock`, and
  deliberately **no audit log**: everything the page renders is a read (US-04, FR-4).
  `counterActionDeps` — the server actions' — adds the audit log, the certificate history and the
  writable stores, and is the one object here that writes.
- **`page.tsx`** calls `getWeekColour` once for today and, when a date was submitted, once more for
  that day. Both questions are the same use case; the page arranges the answers and decides nothing.
- The **banner** is the dominant element and is painted in the colour it _names_ — on a day without a
  distribution that is the **next** distribution's colour, which need not be the current week's. The
  colour is always written out in words ("Gruppe Rot") as well as painted: several staff share one
  screen in variable lighting, so colour alone is never the message.
- The **lookup** is a plain `method="get"` form, so the looked-up day lands in `?datum=` and a colour
  someone has checked can be reloaded or passed on as a URL. It needs no client component.
- A lookup fails **on its own**: an unreadable date, or a day before FD had any settings, renders a
  German sentence beside the form and leaves today's banner standing. "Unreadable" includes a day
  the calendar does not have (`?datum=2026-13-45`): the Zod schema checks the shape _and_ that the
  parsed date is a date, because an Invalid Date's NaN survives the calendar arithmetic silently and
  would be rendered as a week `NaN-WNaN` in a confidently-named colour.

#### The counter lookup (`counter-lookup.tsx`)

- The typed number lands in `?nummer=` through a second `method="get"` form, for the same reason the
  week lookup uses one — and for one more: a form navigation brings the input back **empty and
  autofocused**, which is the whole keyboard loop the counter needs (type, Enter, read, type again).
  No client component, no state to reset.
- **`statementFor(verdict)`** is the only place a verdict becomes words. Its `switch` ends in a
  `const unhandled: never = verdict`, so adding a case to the union is a _compile error_ until the
  counter renders it — a new verdict can never appear as a blank banner.
- Each verdict carries an icon, a headline and a full German sentence naming the action; the banner's
  colour only repeats what the words already say. Wrong group names **both** colours, and the
  inflected forms ("blaue Kundin / blauer Kunde", "rote Woche") are dictionary data keyed by the
  colour, not sentences assembled in the component.
- An **expired certificate is amber, not red**: the verdict is still serve — the reminder is a
  conversation, never grounds to refuse food. The reminder count stands beside it in the household
  details and inside the verdict sentence itself (US-06, US-10.4), because it is what makes the
  archiving question askable at the counter at all.
- The **consecutive-no-show count** appears in the household details when it is greater than zero
  (US-10.4), and the **archive control** last on the screen, below the serve action — an ordinary
  collapsed disclosure like every other control here. Neither reacts to any threshold: the two
  archiving triggers are made visible and the decision stays human (US-10, FR-1, PRD §5).
- The detail line is `whitespace-pre-line`. Every verdict but one is a single dictionary sentence,
  which renders the same either way; the exception is the **block reason** (US-08), typed by hand
  into a multi-line field and shown verbatim, so the paragraphs a colleague wrote have to survive to
  the counter rather than collapse into one run-on line. The e2e asserts the rule itself, because
  Playwright's `toHaveText` normalises whitespace and cannot see the difference.
- Everything below the banner is on screen at once (FR-2). All of it is derived by `lookupCustomer`:
  the counts from the birthdates, portions and price from the settings in force today.
- A number that is **not a number** (`?nummer=abc`) renders a German sentence beside the form; an
  unassigned one renders the `NOT_FOUND` banner, because that is an answer rather than a failure.
- Below the details the counter offers a **link to the whole record** (`/kunden/[id]`) and, since
  US-16.5, the **block controls** beside the archive ones — the reasons for both turn up here, in
  front of the person they concern, and everything the counter shows is a slice of the record it now
  links to. `lookupCustomer` therefore carries `blockReason` as well: the verdict states it too, but
  the unblock confirmation quotes the reason being lifted, and a control reading it off the verdict
  union would be a second account of which field the reason lives in. Both controls are keyed by
  customer, like the certificate controls, so nothing typed about one household survives into the
  next lookup.

#### Recording the hand-out (`serve-controls.tsx`, `actions.ts`)

- `lookupCustomer` now reads today's record in the same pass as the verdict (US-04.3), so the page
  hands `ServeControls` the surrogate id, whether the verdict permits serving, and today's record if
  one exists. Which control it shows is a fact of the day, not a click: **no record → the serve
  action**, **a record → that record with the controls to correct or remove it**.
- **`serve-controls.tsx`** is a client component for exactly two browser needs: `useActionState`
  reports a rejection beside the button, and after a successful hand-out an effect **clears and
  re-focuses** the number field (reached by `id="counter-input"`) so the queue keeps moving without
  the mouse. The **paid** checkbox is pre-checked and read by the action as mere presence, the HTML
  idiom for a boolean an unchecked box omits.
- Recording revalidates `/ausgabe`, so the just-served customer immediately shows the already-served
  message with the record's time, a green confirmation, and the correction control — the same view a
  second lookup of that number would produce.
- **Removal has a confirmation step**: a native `<details>` reveals the warning and the one button
  that deletes, so no single click drops a record. Correcting is the only mutation of the history
  besides recording; both go through the use cases, which own the once-per-day and same-day-only
  rules — the hidden serve button is a courtesy, not the guard (FR-8).

#### The certificate reminder and renewal (`certificate-controls.tsx`, `actions.ts`)

- On the expired-certificate verdict the amber banner already states the fact; below it,
  `CertificateControls` offers the two writes US-06.4 adds: **"Erinnerung erfassen"**, which logs
  today's reminder and confirms the resulting count, and the **renewal form** (type + end date),
  which appends the certificate and resets the count to 0 in one transaction behind
  `renewCertificate`.
- `lookupCustomer` reads whether today's reminder is already on file (`reminderLoggedToday`) in the
  same pass as the verdict, so after a log — or a fresh lookup any time later that day — the button
  is **disabled with an explanatory label** ("Erinnerung heute bereits erfasst"). The disabled state
  comes from the store, not from client memory; the once-per-day rule itself lives in
  `recordReminder` and, as the race-proof backstop, in the database's unique `(customerId, loggedOn)`
  constraint (FR-5).
- Both actions revalidate `/ausgabe`, so the count beside the expiry status, the certificate's new
  end date and the verdict all come back from the store. The component is **keyed by customer id** in
  the page, so a confirmation from one lookup cannot survive into the next customer's screen — while
  within one customer it stays mounted across the revalidation, which is what keeps the renewal
  confirmation ("… zurückgesetzt: 0.") visible once the verdict has turned green again.
- The screen states facts and offers actions — it never advises what a count should mean, prompts an
  archive or applies a threshold, because that judgement is deliberately the staff's (FR-6, FR-7).

#### The stale-card note

`lookupCustomer` compares what the card the household holds prints — the counts (`countsOnCard`, the
snapshot from US-13.3) and the group (`groupOnCard`, US-16.4) — with what it has just derived, and
reports `staleCard`: `AGE_13`, `HOUSEHOLD_CHANGE`, `GROUP_CHANGE` or `null`. A group difference gets a
sentence of its own in the dictionary (`staleCardGroup`), because quoting two identical counts at the
counter would read as a mistake. The counter renders it as the **smallest, quietest thing on the
screen**: one grey line under the household's data, no border, no icon, no colour. It is neither a
verdict nor a warning — `evaluateAtCounter` never sees the field, so nothing about serving changes,
and the serve button stands exactly where it did. A stale card is never grounds to turn anyone away
(US-13, FR-5), and a note that looked like a refusal is precisely the failure mode this feature has
to avoid.

### `src/app/karten-neuausstellung/` — the cards-due-for-reissue screen

The to-do list of cards a birthday (or a household change) has overtaken, US-13.4. `page.tsx` calls
`listCardsDueForReissue` and lays each entry out: name, customer number, card number, the counts
**printed on the card** beside the counts the household **is today**, and the difference stated in
words ("13. Geburtstag"). It is `force-dynamic`, because the list changes at midnight with nothing
written.

The tone is the feature, not decoration on it. "Das hat keine Eile … Eine veraltete Karte ist nie ein
Grund, jemanden an der Ausgabe wegzuschicken" stands **above** the list, so it is read before the
first row rather than after the last; nothing is coloured as a warning, nothing is counted as
overdue, and no row asks to be dealt with before another. Anything that looked urgent would train
staff to ignore the list — or, far worse, to turn a household away over it (PRD §6, FR-5).

- **`stale-card-controls.tsx`** is a closed disclosure with the confirmation inside it, like the
  reissue control on the customer record, and it names **both** card numbers before writing: the new
  one is what staff copy onto the physical card. It has to be named _before_ the write, because a
  successful reissue removes the row — and the message with it.
- **`actions.ts`** hands to `reissueCard` with the reason **fixed** to `STALE_COUNTS`, never read off
  the form. It is the same card path as every other issue (`issueCard`); only the recorded reason
  differs, and that reason is what keeps the loss count on the card view readable. On success it
  revalidates this list, the household's record and card view, and `/` — whose badge counts this very
  list.
- The home screen's badge (`countCardsDueForReissue`) is shown at zero too and in the same grey as
  everything around it: "nothing to do" is the answer staff most often want from it, and a home
  screen that looks alarmed about outdated cards is how the list stops being read.

### `src/app/warteliste/` — the waiting list

US-12.4, the screen the whole feature is for. `page.tsx` calls `listWaiting` and `proposeRegistration`
and lays out three things: the free-slot banner, the applicants in arrival order, and the form that
puts somebody on the list. It is `force-dynamic` — a wait grows a day at midnight and a certificate
lapses the same way, with nothing written either time.

**The order is the feature, so the screen gives it nothing to argue with.** The rule is stated in
words above the list; there are no column headings that could be clicked, no way to move a row, and
"Jetzt registrieren" appears on the banner only, never on a row. A sortable list invites the exact
unfairness the strict ordering exists to prevent (PRD §6). The head of the list is read off position 1
rather than by asking `nextInLine` a second time — one statement of the order, so the banner and the
list cannot name two different applicants.

- **`free-slot-banner.tsx`** names **one** applicant and **one** number, and it is rendered on the
  home screen as well (`showListLink`). Without it a freed customer number is only noticed by whoever
  thinks to open the list, and the applicant who has waited longest waits on — which is the whole of
  FR-4. An expired certificate is repeated on the banner, because whoever acts on it needs to know a
  renewed notice will be wanted **before** they walk over to the applicant.
- **`add-applicant-form.tsx`** collects exactly what an entry records — no household, no group, no
  number, because none of those is decided until the applicant is actually registered. It clears
  itself after a save by remounting its fields on `state.savedCount`, a count the action keeps: two
  applicants with the same name would otherwise produce an identical state, and a form that resets on
  a value that did not change is a form that keeps the previous applicant's address.
- **`remove-applicant-controls.tsx`** is a closed disclosure with the confirmation inside it and the
  save disabled until a reason is typed, like the archive control. What the confirmation says is the
  thing staff would otherwise ring up about: the entry is **kept**, not deleted (FR-7).
- **`actions.ts`** reports an already-lapsed certificate as its own German sentence naming the day it
  ran out. It is the one rejection staff meet with the applicant standing in front of them, and
  "bitte prüfen" would not tell them what to ask for. Both actions revalidate `/warteliste` and `/`,
  because the home screen's banner names whoever is at the head.

#### `warteliste/[entryId]/registrieren/` — the promotion

`page.tsx` calls `promoteFromWaitingList`, which is a **read**: the applicant stays on the list until
the form is actually saved. A registration can fail on its last field, and somebody removed a moment
earlier would have lost the place they waited months for. `WaitingListEntryNotFound` is a stale link
(`notFound()`); `NoFreeCustomerNumber` means the register filled up between the banner and the click,
and the page says so and sends staff back — nothing was written and the applicant keeps their place.

The form is `kunden/neu`'s `RegistrationForm`, given a `submit` prop and a hidden `entryId`. Its
parsing is shared through `kunden/neu/registration-input.ts`: one Zod schema, one household pairing,
one German error mapping, so a field cannot start being accepted on one screen and refused on the
other. The action calls **one** use case, `registerFromWaitingList` — never `registerCustomer` plus a
removal of its own, because the order of those two is the guarantee the feature rests on and
"remember to do B after A" is exactly what a screen forgets.

- **`promotion-screen.tsx`** holds the one piece of judgement the screen has: when the certificate
  lapsed during the wait, the warning is shown **before** the form, naming the day it ran to (FR-5).
  It is a step, not a dialog — nothing is dismissed and the applicant is never refused, because FD has
  not decided how such a case is settled (PRD §9). With a valid certificate there is nothing to warn
  about and the form is simply there.
- A **full register** on `/kunden/neu` now offers the way onto the waiting list beside its "alle
  Nummern sind vergeben" message. That message was otherwise a dead end, and turning an applicant away
  is precisely what the list exists to prevent.

### `src/i18n/de.ts`

A single `const de = {…} as const` dictionary of German UI strings, plus the derived `Dictionary`
type. All user-facing text lives here; **code identifiers stay English**. `layout.tsx` and
`page.tsx` read from it, so there are no hard-coded strings in components.

### `src/i18n/format.ts`

The shapes values are written in for German-speaking staff, beside the dictionary that holds the
words. `germanDate(date)` writes `TT.MM.JJJJ` and reads the date **in UTC**, because dates here are
calendar days stored at midnight UTC — formatting in the server's zone would show the day before for
anyone west of Greenwich. It lives here rather than in a page because it was copied into two of
them, and two copies is how two screens start rendering the same date two ways. `germanTime(instant)`
writes `HH:MM` and reads the instant **in Europe/Berlin**: a hand-out is a moment, not a day, so its
time must read as the wall clock staff saw — the same zone `berlinDayKey` counts the day in, so
"served at 23:59" and "already served today" cannot disagree about the day.

---

## 5. Data & persistence

### Prisma + SQLite

- `prisma/schema.prisma` declares a `sqlite` datasource whose URL comes from `env("DATABASE_URL")`
  and a `prisma-client-js` generator (client generated to the default `node_modules/@prisma/client`).
- `SettingsVersion` holds the append-only policy values. Its `recordedAt` is the indexed,
  machine-stamped instant the values took over — deliberately not unique, because two saves in the
  same millisecond are a concurrency accident, not a business error. It carries
  `pricePerGrownUpCents` / `pricePerChildCents` rather than a per-household price table: what a
  household owes is derived, never stored.
- `Customer`, `HouseholdMember`, `Certificate` and `Card` are the register (US-01).
  `Customer.id` is a surrogate autoincrement key and **the only identity there is**; every foreign
  key targets it and never `customerNumber`, which is a reusable _slot_. There is deliberately **no
  `grownUps` and no `children` column** — both are derived from the household's birthdates, and
  stored they would drift with every birthday, which is exactly what the Excel sheet did.
  `Card` is unique on `(customerId, index)`; the card number staff read out is derived from the
  customer number and the index, never stored. Its `grownUpsAtIssue` / `childrenAtIssue` are the
  system's **only stored counts** and, with `groupAtIssue` beside them, the one deliberate
  denormalisation in the model: a snapshot of what was _printed_ on that piece of card, kept because
  the physical card is a real artefact whose numbers a 13th birthday overtakes and whose group a move
  between RED and BLUE invalidates (US-16.4), and the cards-due-for-reissue list (US-13) needs
  something to compare today's derivation against. All three are written once, never updated. `Certificate` rows are **appended, never
  overwritten** (US-06.3): a renewal stacks a new row stamped `recordedAt`, the certificate on file
  is the latest by that instant, and the trail behind it says when each renewal was brought.
  `Customer.firstNameFolded` / `lastNameFolded` are the archive search's keys (US-11.1): the names as
  `foldName` compares them, written beside the names they come from and indexed with `birthDate`,
  because SQLite can fold neither umlauts nor Unicode case in a `WHERE` clause. They are a search key
  and never a name — nothing displays them — and they are non-nullable with no default so that every
  writer, including an edit of a name (US-16.2, `updateDetails`), has to state them.
  `Customer.previousCustomerId` is a nullable **self-reference** to the archived record a
  registration was pre-filled from (US-11.3) — display metadata no rule reads, never a merge. Like
  every other relation it is `onDelete: Restrict`; note that Prisma's default for an _optional_
  relation is `SetNull`, so the action has to be spelled out, and `schema.test.ts` checks the
  generated SQL for `ON DELETE SET NULL` as well as for cascades.
- `ReminderLog` is the documented trail an expired certificate starts at the counter (US-06). One
  row per reminder, keyed by the Berlin day `loggedOn` (`YYYY-MM-DD`, written by the domain's
  `berlinDayKey` like `DistributionRecord.dayKey`); the unique `(customerId, loggedOn)` index is
  the database's own cap of one reminder per customer per day, surfaced by the adapter as
  `ReminderAlreadyLoggedToday`. `resultingCount` repeats the customer's count as it stood after the
  entry, so the trail reads on its own; a renewal resets the _count_, never this log.
- `WaitingListEntry` is one applicant the quota has no slot for (US-12). It has **no relation to
  `Customer` at all** and holds no `customerNumber`, no group and no card — the list is precisely the
  people who occupy nothing — and it flattens the address and the single admitting certificate onto
  the row, because nothing renews on a waiting list. Rows are **retained, never deleted** (FR-7):
  `removedOn` / `removalReason` say whether the applicant was registered or withdrew, and the active
  list is every row with `removedOn IS NULL`. There is deliberately **no `position` column** — the
  place in the queue is `addedOn` (indexed), ties broken by the ascending `id`, derived by
  `src/domain/customer/waitingList.ts`; a stored position is a position somebody can edit, which is
  the fairness the list exists to protect.
- `DistributionRecord` is the append-many history of hand-outs (US-05). It carries `date`, a
  normalised Europe/Berlin `dayKey` (`YYYY-MM-DD`, written by the domain's `berlinDayKey`), the
  `showedUp` and `paid` flags and `priceCents`. The unique `(customerId, dayKey)` index is the
  database's own enforcement of once-per-day: a second hand-out on the same Berlin day cannot be
  written even if two requests race past `attendance.canRecord`, and the adapter surfaces the lost
  race as `AlreadyServedToday`. Indexes on `date` and `(customerId, date)` serve the no-show query
  (US-10). `priceCents` is deliberate redundancy alongside the settings history — it makes a record
  self-describing — and like every relation in the schema it does not cascade, so records outlive a
  customer's status changes and are never removed by archiving.
- **Nothing cascades on delete.** No relation in the schema carries `onDelete: Cascade`, so every
  foreign key is `ON DELETE RESTRICT` and SQLite _refuses_ to remove a customer who still owns
  household members, a certificate, a card, a distribution record or a reminder log (US-10.3). The
  only way out of the register is archiving, a status change. A cascade would be harmless for as
  long as nothing ever called `delete` — which is why it is the wrong thing to leave in place: the
  day a clean-up script or a mistyped test did call it, the household's history would go with it
  silently, and the audit log has no way to say what was lost. `src/infrastructure/prisma/schema.test.ts`
  guards the rule against the schema _and_ the committed migration SQL; the customer repository
  specs prove the refusal against a real database. The cost is that a test tearing the register down
  must delete children first — `clearRegister` in `src/infrastructure/prisma/test-support.ts` states
  that order once, and clears `previousCustomerId` before the customers themselves, since a
  re-registered household restricts the delete of the archived record it points at just as a card
  does.
- **The slot rule is a partial unique index**, hand-written at the end of the `init` migration
  because Prisma cannot express one: at most one non-archived customer may hold a given
  `customerNumber`, so any number of archived rows may share one. See
  `src/infrastructure/prisma/customer-repository.ts` above — regenerating the migration drops it.
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

This is consistent across `.env`, the Playwright web-server envs, and the CI job envs (which use
`../data/ci.db`, `../data/e2e.db` and `../data/e2e-isolated.db`). The `data/` directory is tracked via `.gitkeep`; the `*.db`
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
- **Two projects, two servers.** `chromium` drives port 3000 over the shared `data/e2e.db`, which
  is where all but one spec belongs. `isolated` drives port 3001 over `data/e2e-isolated.db`, its
  own freshly seeded and empty database, and matches only the specs listed in `ISOLATED_SPECS`.
  A spec joins the isolated project when it must **own the register** — decide the quota, or fill
  every slot. `waiting-list.spec.ts` is the case that forced it: the quota is a single global
  number, the shared database holds customers on numbers in the hundreds, and so "no slot is free"
  is unreachable there at any price short of hundreds of rows. Everything else stays on the shared
  server, because a second Next process costs the whole run and a spec that merely writes does not
  need one.
- **`workers: 1`, `fullyParallel: false`.** Every spec in a project shares one `*.db`, and several
  of them write to it — a registration consumes a customer number, a settings save appends a
  version. Two workers would interleave those writes and each spec would assert against a register
  the other one had moved. The suite runs in a few seconds; a flaky gate is worth less than a slow
  one. The consequence for a new spec on the shared server: **never name a customer number the
  allocator will hand out** — read the one the screen proposes, or inserting a spec file
  alphabetically above another one breaks it. A spec that inserts its own rows instead of
  registering them (`counter.spec.ts`) may name numbers, provided it takes a block high in the
  range: allocation is always the _lowest_ free slot, so the low sequence the other specs assert
  against stays untouched.
- `webServer` is an array of two, built by one function. Each **deletes its own database and
  pinned-now file**, then runs `npx prisma migrate deploy && npm run db:seed && npm run start --
--port <n>` over it, mirroring the CI `e2e-tests` job. `reuseExistingServer` is on locally, off in
  CI. The delete matters locally: the settings specs edit the seeded price and then assert the value
  they wrote, so a second run against its own leftovers would start from the wrong number. The two
  servers have **separate** `FD_FIXED_NOW_FILE`s, so a spec that pins the clock cannot move the
  other server's calendar underneath a spec that did not ask for it.
- Today: a smoke test asserting the German `<h1>` renders, plus `settings.spec.ts` — the settings
  round-trip (change a price, save, reload, see it applied and listed in the
  history), a second save on the same day — the behaviour the screen exists for, and once an error —
  and a rejected save that must leave the stored value untouched. Those specs run
  **serially** against the one shared database, each building on the price the previous one saved.
- `registration.spec.ts` covers US-01 end to end: a two-person household is registered from
  `/kunden/neu` (proposed number, the mirrored first household row, the counts updating live to
  1 grown-up / 1 child), lands on its overview (`<n>k1`, status _aktiv_, both members listed), and
  an empty household is refused in German while consuming no customer number. It is **serial** too,
  and the rejection asserts against the successor of the number the happy path consumed rather than
  against a literal. Names and addresses come from Faker with a fixed seed; every date is a literal,
  because the rules under test are about dates.
- `card.spec.ts` covers US-02 end to end (§US-02.5): a three-person household is registered, the
  overview's card link is followed to `/kunden/[id]/karte`, and the card is asserted to match
  `^[0-9]+k1$` — the number the form proposed plus `k1` — with the name and group as entered, the
  counts derived again on that request (2 grown-ups / 1 child) and no superseded numbers. It is the
  only proof that the number the form proposed, the card the registration transaction wrote and the
  card the view renders are the same card.
- `distribution.spec.ts` covers US-03 end to end (§US-03.5). The banner is a pure function of the
  calendar, so the spec first decides what day the app thinks it is: it writes an ISO instant to
  `data/e2e-now.txt`, the file `FD_FIXED_NOW_FILE` points `systemClock` at (see
  `src/infrastructure/clock.ts`). Against the seeded anchor `2026-W02` = RED and Thursday
  distributions it asserts the banner on a RED distribution day (08.01.2026), on the BLUE one a week
  later, and on the Tuesday between them — where the banner must state the _next_ distribution and
  its colour — then looks up a week two years out (20.07.2028, `2028-W29`, RED) through the date
  control. It is **serial**, writes nothing to the database, and deletes the pinned-now file in
  `afterAll`: a frozen today would otherwise reach the settings specs, which stamp a version with
  the clock. The `webServer` command deletes that file too, so an aborted run cannot poison the next
  one.
- `counter.spec.ts` covers US-04 end to end (§US-04.5): every verdict the counter can hand down,
  asserted as the **German sentence** a staff member reads rather than as a `data-verdict` alone —
  clear to serve, an expired certificate, the wrong group, a superseded card, blocked, archived and
  a number nobody holds. It pins today to the RED distribution Thursday 08.01.2026, which is what
  makes a RED household clear and a BLUE one sent away, and deletes the pinned-now file in
  `afterAll` like the distribution spec.
  Its six households are inserted **straight through Prisma**, not through the registration form:
  archiving (US-10) has no screen yet, so there is no other way to reach some of these states, and
  the blocked and reissued ones are seeded the same way to keep the fixture self-contained even
  though both now have a record screen (US-08's `blockCustomerAction` and US-09's
  `reissueCardAction` on `/kunden/[id]`). That
  is also why it may name customer numbers — see the note above.
  The second half of the spec is FR-4, that a lookup only ever _reads_. It snapshots the statuses,
  the reminder counts and the card and audit-entry counts, performs the two refusals staff hit most
  often plus one successful lookup, and asserts the snapshot is unchanged. There is no distribution
  table yet — serving arrives with US-05 — so the snapshot pins every row a lookup could touch
  today and should widen with the schema.
  `ALREADY_SERVED_TODAY` is the one verdict it cannot cover: nothing can serve a household yet, so
  nothing can serve one twice.
- `portions.spec.ts` covers US-07 end to end (§US-07.5): that the portions and the price on the
  customer record are **derived on the request**, never a stored column. It seeds a two-grown-up,
  one-child household through Prisma (5 Portionen, 5,00 € against the seeded settings), reads both
  off `/kunden/[id]`, adds a second child straight in the database, and reloads to 6 Portionen and
  6,00 €. The member is added through Prisma rather than the UI because editing a household (US-16)
  has no screen yet; the reload deriving a new value is the proof the criterion asks for.
- `serve.spec.ts` covers US-05 end to end (§US-05.5): the distribution-day counter loop against a
  real database. Pinned to the RED Thursday 08.01.2026, it looks up a RED household, presses
  **Ausgabe erfassen** with the pre-checked _Bezahlt_ box, and asserts the German confirmation naming
  the Berlin time (10:00 Uhr) while the serve action gives way to today's record — then reads the row
  straight from Prisma to confirm one record, `paid = true`, the Berlin `dayKey`. A second lookup of
  the same number finds the serve button gone and _Heute bereits versorgt_ in its place, with the
  database still holding exactly one row (the duplicate is refused, not stacked). A second household
  served with the box **cleared** stores `paid = false`. Its two households (customer numbers 221–222)
  are inserted straight through Prisma and it deletes the pinned-now file in `afterAll`, as the
  distribution and counter specs do. This is the `ALREADY_SERVED_TODAY` case the counter spec noted
  it could not yet reach.
- `reminders.spec.ts` covers US-06 end to end (§US-06.5): the reminder trail across three
  consecutive RED distribution days (08.01., 22.01., 05.02.2026 — every second Thursday, because the
  one in between is BLUE). On each pinned day one household with a lapsed certificate is served as
  normal and one reminder is logged; the spec asserts the count climbs 1 → 2 → 3 on the screen and
  in `ReminderLog`, that a same-day second attempt is refused _by the server_ (it submits the form
  underneath the disabled button — the stale-second-tab race the button cannot prevent) and writes
  nothing, that a count of 3 leaves the household `ACTIVE` with the same serve-and-remind verdict —
  archiving is US-10's staff decision — and that recording the renewal resets the displayed and
  stored count to 0, appends the certificate rather than overwriting it, and keeps all three log
  entries. Its household (customer number 231) is inserted straight through Prisma and the
  pinned-now file goes in `afterAll`, as in the neighbouring specs.
- `reissue.spec.ts` covers US-09 end to end (§US-09.4): one household (customer number 251) followed
  from a lost card to a working one. It reissues from `/kunden/[id]`, asserting the confirmation
  names both the number being invalidated and the number about to be issued, then reads `251k2` off
  the card view with `251k1` listed as replaced and the counts at 2 / 1. Presenting `251k1` at the
  counter gives the German `OUTDATED_CARD` sentence naming both numbers and no serve action;
  presenting `251k2` is clear to serve on the same day — which is the point the unit gates cannot
  reach, because the write and the two verdicts live on three different screens. Two further
  reissues driven from the **card view** (the same `ReissueControls`) take the loss count to 3 with
  nothing standing in the way, and the reissue control still on offer — FR-4 is asserted as the
  absence of a warning, not as a threshold. The FR-3 half mirrors the counter spec's: the refused
  lookup is bracketed by a Prisma snapshot of the household's status, cards, distribution records and
  the audit-entry count, so a refusal that blocked, archived or recorded anything would fail. Pinned
  to the RED Thursday 08.01.2026 and deletes the pinned-now file in `afterAll`, like its neighbours.
- `archive.spec.ts` covers US-10 end to end (§US-10.5): the slot-reuse mechanic, which is the one
  claim about archiving no unit gate can reach — it spans two customers, three screens and the
  allocator in between. It is the only spec here that **registers its household through the form**
  rather than inserting it, because the freed number is only interesting if the allocator handed it
  out: it registers a RED household, serves them on the pinned RED Thursday 08.01.2026 (the hand-out
  is what the archive must keep), archives them from the record with a multi-line reason, and then
  asserts that `/kunden/neu` proposes their number again and the next registration is given it. The
  archived household is refused at the counter (`ARCHIVED`, no serve action, nothing left to
  archive), and once the number has moved on the counter answers its **new** holder while the old
  record is still reachable by its surrogate id — the only find path until the customer search of
  US-15 exists. FR-1 is asserted twice over: the save control stays disabled for an empty and a
  whitespace-only reason, and then that courtesy is stepped around by blanking the field in the DOM
  without telling React, so the rule in `transition()` has to answer for itself with the German
  `missingReason` sentence. Both refusals are bracketed by Prisma snapshots — the household's own
  state plus the audit-entry count, and everything it owns — and the same "belongings" snapshot is
  compared either side of the successful archive, which is how "nothing is deleted" is proved rather
  than asserted field by field.
- `reregistration.spec.ts` covers US-11 end to end (§US-11.5): a household that was archived
  coming back, which is the one claim about re-registration no unit gate can reach — it spans two
  customer records, three screens and the allocator in between. Like `archive.spec.ts` it **registers
  through the form** rather than inserting rows, because the number moving on is only observable if
  the allocator handed it out. It registers a RED household, serves them on the pinned RED Thursday
  08.01.2026 (that hand-out is the history the archived record has to keep once the same people hold
  a second record) and archives them with a reason — then deliberately arranges the awkward case:
  **the next registration is given the number they gave up**, under the same surname and still
  active. A re-registration that quietly restored the old number would pass a friendlier fixture and
  collide here. The archive search, typed in capitals so the folded key rather than the stored name
  decides the match, then finds the archived household and _not_ the active namesake (FR-6); the
  selection pre-fills personal data, address and both household rows with the counts derived again,
  carries no certificate and no former number into the proposal, survives an edit, and can be dropped
  back to a blank form. Registering from the pre-fill lands on a **new** record with a new number,
  `k1`, reminder count 0, no distribution history and `previousCustomerId` pointing at the
  predecessor — read from Prisma, because it is display metadata no screen shows. FR-5 is one
  equality: the predecessor's whole belongings snapshot (status, number, household, certificate,
  cards and hand-outs) is taken before the re-registration reads it and compared afterwards. Pinned-now
  file deleted in `afterAll`, like its neighbours.
- `age-13.spec.ts` covers US-13 end to end (§US-13.5): that the reclassification at 13 is
  **automatic**. One household (customer number 271) is seeded with a grown-up and a child born
  15.01.2013, and a card printed `1 / 1` — true on the day it was issued. The spec pins today to the
  RED Thursday 08.01.2026, reads 1 Erwachsener, 1 Kind, 3 Portionen and 3,00 € off `/kunden/[id]`,
  then moves the pinned-now file to the RED Thursday 22.01.2026 and reloads **the same screen**: 2,
  0, 4 Portionen, 4,00 €. Nothing happened in between, and that is the claim — so the household's
  row, members, cards, distribution records and the audit-entry count are snapshotted either side of
  the clock change and compared, which fails if any of those four figures came from a write rather
  than a derivation. The second half is FR-5: the household now appears on `/karten-neuausstellung`
  with both count sets and _13. Geburtstag_, and the home badge counts one more — but presenting the
  outdated `271k1` at the counter is still `CLEAR_TO_SERVE`, with the grey note beside the serve
  button rather than instead of it. A reissue from the list hands out `271k2`, after which the row is
  gone, the badge is back where it started and the counter has no note left to make. The badge is
  only ever compared **with itself** (before + 1, then back), because it counts the whole shared
  register and the neighbouring specs may leave households on the list; the row itself is addressed
  by `data-customer-number` for the same reason. Pinned-now file deleted in `afterAll`, like its
  neighbours.
- `waiting-list.spec.ts` covers US-12 end to end (§US-12.5), and is the one spec in the **isolated
  project** — it is the only one that makes the register _full_, which nothing sharing a register
  can do. On its own empty database it lowers the quota to **2** on `/einstellungen`, registers two
  households through the ordinary form (numbers 1 and 2), and then meets `/kunden/neu` with nothing
  left to give: no proposed number, the limit named, and the way onto the waiting list offered as a
  **link** rather than a redirect — the form stays on screen, because the quota may be what should
  change. Two applicants are added through the list's own form and asserted in arrival order with no
  banner above them, because nothing is free. Archiving the first household frees number 1, and the
  banner then names the applicant who joined first — on `/warteliste` **and** on the home screen
  (PRD §6). Promoting them from the banner opens the registration form pre-filled from the entry
  (surname, certificate, a one-person household deriving 1 / 0), and saving it hands them exactly the
  number the archived household released, with `1k1` on the card. The entry is then read straight
  from Prisma: still there, both rows still counted, `removedOn` stamped and `removalReason` reading
  `customerNumber=1` — off the list without being deleted from it (FR-7). The last spec asserts the
  second applicant has moved up to position 1 with the register full again and no banner promising a
  slot that does not exist.
- `customer-list.spec.ts` covers US-15 end to end (§US-15.4): the screen that replaces the
  spreadsheet. Five households are **seeded through Prisma** on numbers 281–285 — both groups, all
  three statuses and all three certificate states — because what is under test is a _spread_, and
  registering five households through the form would prove US-01 again at five times the cost. The
  active RED household and the archived one deliberately share an invented surname
  (`Müllerhoff`), so the archived toggle is the only thing that can tell them apart: a name search
  that excluded the archived row for any other reason would pass a weaker fixture. The spec asserts a
  folded, lower-case prefix of that surname finds the active household alone; that the _superseded_
  card number `281k1` still resolves to the household now holding `281k2` (the list is about
  households, so the index is dropped); that the blocked filter leaves **only** `data-status="BLOCKED"`
  rows on screen, asserted over the whole table rather than this spec's own rows; that the archived
  namesake appears only once the toggle is ticked, labelled _archiviert_; and that the three
  certificate states are stated in words on the rows they belong to. The group balance is read off
  the screen **before** the seed and asserted as a delta (+3 RED, +1 BLUE — the blocked household
  counts, the archived one does not), then re-read under a group filter and required to be unchanged,
  which is FR-3. FR-5 is the last test: the filters are set through the controls, read back out of the
  URL, and the page reloaded — same rows, same controls, same address. Pinned to 08.01.2026 because
  the certificate states are relative to today, and the pinned-now file is deleted in `afterAll` like
  its neighbours.
- `customer-record.spec.ts` covers US-16 end to end (§US-16.6): that a correction typed on the record
  is in force everywhere, immediately. One household (customer number 291) is seeded through Prisma —
  **BLUE**, active, certificate lapsed, two reminders sent, one card printed `1 / 1` and `BLUE` — and
  then edited four times, each edit read back off the screen that would betray it. Adding a child
  moves all four derived figures **before the save** (1 / 2, 4 Portionen, 4,00 €), which is the claim
  the household editor exists to make and the one no unit gate can reach: the panel calls the same
  domain rules the save applies, against the server's today. The save then puts the household on
  `/karten-neuausstellung` with _Haushalt geändert_ and both count sets. A renewal recorded on the
  record — the counter's use case, from the record's form — resets the reminder count to 0 on the
  revalidated screen and on a fresh request. The group half is what the story turns on: pinned to the
  **RED** Thursday 08.01.2026, the BLUE household is `WRONG_GROUP` at the counter with no serve
  action, and after one move on the record it is `CLEAR_TO_SERVE` on the same morning — with both
  group sizes moving together, asserted as a delta because they count the whole shared register. The
  card is deliberately reissued in between: with the printed counts still out of date,
  `HOUSEHOLD_CHANGE` answers the cards-due list first and _Gruppe gewechselt_ would never be visible.
  Last, a note written on the record is read back verbatim at the counter. Pinned-now file deleted in
  `afterAll`, like its neighbours.
- E2E is where an `app/` bug actually surfaces: `npm run build` passes on a `"use server"` module
  that exports a non-function, and only a real page load fails. Any story touching a route needs a
  spec here.
- Run: `npm run test:e2e` (first time locally: `npx playwright install --with-deps chromium`). The
  web server runs `npm run start`, which serves whatever `.next` already holds — it does **not**
  build. Run `npm run build` first after changing anything the app renders, or the suite will assert
  against the previous build. CI has this right by construction: `e2e-tests` builds in the job.
  For the same reason, kill any server left over from an earlier run before starting: `webServer` has
  `reuseExistingServer: !CI`, so a stale process on port 3000 is adopted — old build, and its
  database is never wiped and re-seeded, which surfaces as every spec failing at once on rows that
  are already there. The process is called **`next-server`**, not `next start`, so the pattern that
  finds it is `pkill -f "next-server"`.

### TDD approach per layer

| Layer             | Approach                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| `domain/`         | Strict TDD — pure, fast; test the **invariant-breaking case first**.      |
| `application/`    | TDD against hand-written fakes (prefer fakes over mock libraries).        |
| `infrastructure/` | Test-after, thin integration tests vs. a throwaway SQLite file.           |
| `app/`            | Test-after or cover via Playwright; logic here is a smell — push it down. |

Test data is **synthetic only** — never real customer or certificate data in fixtures.
`@faker-js/faker` is a devDependency, added with US-01 as the first story to handle names and
addresses; specs call `faker.seed(…)` once at the top so a failing run stays reproducible.

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
