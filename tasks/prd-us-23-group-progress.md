# PRD: How far through the group we are, and who is still missing (US-23)

## Introduction

During a distribution the counter answers one household at a time and remembers nothing between
them. Two questions staff have all afternoon are therefore unanswerable from the screen they are
standing at: **how many of today's group have collected**, and **who has not yet**. In the
spreadsheet both were a glance at a column of ticks; in the app the same facts exist — one
distribution record per household per day (US-05) — and nothing shows them.

This PRD puts the tally on `/ausgabe` as one line — _Gruppe Rot: 34 von 61 Haushalten abgeholt_ —
and folds the group's list behind it. Opening it shows every household of today's group in customer
number order, with the ones already served marked; clicking a name looks that household up, which
is the same act as typing their number.

It reads and derives, and writes nothing. It builds directly on the roster
`prd-us-21-step-through-group.md` introduces: **US-21 must be merged before this starts.**

## Goals

- The share of today's group that has collected is on the distribution screen, always visible, one
  line tall while closed.
- Opening that line lists the group: number, name, and whether they have collected today.
- Clicking a name looks the household up on the same screen — the list is a way _into_ the counter,
  not a screen of its own.
- The tally cannot exceed its own total, on any data the register can be in.
- Nothing is stored: the tally is counted from today's records on every read, like every other
  figure on this screen.

## User Stories

### US-023.1: `groupProgress` — how many of a roster collected today (domain)

**Description:** As a developer, I want one pure rule for the tally, so the number in the summary and
the marks in the list can never tell different stories.

**Acceptance Criteria:**

- [ ] New module `src/domain/distribution/groupProgress.ts` exporting
      `groupProgress(entries: ReadonlyArray<ProgressEntry>): Progress`, with
      `ProgressEntry = { readonly blocked: boolean; readonly servedToday: boolean }` and
      `Progress = { readonly served: number; readonly expected: number }`.
- [ ] `served` counts every entry with `servedToday`.
- [ ] `expected` counts every entry that is **not blocked**, **plus** every blocked entry that has
      `servedToday`. A blocked household cannot collect (US-08), so counting it in the denominator
      would put the tally permanently out of reach; but a household blocked _after_ they collected
      this morning did collect, and dropping them from the denominator alone would make `served`
      exceed `expected`.
- [ ] The invariant `served <= expected` holds for every combination of the two flags, with a named
      test that says so.
- [ ] An empty roster gives `{ served: 0, expected: 0 }`.
- [ ] Strict TDD, invariant-breaking test first. Named tests: nobody served; everybody served; a
      blocked household is not expected; a blocked household who was served counts in both; the
      invariant across all four flag combinations.
- [ ] Domain coverage stays at 100%.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-023.2: `listForDay` — every hand-out written on one Berlin day (ports + infrastructure)

**Description:** As a developer, I want the day's records in one query, because the roster is ~120
households and one query per household would make the counter's main screen the slowest in the app.

**Acceptance Criteria:**

- [ ] `DistributionRecordRepository` in `src/application/ports.ts` gains
      `listForDay(dayKey: string): Promise<ReadonlyArray<DistributionRecord>>`.
- [ ] The parameter is a **Berlin day key** as `berlinDayKey` writes it (`YYYY-MM-DD`), the same
      notion of "the same day" the once-per-day rule and the unique constraint already use. The
      adapter must not re-derive a day from an instant.
- [ ] The adapter in `src/infrastructure/prisma/distribution-record-repository.ts` implements it as a
      single `findMany({ where: { dayKey } })`, mapped through the existing `toRecord`. The `dayKey`
      column keeps not leaving the adapter in any other shape.
- [ ] Thin integration test against a throwaway SQLite file, following the file's existing pattern:
      records on the asked-for day are returned; records on the day before and after are not; an
      empty day returns `[]`.
