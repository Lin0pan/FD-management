# PRD: US-13 — Reclassify Children Automatically at Age 13

> Source story: `docs/user_stories_mvp.md` §US-13 (Tier 2). Depends on **US-02** (cards), **US-07**
> (portions and price) and **US-09** (reissue mechanics).
>
> This is the one place the domain analysis describes a **future** behaviour rather than today's
> process — staff currently catch this informally, if at all.

## 1. Introduction

A child becomes a grown-up on their 13th birthday, which changes the household counts, the portion
allowance and the price. Nobody should have to watch birthdays for that to happen.

The mechanism is already decided by the architecture: counts are **derived from birthdates every time
they are displayed**, never stored. So the reclassification needs no job, no trigger and no event —
it simply happens. What the feature must add is the **consequence**: the printed card now shows stale
counts, so the customer appears on a "cards due for reissue" list. A stale card is never grounds to
turn anyone away.

## 2. Goals

- Counts, portions and price follow a 13th birthday with zero staff action.
- Staff are told which cards became outdated, without being nagged.
- Reissuing from that list uses the same card mechanics as US-09 and clears the entry.
- The date boundaries are provably correct against an injectable clock.

## 3. User Stories

### US-13.1: Boundary-exhaustive tests for the derived composition (domain)

**Description:** As a developer, I need the 13th-birthday boundary pinned down by tests, because every
downstream number depends on it.

**Acceptance Criteria:**

- [ ] Extends `src/domain/customer/householdComposition.ts` from US-01.1 — no new production rule,
      only its verification
- [ ] Test: a member born exactly 13 years ago **today** counts as a grown-up
- [ ] Test: born 13 years ago **tomorrow** counts as a child
- [ ] Test: born 13 years ago **yesterday** counts as a grown-up
- [ ] Test: a 29 February birthdate evaluated in a non-leap year — the member counts as a grown-up
      from 1 March (the German civil-law convention), documented in a comment
- [ ] Test: a 29 February birthdate evaluated in a leap year — grown-up on 29 February
- [ ] Test: timezone stability — evaluated at 23:59 and 00:01 local time around the birthday, the
      answer flips exactly once, at local midnight (Europe/Berlin)
- [ ] All tests drive an explicit `today` parameter; no `new Date()` anywhere

### US-13.2: `cardsDueForReissue` query (application)

**Description:** As a staff member, I want a list of customers whose card shows counts that no longer
match their household.

**Acceptance Criteria:**

- [ ] `listCardsDueForReissue(deps)` returns active customers whose **current card's recorded counts**
      differ from the counts derived today
- [ ] The card therefore stores the grown-up/children counts **as printed at issue time** — this is the
      one place counts are persisted, and only as a historical snapshot of what is on the physical card,
      never as the source of truth
- [ ] Each result carries: customer number, name, card number, counts on the card, counts today, and
      the reason for the difference (`AGE_13` when a birthday explains it, `HOUSEHOLD_CHANGE` otherwise)
- [ ] Archived and blocked customers are excluded from the list (documented; blocked customers are not
      collecting)
- [ ] Tested with fakes and a fake clock: a household where a child turns 13 between two clock values
      appears on the list without any write having occurred in between

### US-13.3: Card count snapshot (infrastructure)

**Acceptance Criteria:**

- [ ] `Card.grownUpsAtIssue Int` and `Card.childrenAtIssue Int` added, written by `issueCard` (US-02.2)
      from the composition derived at issue time
- [ ] A comment in `schema.prisma` states explicitly that these are a **snapshot of the printed card**,
      not the household truth, so a future maintainer does not "fix" the duplication
- [ ] The due-for-reissue query is expressible without loading every customer's household in
      application code where feasible; if a per-customer derivation is unavoidable at ~240 customers,
      document the choice
- [ ] Migration committed; integration test seeds a card issued with 1/1 counts and a member who has
      since turned 13, and asserts the customer appears in the list

### US-13.4: "Cards due for reissue" screen (presentation)

**Acceptance Criteria:**

- [ ] Route `/karten-neuausstellung` lists the affected customers with both count sets side by side and
      the reason
- [ ] The page states in German that this is **not urgent** and that a stale card is never grounds to
      turn anyone away
- [ ] Each row has a "Karte neu ausstellen" action using the US-09/US-02 mechanics with reason
      `STALE_COUNTS`; on success the row disappears
- [ ] The counter screen shows a low-key note when the customer in front of you has a stale card — it
      must **not** look like a warning or a verdict, and must never suppress the serve action
- [ ] A count badge for the list is shown on the home screen
- [ ] Verify in browser using dev-browser skill

### US-13.5: E2E — a birthday changes the numbers

**Acceptance Criteria:**

- [ ] Playwright spec with a controllable clock: a customer with a 12-year-old member shows counts
      1/1, a given portion allowance and price
- [ ] Advance the clock past the member's 13th birthday, reload, and assert counts are 2/0 with the
      updated portions and price — **with no user action in between**
- [ ] Assert the customer now appears on the cards-due list, is still servable at the counter, and
      disappears from the list after a reissue

## 4. Functional Requirements

- FR-1: The grown-up/children split must be computed from birthdates every time it is displayed, and
  must never be stored as an editable number.
- FR-2: A member must count as a grown-up **on** their 13th birthday; the day before, they are a child.
- FR-3: Portion allowance and price must follow the new counts with no staff action.
- FR-4: A customer whose card counts no longer match must appear on a "cards due for reissue" list.
- FR-5: A stale card must never be grounds to turn anyone away.
- FR-6: Reissuing from that list must follow US-09's numbering and remove the customer from the list.
- FR-7: The counts stored on a card must be documented as a print snapshot, never as household truth.

## 5. Non-Goals

- No scheduled job, cron, or background task — the reclassification is a read-time derivation.
- No notification, e-mail or alert when a birthday passes.
- No automatic card reissue.
- No age thresholds other than 13.
- No history of past household compositions (explicitly out of scope in the domain analysis).

## 6. Design Considerations

- The tone of the reissue list matters: it is a to-do list, not an alert queue. Anything that looks
  urgent will train staff to ignore it, or worse, to turn customers away.
- Show both count sets side by side so staff can see at a glance what changed.

## 7. Technical Considerations

- The card count snapshot is the only deliberate denormalisation in the model. It exists because the
  **physical card** is a real artefact with printed numbers on it, and the list compares reality to
  that artefact. Without it there is nothing to compare against.
- Correctness here rests entirely on the injectable clock. Any code path that reaches for
  `new Date()` breaks the testability the whole story depends on.

## 8. Success Metrics

- Zero staff effort spent tracking birthdays.
- Portions and price are never wrong because of an unnoticed birthday.
- Every boundary case (day before / day of / day after / 29 February) has a named passing test.

## 9. Open Questions

- Should the list also cover customers whose card is stale because their **group** changed (US-16.4)?
  The card prints the group too. Assumed yes, with reason `GROUP_CHANGE` — worth confirming.
- Should blocked customers appear on the list? Assumed no (they are not collecting), but they will
  need a card when unblocked.
- Is 1 March the right convention for a 29 February birthdate, or does FD expect 28 February?
