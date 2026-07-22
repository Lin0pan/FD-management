# Tech-Stack & Architecture Sketch — Füllhorn Delbrück (FD)

## 1. Context

Füllhorn Delbrück (FD) is a small charity (3–4 staff) that currently keeps its customer list in
Excel. The goal is a business application that

- manages customers (registration, eligibility, cards, groups, archiving), and
- logs food distribution.

**Sources:** domain in [`domain_information/domain_analysis.md`](domain_information/domain_analysis.md),
stack wishes in [`techincal_thoughts`](techincal_thoughts) — cross-platform, web-server-shaped,
popular and well-supported, lightweight, strongly testable, maintainable and extendable over years.

The project directory is otherwise empty — this is greenfield. This document is a stack and
architecture proposal, not yet an implementation plan.

## 2. What the Domain Demands from the Architecture

Four properties fall out of the domain analysis and should drive the design.

### 2.1 Rules are soft and staff-discretionary

Portion allowance flexes with food supply and special occasions (Christmas); the "3 reminders"
threshold is explicitly overridable; group placement is a judgement call; a temporary block is a
free-text staff decision with no rule behind it.

The price table is the exception — it is fixed per grown-up/children count and does not flex with
occasion or supply. It is still configuration (the amounts are unknown and will change over the
years), just not a per-distribution decision.

→ **Business rules must be configurable data, not hard-coded constants, and must live in one
isolated place.**

### 2.2 A few hard invariants must never break