- [ ] **No schema change and no migration.** The table has no index on `dayKey` alone and does not
      need one at roughly 240 rows a week; adding one is a decision for the day a measurement asks
      for it, not for this PRD.
- [ ] The existing `listForCustomer`, `findById`, `create`, `setPaid` and `remove` are untouched.
- [ ] `npm run lint`, `npm run typecheck` and `npm run test:coverage` pass.

### US-023.3: The roster carries who they are and whether they collected (application)

**Description:** As a staff member, I want one read to answer who is in today's group and which of
them have been served, so the screen shows one consistent picture of the afternoon.

**Acceptance Criteria:**

- [ ] `readGroupRoster` in `src/application/distribution/read-group-roster.ts` (US-21) is **extended**
      — not replaced and not renamed. `GroupRosterView` gains `members` and `progress`.
- [ ] `members` is `ReadonlyArray<GroupRosterMember>` with
      `{ customerId, customerNumber, firstName, lastName, blocked, servedToday }`, in the order the
      repository answered — lowest customer number first. Nothing here re-sorts it.
- [ ] `servedToday` is true when the day's records hold one for that customer, read through
      **one** call to `listForDay(berlinDayKey(clock.now()))` and joined by `customerId` in memory.
      Never one query per member.
- [ ] `progress` is `groupProgress(members)` from US-023.1.
- [ ] `previous`, `next`, `group` and `isEmpty` keep the meanings US-21 gave them, and US-21's tests
      keep passing unchanged.
- [ ] The use case still writes nothing: no audit entry, no status change, no record.
- [ ] TDD against hand-written fakes. Named tests: a member with a record today is served; a member
      with a record from yesterday is not; a member with no record is not; the day compared is the
      **Berlin** day, tested at 23:30 Berlin on a day whose UTC date is already the next one; a
      blocked member appears in `members` and not in `expected`; the records of customers from the
      _other_ group are ignored.
- [ ] Application coverage stays at 100%.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-023.4: The tally, and the group list behind it (presentation)

**Description:** As a staff member, I want to see how far through the group we are, and to open the
list to find who is still missing and call them up.

**Acceptance Criteria:**

- [ ] `/ausgabe` renders a `Card` between the banner and the counter card, holding a
      `<details>`/`<summary>` disclosure that renders **closed**.
- [ ] The summary is one line: the group in words, the number served and the total —
      `data-testid="group-progress"` on the element holding exactly that sentence.
- [ ] Closed, the card is **≤ 80px** tall at 1440×900, measured. It sits above the counter, so every
      pixel it takes is a pixel the verdict loses.
- [ ] Opening it reveals the group's households in customer-number order, each row carrying:
      the customer number, the household's name, and — when served — the word `abgeholt` in a
      `<span data-testid="served-<customerNumber>">`.
- [ ] The served mark is a **word**; any icon beside it (lucide `Check`) is `aria-hidden`. A tick
      alone is chrome, and chrome never travels without the word (US-03.4, guide rule 9).
- [ ] Only the **served** rows are marked. The unserved are the default state and get the name and
      nothing else — "chrome marks the exception" (`docs/ui_conversion_guide.md`).
- [ ] A blocked household's row says `gesperrt`, rendered the way `/kunden` already says it
      (`StateWord` in `src/app/kunden/page.tsx`) rather than with a new treatment.
- [ ] Each row's name is a `<Link href="/ausgabe?nummer=<customerNumber>">` — clicking it looks that
      household up on this screen, exactly as typing the number would, and the disclosure returns
      closed on the new page load.
- [ ] The list scrolls inside its own container (`max-h-*` + `overflow-y-auto`) rather than pushing
      the counter down the page; at ~120 rows it must never make the page itself taller than the
      closed state plus that cap.
- [ ] The list is laid out in columns at wide widths (e.g. `sm:grid-cols-2 lg:grid-cols-3`) so a
      group of 120 is scannable, and stacks below `sm`.
