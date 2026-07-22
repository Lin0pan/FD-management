# PRD: US-15 — Browse and Search the Customer List

> Source story: `docs/user_stories_mvp.md` §US-15 (Tier 3). Depends on **US-01** and **US-08**.
> Gateway to **US-16**.
>
> Marked `[added]` in the story: the domain analysis never mentions a list view, because in Excel the
> list _is_ the product. Replacing Excel without one would be a regression.

## 1. Introduction

Away from the counter, staff need to answer questions the counter screen cannot: who is in the Red
group, whose certificate expires soon, who is currently blocked, how balanced are the two groups. In
Excel these were a glance and a filter. This feature restores that capability.

It is also the entry point to every customer record (US-16), which is why it is Tier 3 in value but
practically indispensable once the app is in daily use.

## 2. Goals

- Find any customer by name, customer number or card number.
- Filter by status, group and certificate expiry.
- Show both group sizes so staff can keep Red and Blue balanced.
- Exclude archived customers by default; include them deliberately.

## 3. User Stories

### US-15.1: `listCustomers` query use case (application)

**Acceptance Criteria:**

- [ ] `listCustomers(deps, { search?, status?, group?, certificate?, includeArchived? })`
- [ ] `search` matches: last name, first name (case- and diacritic-insensitive), an exact customer
      number, or a card number (`50k3` → resolves to customer 50)
- [ ] `status` accepts any subset of `ACTIVE | BLOCKED | ARCHIVED`
- [ ] `certificate` accepts `VALID | EXPIRING_SOON | EXPIRED`, where "expiring soon" is within 30 days
      of `deps.clock.now()` (constant documented; see Open Questions)
- [ ] `includeArchived` defaults to **false**; archived customers appear only when it is explicitly true
      or when `status` names `ARCHIVED`
- [ ] Results carry: customer number, name, group, status, derived counts, certificate expiry,
      reminder count, current card number
- [ ] The result also carries `groupCounts: { red: number; blue: number }` for **active** customers,
      independent of the current filter — asserted by a test that filters to Blue and still gets both
- [ ] Sorting defaults to ascending customer number (the call-up order staff think in)
- [ ] Performs no writes; tested against fakes for every filter combination that has distinct behaviour

### US-15.2: List queries and indexes (infrastructure)

**Acceptance Criteria:**

- [ ] Repository implements the filters in SQL, not by loading all rows and filtering in JS — except
      the derived counts, which are computed per row after loading the household
- [ ] Indexes on `lastName`, `customerNumber`, `status`, `group`
- [ ] The normalised search column decided in US-11.1 is reused here — one search-normalisation
      approach in the codebase, not two
- [ ] Integration test seeds ~50 synthetic customers across statuses and groups and asserts each
      filter's result set and the group counts

### US-15.3: Customer list screen (presentation)

**Acceptance Criteria:**

- [ ] Route `/kunden` shows a dense table: number, name, group, status, counts, portions, price,
      certificate expiry, reminder count
- [ ] A single search box handles name, customer number and card number, with a German placeholder
      saying so
- [ ] Filter controls for status, group and certificate state; filters are reflected in the URL so a
      view can be bookmarked and shared between staff on the shared machine
- [ ] Both active group sizes are shown prominently above the table (e.g. "Rot: 118 · Blau: 121")
- [ ] Archived customers are hidden until a clearly labelled toggle is switched on; archived rows are
      visually distinct
- [ ] Empty results render an explicit German message naming the active filters, never a blank table
- [ ] Each row links to the customer record (US-16)
- [ ] Status is conveyed by text plus colour, never colour alone
- [ ] Verify in browser using dev-browser skill

### US-15.4: E2E — search and filter

**Acceptance Criteria:**

- [ ] Playwright spec seeds customers across groups, statuses and certificate states
- [ ] Asserts: name search finds the right customer; a card number resolves to its holder; the blocked
      filter shows only blocked customers; archived are hidden by default and appear when toggled
- [ ] Asserts the group counts shown match the seeded data and do not change when a filter is applied
- [ ] Asserts the URL carries the filter state and that reloading restores the same view

## 4. Functional Requirements

- FR-1: The list must be searchable by name, customer number and card number.
- FR-2: The list must be filterable by status (active / blocked / archived), by group, and by
  certificate expiry.
- FR-3: The list must show both group sizes so staff can keep Red and Blue roughly balanced.
- FR-4: Archived customers must be excluded by default and includable deliberately.
- FR-5: Filter state must be reflected in the URL.
- FR-6: The default sort order must be ascending customer number.
- FR-7: The view must perform no writes.

## 5. Non-Goals

- No export to Excel or CSV (a migration/reporting question, deliberately deferred).
- No bulk actions — no multi-select archive, group change or block.
- No reporting or statistics (explicitly out of MVP scope).
- No saved views or per-user preferences (there are no users).
- No pagination beyond a simple result cap if performance ever requires it — 240 customers fit.

## 6. Design Considerations

- Density beats prettiness: this view replaces a spreadsheet and staff will scan it. Prefer a compact
  table with a fixed header over cards or generous spacing.
- The group-balance figures are a decision-support number staff use during registration (US-01) —
  make them prominent and always current.

## 7. Technical Considerations

- Counts, portions and price are derived per row. At ~240 customers this is trivially fast; do not
  add caching or stored counts to optimise it — that is precisely the drift the architecture forbids.
- Reuse the same read model shape as the counter lookup where possible, so one change to the customer
  projection updates both screens.

## 8. Success Metrics

- Any question a staff member used to answer with an Excel filter can be answered here in under 10
  seconds.
- Group sizes stay within a few customers of each other, because the number is always visible.

## 9. Open Questions

- Is 30 days the right "expiring soon" window, or should it be configurable (US-14)?
- Should the list show the consecutive-no-show count (US-10.1) as a column, to make that archiving
  trigger visible outside the individual record?
- Does FD need a printable or exportable version of this list for offline use during a distribution?
