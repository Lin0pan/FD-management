# PRD: US-07 — See the Portion Allowance and Price

> Source story: `docs/user_stories_mvp.md` §US-07 (Tier 1). Depends on **US-14** (portion values and
> price table) and **US-01.1** (derived counts). Consumed by **US-04** and **US-05**.

## 1. Introduction

At a busy counter nobody should be doing arithmetic. Given a customer's household, the app must state
how many portions they receive and what they pay. Both follow from the derived grown-up/children
counts: portions from the configured per-head values, price from the **fixed price table** keyed by
those counts.

The price never flexes with supply or occasion. The portion allowance shown is always the **standard**
one — day-to-day adjustments for supply or Christmas do happen, but they are made physically at the
counter and are out of scope for the software entirely.

## 2. Goals

- Portions and price appear wherever a customer is shown, with no manual calculation.
- Money is integer cents end to end; no floating point ever touches a price.
- A missing price-table row is a loud, specific error, never a silent zero or a guess.
- Both values are pure functions of (counts, settings-in-force) and fully unit-tested.

## 3. User Stories

### US-07.1: `PortionPolicy` (domain)

**Description:** As a developer, I need portions derived from the counts and the configured per-head
values.

**Acceptance Criteria:**

- [ ] `src/domain/policy/portions.ts` exports
      `portionsFor({ grownUps, children }, { portionsPerGrownUp, portionsPerChild })`
- [ ] Returns `grownUps * portionsPerGrownUp + children * portionsPerChild`
- [ ] Returns an integer; configuration values are validated as non-negative integers upstream (US-14.1)
- [ ] Tests cover: single-person household, a household with children, zero children, and a
      configuration where `portionsPerChild` is 0
- [ ] Pure — no clock, no I/O, no default values baked in

### US-07.2: `PricePolicy` (domain)

**Description:** As a developer, I need the price looked up from the fixed table, with an explicit
failure when no row matches.

**Acceptance Criteria:**

- [ ] `src/domain/policy/price.ts` exports `priceFor({ grownUps, children }, priceTable)` returning
      cents as an integer
- [ ] Looks up an **exact** (grown-ups, children) row — it never interpolates, extrapolates or falls
      back to a nearest row
- [ ] Returns a typed `NoPriceForHousehold` error carrying both counts when no row matches
- [ ] Tests cover: exact match, no match, a table with a zero-cent row (valid), duplicate rows
      rejected upstream by the US-14.3 unique constraint
- [ ] Formatting goes through `src/domain/money.ts`; this module returns cents only

### US-07.3: `describeAllowance` composition (application)

**Acceptance Criteria:**

- [ ] A small application-level helper resolves settings at a date, derives counts from the household,
      and returns `{ grownUps, children, portions, priceCents }` for use by US-04 and US-05
- [ ] Given a household with no matching price row, it surfaces `NoPriceForHousehold` rather than
      returning a partial result
- [ ] Tested with a fake settings repository and a fake clock, including a household evaluated on a
      date where an **older** settings version was in force (proves historical pricing works)

### US-07.4: Allowance display (presentation)

**Description:** As a staff member, I want portions and price shown wherever I look at a customer.

**Acceptance Criteria:**

- [ ] The counter screen (US-04), the card view (US-02) and the customer record (US-16) all show
      portions and price
- [ ] Money renders as German-formatted euro (`2,50 €`) via `formatEuros`
- [ ] The screen states these are the **standard** values; there is no control to adjust them
- [ ] A missing price row renders an explicit German error naming the counts and pointing at the
      settings screen — the customer data still renders around it
- [ ] Verify in browser using dev-browser skill

### US-07.5: E2E — portions and price follow the household

**Acceptance Criteria:**

- [ ] Playwright spec: a customer with 2 grown-ups and 1 child shows the seeded portions and price;
      adding a household member (US-16) updates both immediately on reload
- [ ] Spec asserts a household size with no price row shows the specific error

## 4. Functional Requirements

- FR-1: The portion allowance must be computed from the derived grown-up/children counts and the
  configured portions-per-grown-up and portions-per-child values.
- FR-2: The price must be read from the fixed price table keyed by the grown-up/children counts, and
  must never flex with supply or occasion.
- FR-3: The allowance shown must always be the standard one; the system must neither capture nor
  record counter-side adjustments.
- FR-4: Money must be displayed in euro and must never be computed in floating point.
- FR-5: A household size with no price-table row must produce an explicit error naming the counts.

## 5. Non-Goals

- **No supply or occasion adjustments** — explicitly out of scope; they happen physically at the counter.
- No discounts, waivers or per-customer pricing.
- No accounts receivable, balances or totals owed.
- No rounding logic — the table stores exact cents.

## 6. Technical Considerations

- `money.ts` already exists and formats integer cents deterministically (not via `Intl`). Reuse it;
  do not introduce a second formatter.
- Keep `portionsFor` and `priceFor` free of settings-fetching so they stay trivially testable; the
  settings resolution belongs one layer up (US-07.3).

## 7. Success Metrics

- No arithmetic is ever performed by a staff member at the counter.
- 100% branch coverage on both policy modules.
- Zero float values in any money code path, enforced by the integer-cents type and schema.

## 8. Open Questions

- **Provisional seeds:** 2 portions per grown-up, 1 per child, price 200c per grown-up + 100c per
  child. Confirm the real values and the real price table with FD.
- Does the price table need an upper bound on household size, or should very large households simply
  produce the "no price row" error until a row is added?
- Should portions be displayed as a number only, or in FD's own unit (bags, crates)?