- [ ] An empty group states so in words instead of rendering an empty disclosure.
- [ ] Every German string is a new key under `de.distribution.progress` in `src/i18n/de.ts`.
- [ ] The page stays a server component: the disclosure is `<details>`, not `Dialog` and not client
      state (guide rule 4 — at the counter nothing may have to be dismissed before the next customer
      is served).
- [ ] `document.documentElement.scrollWidth - clientWidth` is `0` at 1920, 1280, 1024, 800 and 390.
- [ ] `npm run lint` and `npm run typecheck` pass.
- [ ] Verified with the `playwright-cli` skill against a **production** build, reading the
      **accessibility snapshot**: the summary is announced with the full sentence (not "Gruppe" and
      "34" as separate nodes), each row's link is named with the number and the name, and each served
      row announces the word.

### US-023.5: E2E — the tally moves when a household is served

**Description:** As a developer, I want the tally and the marks proved against the built app, because
their value is that they agree with what just happened at the counter.

**Acceptance Criteria:**

- [ ] New spec `tests/e2e/group-progress.spec.ts`, serial, pinning the clock to a **RED distribution
      day** (`2026-01-08`) through the `FD_FIXED_NOW_FILE` seam and deleting the file in `afterAll`,
      as `distribution.spec.ts` does.
- [ ] Seeds its own RED households through Prisma with synthetic data (Faker), in a high, otherwise
      unused number band, including one blocked household.
- [ ] Reads the expected `served`/`expected` figures from the database rather than hard-coding them —
      the shared register is written by other specs, so a literal would be a flake waiting to happen.
- [ ] Asserts: `group-progress` states the group in words and both figures; serving one of the seeded
      households through the UI raises `served` by exactly one on the next load; that household's row
      then carries `served-<number>`; a household not served has no such element.
- [ ] Asserts the blocked household appears in the list, is marked `gesperrt`, and is **not** counted
      in `expected`.
- [ ] Asserts clicking a name in the list produces that household's verdict banner on `/ausgabe`.
- [ ] Asserts opening and closing the disclosure records nothing: a database snapshot before and
      after is identical.
- [ ] `npm run test:e2e` passes in full, with no other spec file modified.

## Functional Requirements

- **FR-1:** `/ausgabe` must state, without any interaction, how many households of the group the
  banner names have collected today and how many are expected.
- **FR-2:** The group is the banner's — today's on a distribution day, the next distribution's
  otherwise — and is named in words wherever it is painted.
- **FR-3:** The list must show every household of that group with status `ACTIVE` or `BLOCKED`, in
  ascending customer-number order. `ARCHIVED` households never appear.
- **FR-4:** A household counts as served when a distribution record exists for them on today's
  **Berlin** calendar day — the same day the once-per-day rule uses.
- **FR-5:** `expected` counts the households that may collect: the non-blocked ones, plus any blocked
  household that has already collected today. `served` may never exceed `expected`.
- **FR-6:** Every row must name whether that household has collected; the state is carried by a word,
  never by an icon or a colour alone.
- **FR-7:** Clicking a household's name must look that household up on `/ausgabe`, identically to
  typing their number.
- **FR-8:** Nothing about the tally is stored. It is counted on every read from the day's records.
- **FR-9:** No screen may write anything as a result of opening, closing or reading the list.
- **FR-10:** The closed disclosure must not push the counter's number field below the fold at
  1440×900.
- **FR-11:** All German strings live in `src/i18n/de.ts` under `de.distribution.progress`.

## Non-Goals

- **Not** a no-show list or a decision aid. The list states who has not collected _yet_, at 14:00 on
  a distribution day; it draws no conclusion, and the consecutive-no-show count that feeds archiving
  is a different, already-built figure (US-10.1) computed over past distributions.
- **Not** a printable or exportable attendance sheet. DF asked for an overview at the counter.
- **Not** a live-updating figure. The page renders per request (`dynamic = "force-dynamic"`); a staff
  member sees the tally as of the load, and every serve reloads the screen anyway. No polling, no
  websocket.