- A customer number is unique **among active customers** in `1..N`, and becomes reusable after
  archiving. It is a slot, not an identity (see [§5.3](#53-customer-identity-vs-customer-number)).
- Card number is `<customerNo>k<index>`, with exactly one valid card per customer.
- Red and Blue weeks strictly alternate.

→ **Enforce these in a pure domain layer _and_ in database constraints.**

### 2.3 Sensitive personal data on vulnerable people

Jobcenter certificates, household composition, individual staff notes.

→ **Local-first, no cloud by default, append-only audit trail.**

Retention is decided: archived customers are kept indefinitely, and nothing is deleted today. That
is a policy choice FD may revisit, so archiving should stay a status change on a record that remains
queryable — not a soft-delete that hides data the app can no longer reach.

### 2.4 State that changes without anyone touching it

Household composition is now derived from each member's date of birth, and a child becomes a
grown-up on their 13th birthday with no staff action. Portion allowance, price and card validity all
follow from that. The same shape applies to certificate expiry and to which week colour is current.

→ **Do not store grown-up/children counts as editable numbers — compute them from birthdates
against an injected clock.** Storing them invites two sources of truth that silently drift apart,
which is exactly the failure the Excel sheet has today. The corollary is that the printed card can
go stale on its own, so the app needs a "cards due for reissue" view rather than an event to react
to.

### 2.5 Tiny scale, long life

~240 customers, ~4 concurrent users, one distribution per week. Volume is irrelevant;
maintainability over 5+ years — possibly by a different developer — is the real constraint.

→ **Favour boring, stable, replaceable pieces.**

## 3. Recommended Stack

| Layer         | Choice                                                                  | Rationale                                                                                                                             |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Language      | TypeScript (strict)                                                     | One language front-to-back; types are the cheapest documentation for a future maintainer.                                             |
| Runtime       | Node.js LTS                                                             | Matches the "maybe a node server?" instinct; runs on macOS, Linux and Windows.                                                        |
| App framework | Next.js (App Router)                                                    | Single process serves UI and API; the most-documented React setup in existence; `npm run build && npm start` is the whole deployment. |
| UI            | React + Tailwind CSS + shadcn/ui                                        | Copy-in components (no heavy UI dependency to upgrade), accessible, fast for a dense data-entry UI.                                   |
| Database      | SQLite (via `better-sqlite3`)                                           | Single file. Backup = copy the file. Zero server to administer — decisive for a charity with no IT staff.                             |
| ORM           | Prisma                                                                  | Declarative schema, generated types and migrations; the schema file doubles as readable domain documentation.                         |
| Validation    | Zod                                                                     | One schema validates form input and produces the TypeScript type.                                                                     |
| Unit tests    | Vitest                                                                  | Fast; the pure domain layer reaches ~100% coverage in milliseconds.                                                                   |
| E2E tests     | Playwright                                                              | Real-browser tests of the distribution-day and registration flows.                                                                    |
| Money         | Integer cents (never floats)                                            | Prices are money; SQLite has no decimal type.                                                                                         |
| i18n          | German UI strings in one dictionary module, English identifiers in code | Staff-facing terms (Kunde, Bescheinigung, Gruppe) match how the team speaks; code stays greppable.                                    |

### 3.1 Note on Next.js

Next.js is the most popular option but also the fastest-moving, and server components add
conceptual weight this app does not need. Mitigation:

- pin the major version,
- keep all business logic outside the framework (see [§4](#4-architecture-layered-core-with-thin-adapters)),
- use only the well-established parts (server actions + route handlers).

If the framework ever needs replacing, only the `src/app/` directory is thrown away.

## 4. Architecture: Layered Core with Thin Adapters

Pattern: _hexagonal-lite_. **The rule: the domain layer imports nothing from Next.js, React or
Prisma.** Everything else is a replaceable adapter around it.

```text
src/
  domain/            # pure TypeScript, zero I/O — unit-tested with Vitest
    customer/        #   Customer, HouseholdMember, HouseholdComposition (derived), Group, Status
    card/            #   CardNumber value object (parse / format / next index)
    distribution/    #   WeekColor, week-cycle calendar rule
    policy/          #   PortionPolicy, PricePolicy, ReminderPolicy — read config, no I/O
    errors.ts        #   typed domain errors (e.g. WrongGroupForWeek, NoFreeCustomerNumber)

  application/       # use cases — one file per business action, transaction boundary
    registerCustomer.ts   issueReplacementCard.ts   recordAttendance.ts
    recordReminder.ts     archiveCustomer.ts        promoteFromWaitingList.ts
    updateHousehold.ts    blockCustomer.ts          unblockCustomer.ts
    listCardsDueForReissue.ts
    ports.ts         #   repository *interfaces* the domain needs

  infrastructure/    # the only place that knows about Prisma / filesystem / time
    prisma/          #   repository implementations of ports.ts
    clock.ts         #   injectable time source (makes week-cycle & expiry tests deterministic)
    audit.ts         #   append-only event log

  app/               # Next.js — routes, server actions, React components. Thin.
                     #   A server action validates with Zod, calls one use case, renders.

prisma/schema.prisma
data/fd.db           # the database — and the entire backup unit
tests/e2e/           # Playwright
```

### 4.1 Why this pattern here

- **Testability** — the interesting logic (card numbering, week alternation, reminder escalation,
  number reuse) is pure functions, tested in milliseconds with no DB, no browser, no mocks.
- **Change tolerance** — the domain analysis is an MVP starting point, not a finished spec, and
  still carries three open questions. The concrete policy values (price table, portions per head,
  quota `N`) are simply unknown today; when they arrive, they are config rows, not code. Later
  additions — reporting, retention rules, block history — land in `domain/policy/` and the
  repositories rather than scattered across UI code.
- **Framework insurance** — replacing Next.js touches only `src/app/`.
- **Right-sized** — this is layering, not full DDD ceremony: no aggregates, event sourcing or CQRS.
  The app is small; the structure should stay legible.

## 5. Two Cross-Cutting Decisions Worth Making Up Front

### 5.1 Policies as data

Portions per adult, portions per child, the price table, the reminder threshold and the customer
quota `N` live in a `settings` table with an _effective-from_ date and are editable in the UI. This
directly serves the "adjustable for Christmas" and "staff may extend the threshold" requirements
without a code deploy.

Effective-from dating matters most for the **price table**: a distribution record stores only a
`paid` flag, never an amount, so the only way to answer "what did that customer owe last March" is
to look up the table version in force on that date. Portion values want the same treatment for the
same reason. The reminder threshold and quota `N` are read at decision time and could get by with
plain current values — uniform treatment is simply cheaper than two mechanisms.

### 5.2 Append-only audit log

Every state change (archive, block, group move, card reissue, policy edit) is recorded with
timestamp and reason. Given how many decisions are individual staff judgement calls, this is the
feature that makes those decisions defensible — and it is far cheaper to add now than to retrofit.

**No actor field:** FD has decided against login and user administration, so the system cannot tell
its 3-4 staff apart. The log answers _what changed, when and why_, never _who_. That is a deliberate
scope decision, not an oversight; if login is ever added, an actor column is an additive change.

### 5.3 Customer identity vs. customer number

**Decision.** A customer's stable identity is a surrogate primary key — a database-generated,
auto-incrementing integer `id` — separate from the `1..N` customer number.

**Why.** The domain requires the customer number to be a reusable slot: when a customer is archived,
their number is freed and later reassigned to a different person (domain analysis §4.6). That makes
the customer number **non-unique across the archive** — two unrelated people can each have held
number `50` at different times. An attribute that gets recycled cannot serve as identity: it cannot
safely key distribution records, cards, notes or any foreign key, because those would silently
collapse two different people onto one slot.

The card number has the same shape and the same limitation — `50k1` recurs for every occupant of
slot `50`, so it is not archive-unique either.

**Consequences.**

- `Customer.id` (surrogate int) is the primary key and the target of **every** foreign key —
  distribution records, cards, audit log entries. It is immutable, never reused, unique across
  active _and_ archived customers by construction.
- The customer number is modelled as an **attribute the customer currently holds**, with a database
  constraint of _at most one active customer per number_ (a partial/filtered unique index — archived
  rows are exempt). The domain layer owns "lowest free number" assignment (US-01).
- The card row is keyed by / FK'd to `id`; its `<customerNo>k<index>` string is display data only.
  `50k1` appearing for two different `id`s is therefore harmless.
- **Purely internal.** The surrogate `id` is plumbing — it is not shown in the UI and not spoken by
  staff, who continue to use the customer number and card number as today. (Considered and rejected:
  a human-facing composite like `50-1`/`50-2` — it re-couples identity to the reusable slot, is a
  smart key inviting parse/sort bugs, and needs a stateful per-slot lookup to generate. The opaque
  surrogate avoids all three.) If a human-readable stable handle is ever wanted, exposing the
  surrogate is an additive change.

## 6. Operations

- **Run:** `npm run build && npm start` → `http://localhost:3000`, bookmarked on the staff MacBook.
- **Backup:** a scheduled copy of `data/fd.db` (plus a SQLite WAL checkpoint) to an external
  location. Document this — it is the single most important operational task.
- **Auth:** none. FD has ruled out login and user administration for the foreseeable future —
  3-4 trusted colleagues share one machine. The app therefore binds to localhost only and is not
  exposed on the network; physical access to the machine _is_ the access control, which makes the
  disk-level protection of that machine (and of the backups) the thing that actually guards the
  personal data in §2.3.
- **Cloud path (if ever):** same code, swap SQLite → Postgres in Prisma, add TLS. No rewrite.

## 7. Open Decisions

1. Scope of the first milestone: the full domain minus the open questions, or a thin MVP (customer
   list + attendance) first?
2. German or English UI. _(Login is decided: none — see §5.2 and §6.)_
3. Is there an existing Excel export to import, or is the list re-entered by hand?

## 8. Verification (Once Implementation Starts)

- `npm test` — Vitest unit suite over `src/domain` and `src/application` (fake repositories, fake
  clock). Target: every rule in §4 of the domain analysis has a named test.
  The birthdate-derived composition deserves named edge-case tests against a fake clock: the day
  before, the day of and the day after a member's 13th birthday, plus 29 February.
- `npm run test:e2e` — Playwright covering: register a customer → card issued; distribution-day
  happy path including the `paid` flag; wrong-group customer turned away; expired certificate →
  3rd reminder → archived; archived number reused by the next registration; waiting-list applicant
  promoted in first-come-first-served order.
- Manual smoke: `npm run build && npm start` on macOS, confirming the app boots against a fresh
  `data/fd.db` created by `prisma migrate deploy`.
