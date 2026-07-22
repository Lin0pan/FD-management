# PRD: US-07 — See the Portion Allowance and Price

> Source story: `docs/user_stories_mvp.md` §US-07 (Tier 1). Depends on **US-14** (portion values and
> prices per head) and **US-01.1** (derived counts). Consumed by **US-04** and **US-05**.

## 1. Introduction

At a busy counter nobody should be doing arithmetic. Given a customer's household, the app must state
how many portions they receive and what they pay. Both follow from the derived grown-up/children
counts: portions from the configured per-head portions, price from the **configured price per
grown-up and per child** multiplied by those counts.

The price never flexes with supply or occasion. The portion allowance shown is always the **standard**
one — day-to-day adjustments for supply or Christmas do happen, but they are made physically at the
counter and are out of scope for the software entirely.

## 2. Goals

- Portions and price appear wherever a customer is shown, with no manual calculation.
- Money is integer cents end to end; no floating point ever touches a price.
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

**Description:** As a developer, I need what a household owes derived from the two configured
per-head prices.

**Acceptance Criteria:**

- [ ] `priceFor(settings, grownUps, children)` returns
      `grownUps × pricePerGrownUp + children × pricePerChild` as integer cents. It lives in
      `src/domain/policy/settings.ts` alongside the values it reads — a two-line derivation does not
      warrant its own module
- [ ] Every household size is priceable; there is no "unpriced household" failure mode
- [ ] Tests cover: a multi-head household, a single-person household, an empty household (0 cents)
      and a free configuration (both prices 0)
- [ ] Formatting goes through `src/domain/money.ts`; this function returns cents only

### US-07.3: `describeAllowance` composition (application)

**Acceptance Criteria:**

- [ ] A small application-level helper resolves settings at a date, derives counts from the household,
      and returns `{ grownUps, children, portions, priceCents }` for use by US-04 and US-05
- [ ] Tested with a fake settings repository and a fake clock, including a household evaluated on a
      date where an **older** settings version was in force (proves historical pricing works)

### US-07.4: Allowance display (presentation)

**Description:** As a staff member, I want portions and price shown wherever I look at a customer.

**Acceptance Criteria:**

- [ ] The counter screen (US-04), the card view (US-02) and the customer record (US-16) all show
      portions and price
- [ ] Money renders as German-formatted euro (`2,50 €`) via `formatEuros`
- [ ] The screen states these are the **standard** values; there is no control to adjust them
- [ ] Verify in browser using dev-browser skill

### US-07.5: E2E — portions and price follow the household

**Acceptance Criteria:**

- [ ] Playwright spec: a customer with 2 grown-ups and 1 child shows the seeded portions and price;
      adding a household member (US-16) updates both immediately on reload

## 4. Functional Requirements

- FR-1: The portion allowance must be computed from the derived grown-up/children counts and the
  configured portions-per-grown-up and portions-per-child values.
- FR-2: The price must be derived per head — price per grown-up times grown-ups plus price per child
  times children — and must never flex with supply or occasion.
- FR-3: The allowance shown must always be the standard one; the system must neither capture nor
  record counter-side adjustments.
- FR-4: Money must be displayed in euro and must never be computed in floating point.

## 5. Non-Goals

- **No supply or occasion adjustments** — explicitly out of scope; they happen physically at the counter.
- No discounts, waivers or per-customer pricing.
- No accounts receivable, balances or totals owed.
- No rounding logic — the per-head prices are exact cents and the total is a sum of them.

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
  child. Confirm the real values with FD.
- Should portions be displayed as a number only, or in FD's own unit (bags, crates)?