- **Not** a second place to serve someone. The list navigates; the verdict and the serve control stay
  where they are, so nobody is ever served without their verdict having been read.
- **Not** a tally for the _other_ group, or for a past distribution. Both are reports, and this is a
  counter screen.
- **Not** a schema change, an index or a stored counter (FR-8).
- **Not** the group walk — that is `prd-us-21-step-through-group.md`, which this depends on.

## Design Considerations

- **Placement:** directly under the banner and above the counter. It is a fact about today, like the
  banner, and it must be readable without scrolling past the thing staff are typing into. The cost is
  that it pushes the counter down, which is why the closed height is a measured criterion — and why
  `prd-us-22-drop-week-colour-lookup.md` should land first, freeing more space than this card takes.
- **The summary is the tally**, not a label that hides one. A staff member must never have to open
  the disclosure to learn the number; opening it answers the _second_ question, who.
- **A `<summary>` can be made to read as a control** without ceasing to be one — the
  `buttonVariants` + `w-fit` + `list-none` recipe from `/karten-neuausstellung` is in
  `docs/ui_conversion_guide.md`. Here the summary spans the card header rather than being a small
  button, so `w-fit` is likely **wrong**; compare the two disclosures the guide contrasts before
  choosing.
- **Colour budget:** the group's tint is already on the banner immediately above. Do not paint the
  card or the rows; the group's word in the summary is enough, and 120 tinted rows would be texture
  rather than emphasis.
- Two figures that are read together (`34` and `61`) belong in one sentence in one node — a screen
  reader must not announce them as unrelated fragments, and a `<p>` split into styled spans is the
  trap the guide's "A label and its value must stay in one node" describes.
- Use `tabular-nums` on the customer numbers so the column of numbers reads as a column.

## Technical Considerations

- **Depends on US-21 being merged.** Both change `src/app/ausgabe/page.tsx` and this one extends
  US-21's use case; starting before it lands means branching from a `main` without the roster.
- The page's existing `Promise.all` gains no round trip: `readGroupRoster` already loads the group,
  and the day's records are one further query inside it, issued alongside the group read.
- `berlinDayKey` is the only correct way to name the day — `src/domain/distribution/attendance.ts`
  explains at length why this module family compares Berlin days and the week-colour one compares UTC
  days. Do not introduce a third notion.
- The join between the roster and the day's records is by `customerId`, the surrogate id — never the
  customer number, which is a reusable slot attribute.
- `CustomerRepository.list` already returns the households the roster needs; no new customer query
  and no new customer port method.
- The list is 120 links on the counter's critical path. They are plain `<Link>`s in a server
  component, so nothing crosses the client boundary — keep it that way.

## Success Metrics

- A staff member can state how far through the group they are without leaving `/ausgabe` and without
  clicking anything.
- Serving a household changes the tally on the next render, every time — proved by US-023.5.
- Closed card ≤ 80px at 1440×900; open list capped and scrolling, page height unchanged below the
  cap; no horizontal overflow at 390px.
- The roster read stays **two** queries (the group, the day's records) regardless of group size.

## Open Questions

- **Should the list default to open on a distribution day?** It is the day the list is for, and the
  screen has room once the week-colour lookup is gone. Left closed because the counter's field is
  what staff type into and a 120-row list between the banner and that field is a lot of screen.
  Worth revisiting after DF have used it once.
- **Do staff want the unserved filtered on their own** ("wer fehlt noch")? Late in the afternoon that
  is the only part of the list they read. Deliberately not built: it is a third control on the
  busiest screen, and scrolling a marked list may well be enough.
- **What should the tally say on a day that is not a distribution day?** It currently describes the
  _next_ distribution's group, where nobody has collected, so it reads `0 von 61`. That is truthful
  but possibly odd; naming the next distribution's date beside it is the cheap fix if DF find it
  confusing.
