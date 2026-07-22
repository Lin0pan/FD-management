# PRDs — FD-Management MVP

One PRD per user story from [`docs/user_stories_mvp.md`](../docs/user_stories_mvp.md). The `docs/`
folder is the source of truth for _what FD needs_ and is never edited by this folder; these documents
are the implementation-facing translation of it.

## Conventions shared by every PRD

**Layered vertical slice.** Each PRD decomposes its story into sub-stories that follow the build
order in `docs/technical_documentation.md` §12:

1. **Domain** (`src/domain/**`) — pure TypeScript, zero I/O, strict TDD, invariant-breaking test
   first. Covered by the 100% Vitest coverage gate.
2. **Ports & use case** (`src/application/**`) — one file per business action, TDD against
   hand-written fakes (never a mock library). Also under the 100% gate.
3. **Infrastructure** (`src/infrastructure/prisma/**`, `prisma/schema.prisma` + migration) —
   the only layer that knows Prisma, the filesystem or the wall clock. Thin integration tests
   against a throwaway SQLite file.
4. **Presentation** (`src/app/**`, `src/i18n/de.ts`) — Next.js route or server action: validate
   with Zod, call exactly one use case, render. German strings live only in the dictionary.
5. **E2E** (`tests/e2e/**`) — Playwright against the built app.

**Definition of done for every sub-story** (assume these even where not repeated):

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test:coverage` passes (domain + application stay at 100%)
- [ ] New behaviour is covered by a test written **before** the implementation
- [ ] UI sub-stories additionally: verify in the browser using the dev-browser skill

**Non-negotiable project rules** (from `docs/technical_documentation.md` §11):

- Money is **integer cents**, formatted via `src/domain/money.ts`. Never a float.
- Time comes from the **`Clock` port**, never `new Date()` in domain or application code.
- Grown-up/children counts are **derived from birthdates on every read**, never stored.
- Policy values are **data with an effective-from date**, not constants.
- No actor is ever recorded — FD has no login, so records say _what / when / why_, never _who_.
- `Customer.id` (surrogate int) is identity and the target of every FK; the `1..N` customer number
  is a **reusable slot attribute**, not an identity.
- German UI, English code.

## Provisional seed values

The concrete policy numbers are **open question 1** in `docs/domain_analysis.md`. To unblock
implementation and tests, the PRDs assume the following seeds. They are configuration rows
(US-14), so replacing them is a data edit, not a code change. **All are provisional and must be
confirmed with FD before go-live.**

| Value                 | Provisional seed              |
| --------------------- | ----------------------------- |
| Customer quota `N`    | 240                           |
| Portions per grown-up | 2                             |
| Portions per child    | 1                             |
| Price per grown-up    | 200 cents                     |
| Price per child       | 100 cents                     |
| Week-cycle anchor     | ISO week `2026-W02` = **Red** |
| Distribution weekday  | Thursday                      |

The price is charged **per head**: what a household owes is `grown-ups × price per grown-up +
children × price per child`, derived wherever it is shown and never stored.

## Index

| PRD                                                                            | Story | Tier | Depends on          |
| ------------------------------------------------------------------------------ | ----- | ---- | ------------------- |
| [prd-us-14-configure-business-rules.md](prd-us-14-configure-business-rules.md) | US-14 | 2    | —                   |
| [prd-us-01-register-customer.md](prd-us-01-register-customer.md)               | US-01 | 1    | US-14               |
| [prd-us-02-issue-customer-card.md](prd-us-02-issue-customer-card.md)           | US-02 | 1    | US-01               |
| [prd-us-03-week-colour.md](prd-us-03-week-colour.md)                           | US-03 | 1    | US-14               |
| [prd-us-04-lookup-customer.md](prd-us-04-lookup-customer.md)                   | US-04 | 1    | US-01…03, US-06…08  |
| [prd-us-05-record-attendance.md](prd-us-05-record-attendance.md)               | US-05 | 1    | US-04, US-07        |
| [prd-us-06-certificate-reminder.md](prd-us-06-certificate-reminder.md)         | US-06 | 1    | US-04, US-14        |
| [prd-us-07-portions-and-price.md](prd-us-07-portions-and-price.md)             | US-07 | 1    | US-14               |
| [prd-us-08-block-unblock-customer.md](prd-us-08-block-unblock-customer.md)     | US-08 | 2    | US-01               |
| [prd-us-09-reissue-card-after-loss.md](prd-us-09-reissue-card-after-loss.md)   | US-09 | 2    | US-02               |
| [prd-us-10-archive-customer.md](prd-us-10-archive-customer.md)                 | US-10 | 2    | US-05, US-06        |
| [prd-us-11-reuse-archived-record.md](prd-us-11-reuse-archived-record.md)       | US-11 | 2    | US-01, US-10        |
| [prd-us-12-waiting-list.md](prd-us-12-waiting-list.md)                         | US-12 | 2    | US-01, US-10, US-14 |
| [prd-us-13-age-13-reclassification.md](prd-us-13-age-13-reclassification.md)   | US-13 | 2    | US-02, US-07, US-09 |
| [prd-us-15-customer-list.md](prd-us-15-customer-list.md)                       | US-15 | 3    | US-01, US-08        |
| [prd-us-16-maintain-customer-record.md](prd-us-16-maintain-customer-record.md) | US-16 | 3    | US-06, US-13, US-15 |

**Recommended build order** (dependency chain, not tier order):
US-14 → US-01 → US-02 → US-03 → US-07 → US-04 → US-05 → US-06 → US-08 → US-09 → US-10 → US-13 →
US-11 → US-12 → US-15 → US-16.
