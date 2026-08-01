# PRD: US-03 — Know Which Group Collects Today

> Source story: `docs/user_stories_mvp.md` §US-03 (Tier 1). Depends on **US-14** (anchor week and
> distribution weekday). Feeds **US-04** (the wrong-group verdict).

## 1. Introduction

FD splits its customers into a Red and a Blue group to spread the load: Red customers collect in a
Red week, Blue customers in a Blue week, and the two strictly alternate. Two consecutive weeks of the
same colour would be considered unfair and must be impossible by construction.

The colour is therefore **derived from the calendar** by alternation from a configured anchor week,
never typed in per week. This feature makes today's colour unmissable on the distribution screen.

> **Withdrawn by US-22:** this PRD also shipped a date control on `/ausgabe` that answered for any
> past or future week. FD say they never needed it — the counter asks about **now** — so it was
> removed, along with its strings and its specs
> (`tasks/prd-us-22-drop-week-colour-lookup.md`). The three places it was asked for below are marked
> `[withdrawn by US-22]` rather than deleted. **The capability itself is not withdrawn:**
> `getWeekColour(deps, date?)` keeps its optional date parameter and its
> settings-in-force-at-that-date behaviour, because `lookupCustomer` and `recordAttendance` both pass
> an explicit instant — §US-03.3 and FR-6 stand unchanged. Only the way a human reached it is gone.

## 2. Goals

- Today's colour is visible at a glance, without interpretation.
- The colour is a pure function of the date and the configured anchor — no stored per-week rows.
- Two consecutive weeks can never share a colour, provably.
- Off-day, the screen says which colour is next and when, instead of going blank.

## 3. User Stories

### US-03.1: `weekColour` calendar rule (domain)

**Description:** As a developer, I need a pure function from a date to a week colour, so the
alternation is testable without a database.

**Acceptance Criteria:**

- [ ] `src/domain/distribution/weekColour.ts` exports `colourOf(date, anchor)` where `anchor` is
      `{ isoWeek: string; colour: 'RED' | 'BLUE' }` from settings
- [ ] The colour flips on every ISO week boundary; parity is computed from the ISO week difference to
      the anchor
- [ ] `colourOf` is total for dates before the anchor as well as after (negative parity handled —
      test a date one, two and fifty-three weeks **before** the anchor)
- [ ] Property test: for any date, `colourOf(d) !== colourOf(d + 7 days)` — the invariant that makes
      "two same-coloured weeks in a row" impossible
- [ ] Tests cover ISO week edge cases: Sunday→Monday boundary, 1 January in weeks 52/53 of the prior
      ISO year, and a 53-week year (e.g. 2026 → check against a reference ISO calendar)
- [ ] Uses ISO-8601 week numbering (weeks start Monday), documented in a comment

### US-03.2: `isDistributionDay` and `nextDistribution` (domain)

**Description:** As a staff member, I want the app to know whether today is a distribution day and,
if not, when the next one is and what colour it will be.

**Acceptance Criteria:**

- [ ] `isDistributionDay(date, weekday)` compares against the configured ISO weekday
- [ ] `nextDistribution(date, settings)` returns `{ date, colour }` for the next distribution day at
      or after `date`
- [ ] On a distribution day, `nextDistribution` returns **today**, not next week
- [ ] Tests cover: the day before, the day of, and the day after a distribution day; a configured
      weekday of Sunday (ISO 7)

### US-03.3: `getWeekColour` use case (application)

**Acceptance Criteria:**

- [ ] `getWeekColour(deps, date?)` resolves settings at that date, then delegates to the domain
- [ ] Defaults to `deps.clock.now()` when no date is given
- [ ] If the anchor changes in a later settings version, a lookup for a past date uses the anchor in
      force **then** — tested explicitly
- [ ] No persistence port needed beyond `SettingsRepository`; no week rows are ever stored

### US-03.4: Week colour banner (presentation)

**Description:** As a staff member, I want the distribution screen to state today's colour
prominently.

**Acceptance Criteria:**

- [ ] The distribution screen shows a large German banner: today's colour, or on a non-distribution
      day "Heute ist keine Ausgabe — nächste Ausgabe: <date>, <colour>"
- [ ] The colour is conveyed by **text plus** colour, never colour alone (accessibility; several
      staff, one shared screen, variable lighting)
- [ ] ~~A date picker lets staff look up the colour of any past or future week, showing the ISO week
      number alongside~~ `[withdrawn by US-22]` — built, then removed: FD do not need any week but
      this one, and the card sat on the busiest screen in the product pushing the counter's own
      results down. The ISO week number stays on the banner, which is where staff check it against a
      wall calendar.
- [ ] The banner is the visually dominant element on the screen
- [ ] Verify in browser using dev-browser skill

### US-03.5: E2E — colour banner with a fixed clock

**Acceptance Criteria:**

- [ ] Playwright spec drives the app with a fixed clock (injected via env or a test-only clock
      override) and asserts the banner text for: a Red distribution day, the following week (Blue),
      and a non-distribution weekday
- [ ] ~~Spec asserts the look-up control returns the expected colour for a date two years out~~
      `[withdrawn by US-22]` — the control is gone, so the test was deleted rather than skipped. In
      its place `distribution.spec.ts` proves the opposite property: a URL still carrying the old
      `?datum=` is **inert**, rendering the ordinary banner and no error. A week two years out is
      still proved to alternate correctly, in the domain where the rule lives
      (`weekColour.test.ts`, §US-03.1).

## 4. Functional Requirements

- FR-1: The application must show today's week colour prominently on the distribution screen.
- FR-2: The colour must be derived from the calendar by strict alternation from a configured anchor
  week; it must never be entered per week.
- FR-3: Two consecutive weeks must never share a colour.
- ~~FR-4: A staff member must be able to look up the colour of any past or future week.~~
  **Withdrawn by US-22** (`tasks/prd-us-22-drop-week-colour-lookup.md`). FD's answer, asked
  explicitly, is that nobody at FD needs a past or future week's colour anywhere — so this is a
  retraction, not a relocation. `/ausgabe` must now offer **no** control for any day but the one it
  is showing, and the `datum` search parameter must be ignored entirely rather than refused. FR-6
  is unaffected: the colour of any date is still computed, only never asked for by a human.
- FR-5: On a non-distribution day, the screen must state which colour is next and on which date.
- FR-6: An answer for a past date must use the anchor configuration that was in force on that date.
  `getWeekColour(deps, date?)` therefore keeps its optional date parameter after US-22 —
  `lookupCustomer` and `recordAttendance` pass an explicit instant, so it is load-bearing on the
  counter's own path and must stay tested (§US-03.3).
- FR-7: Colour information must never be conveyed by colour alone.

## 5. Non-Goals

- No holiday or cancellation calendar — a skipped distribution week does not shift the alternation
  (the rule is calendar parity, not "every actual distribution").
- No per-week notes or scheduling.
- No support for more than two groups.

## 6. Technical Considerations

- ISO week arithmetic is a classic source of off-by-one bugs. Implement week-difference arithmetic on
  UTC-normalised dates and test against a reference ISO calendar rather than trusting intuition.
- Everything here reads "now" through the `Clock` port; the domain functions take dates as parameters.

## 7. Success Metrics

- A staff member can name today's colour within one second of looking at the screen.
- The alternation property test passes for a swept range of several years of dates.

## 8. Open Questions

- If a distribution is cancelled (holiday, weather), does the alternation continue by calendar as
  assumed here, or does FD shift it? **Confirm with FD** — the assumption is calendar-driven.
- Is the distribution weekday ever different in a given week (e.g. moved for a public holiday)?
