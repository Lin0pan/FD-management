# PRD: Step through today's group at the counter (US-21)

## Introduction

The counter is driven by one control: a staff member types a number and reads the verdict
(US-04). That is the right control when a household hands over a card, and the wrong one when
nobody has. Staff do not know which numbers belong to Rot and which to Blau — the group is the
software's decision (US-01), not something anyone memorises — so working through a group means
guessing numbers and reading `NOT_FOUND` or `WRONG_GROUP` until one lands.

This PRD adds two buttons beside the number field: **Zurück** and **Weiter**. They walk today's
group in customer-number order, so a staff member can serve their way down it without knowing a
single number. Typing a number still works and still jumps anywhere — the buttons are a second
way in, never a replacement.

Nothing about serving changes. The buttons navigate; they record nothing.

## Goals

- **Weiter** shows the next household of today's group by customer number, **Zurück** the previous.
- With nothing looked up yet, **Weiter** shows the **first** household of today's group.
- At either end of the group the corresponding button is **disabled** and says so in words, so a
  staff member can tell the group has been walked rather than guessing.
- Typing a number keeps working exactly as it does today, including the `50k3` card form.
- No hand-out, reminder, status change or audit entry is written by any of this — navigation is a
  read, like the lookup it drives (US-04, FR-4).

## User Stories

### US-021.1: `neighbours` — the number before and after one, in a set of numbers (domain)

**Description:** As a developer, I want a pure function that answers "which number comes before this
one, and which after" for a set of customer numbers, so the walk has one rule rather than one per
screen.

**Acceptance Criteria:**

- [ ] New module `src/domain/distribution/groupWalk.ts` exporting
      `neighbours(numbers: ReadonlyArray<number>, from: number | null): Neighbours`, with
      `Neighbours = { readonly previous: number | null; readonly next: number | null }`.
- [ ] `next` is the **smallest** number in `numbers` strictly greater than `from`, or `null` when
      there is none.
- [ ] `previous` is the **largest** number in `numbers` strictly less than `from`, or `null` when
      there is none.
- [ ] `from === null` gives `{ previous: null, next: <smallest number> }` — the entry point for a
      screen where nothing has been looked up yet.
- [ ] `from` need **not** be a member of `numbers`. `neighbours([10, 20, 30], 15)` is
      `{ previous: 10, next: 20 }`: the comparison is numeric, not positional, so a number belonging
      to the other group or to nobody still has a place in the walk.
- [ ] The function does **not** assume `numbers` is sorted — it scans for the two extremes. A pure
      function that silently required sorted input would state the list's order in a second place.
- [ ] An empty `numbers` gives `{ previous: null, next: null }` at every `from`.
- [ ] Strict TDD, invariant-breaking test first, one named test per rule. The named boundary cases
      are: empty set; `from` null; `from` below every number; `from` above every number; `from`
      between two; `from` equal to the first, a middle and the last member; and an unsorted input
      answering the same as its sorted form.
- [ ] Domain coverage stays at 100%.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-021.2: `readGroupRoster` — today's group, and where the shown number sits in it (application)

**Description:** As a staff member, I want the two buttons to know which group is collecting and who
is in it, so that pressing them is one click and not a lookup I have to phrase.

**Acceptance Criteria:**

- [ ] New use case `src/application/distribution/read-group-roster.ts` exporting
      `readGroupRoster(deps, rawQuery?: string): Promise<GroupRosterView>`.
- [ ] The group walked is the week's own: `getWeekColour(deps)`'s `colour`. On a distribution day
      that is today's group; on any other day it is the group of the week being read in, which is
      what the banner badges beside the calendar week. The screen must never name two groups.
      `[amended]` — this read `nextDistribution.colour` until DF walked the counter between two
      distributions and met red households under a badge saying the week was blue.
- [ ] Membership is every customer of that group with status `ACTIVE` **or** `BLOCKED`, read through
      the existing `CustomerRepository.list({ statuses, group })`. **No new port method**: the
      adapter already answers this query and already orders it by customer number.
- [ ] `ARCHIVED` households are excluded. They no longer hold the slot, and the counter's own lookup
      of a freed number is a different question (US-04.2).
- [ ] `rawQuery` is read with the domain's `counterQueryOrNull` (`src/domain/card/cardNumber.ts`):
      `50` and `50k3` both mean the number 50, and anything unreadable — or an absent query — means
      `null`, which is "nothing looked up yet" and never an error.
- [ ] `GroupRosterView` carries `{ group, previous, next, isEmpty }` where `previous` and `next` are
      customer **numbers** or `null`, computed by `neighbours` from US-021.1.
- [ ] `isEmpty` is true exactly when the group holds no active or blocked household — a state the
      screen states in words rather than showing two dead buttons.
- [ ] Nothing is written: no audit entry, no status change, no record. The use case calls only
      reading methods.
- [ ] `@throws {NoSettingsInForce}` when no settings version had taken effect today — the same
      failure the banner already has, handled by the same error card.
- [ ] TDD against hand-written fakes; no mocking library. Named tests for: the group is the current
      week's and not the next distribution's on a non-distribution day; archived households are not walked;
      blocked households **are** walked; a card number resolves to its customer number; an
      unreadable query walks from the start; an empty group.
- [ ] Application coverage stays at 100%.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-021.3: Zurück and Weiter beside the number field (presentation)

**Description:** As a staff member, I want to click through the group at the counter without knowing
any of its numbers.

**Acceptance Criteria:**

- [ ] `/ausgabe` renders two controls in the counter card, on the same row as `Nachschlagen` and
      after it: `data-testid="walk-previous"` and `data-testid="walk-next"`.
- [ ] Each is a `<Button variant="outline" asChild>` wrapping a `<Link href="/ausgabe?nummer=N">`
      when the neighbour exists — a GET navigation, like every other move on this screen, so the
      browser's Back button still retraces the queue.
- [ ] When the neighbour is `null` the control renders as a plain **disabled** `<Button>` carrying
      the same testid, so a spec can assert `toBeDisabled()` and the row does not change width as
      staff walk. (This screen's `toHaveCount(0)` convention is about controls that must not exist;
      an end-of-group button must be _seen_ to be unavailable.)
- [ ] A hint line under the row, `data-testid="walk-hint"`, names the group being walked and, when
      nothing has been looked up, says that **Weiter** starts at the first number of that group.
- [ ] At the end of the group the hint says so; when the group is empty, both buttons are disabled
      and the hint says the group holds no household.
- [ ] The group is named in **words** in that hint, wearing `GROUP_STYLES` from `src/app/accents.ts`
      if it is tinted at all — a colour never travels without the word (US-03.4).
- [ ] The number field, its `autoFocus`, its `id="counter-input"` and the `Nachschlagen` button are
      unchanged, and typing a number still works after a walk.
- [ ] Every German string is a new key under `de.distribution.walk` in `src/i18n/de.ts`. No literal
      in the component.
- [ ] The page stays a server component: no `"use client"`, no client state. The buttons are links.
- [ ] `document.documentElement.scrollWidth - clientWidth` is `0` at 1920, 1280, 1024, 800 and 390 —
      the counter row now holds four controls and is the widest thing on the screen.
- [ ] `npm run lint` and `npm run typecheck` pass.
- [ ] Verified with the `playwright-cli` skill against a **production** build, reading the
      **accessibility snapshot**: both controls must be announced as links (or as disabled buttons at
      the ends) with distinct names, and the hint must be readable text rather than a tooltip.

### US-021.4: E2E — walking a group of known numbers

**Description:** As a developer, I want the walk proved against the built app, because its whole
value is the order it produces and no unit test can see the links.

**Acceptance Criteria:**

- [ ] New spec `tests/e2e/group-walk.spec.ts`, serial, pinning the clock through the
      `FD_FIXED_NOW_FILE` seam the way `distribution.spec.ts` does, and deleting the file in
      `afterAll`.
- [ ] The clock is pinned to a **RED** distribution day (`2026-01-08`, from the seeded anchor
      `2026-W02` = RED, Thursday) so the group under walk is fixed.
- [ ] The spec seeds its own contiguous block of RED households through Prisma in a high, otherwise
      unused number band, so no other spec's registrations can land between them. Synthetic data
      only (Faker), as `counter.spec.ts` does.
- [ ] Asserts: from the lowest of the block, `walk-next` leads to the next one up; from the highest,
      `walk-previous` leads back down; a blocked household in the block **is** walked; an archived
      one is **skipped**.
- [ ] Asserts the entry point: with `/ausgabe` opened and nothing looked up, `walk-next` points at
      the lowest active-or-blocked RED number, read from the database in the spec rather than
      hard-coded.
- [ ] Asserts the ends: on the highest RED number in the register, `walk-next` is disabled; on the
      lowest, `walk-previous` is disabled.
- [ ] Asserts a walk **records nothing**: a database snapshot before and after a walk across the
      block is identical, exactly as `counter.spec.ts` does for the lookup (US-04, FR-4).
- [ ] `npm run test:e2e` passes in full, with no other spec file modified.

## Functional Requirements

- **FR-1:** The group walked is always the **current week's** group — today's on a distribution day,
  and on any other day the group of the week it is read in, the one badged beside the calendar week.
  It does **not** follow the group of the household on screen, and it does **not** run ahead to the
  next distribution's group. `[amended]` — the original said "the group the banner names", which was
  `nextDistribution.colour`; on the days after a distribution that walked next week's households
  under a badge naming this week's colour.
- **FR-2:** The walk covers customers of that group with status `ACTIVE` or `BLOCKED`, ordered by
  customer number ascending. `ARCHIVED` customers are never walked.
- **FR-3:** **Weiter** navigates to the smallest walked number strictly greater than the number
  currently looked up; **Zurück** to the largest strictly smaller one.
- **FR-4:** When no number is looked up, **Weiter** navigates to the smallest walked number and
  **Zurück** is unavailable.
- **FR-5:** A looked-up number that belongs to the **other** group, or to nobody, still positions the
  walk: the neighbours are the ones numerically around it. Looking up a Rot household on a Blau day
  and pressing **Weiter** gives the smallest Blau number above it.
- **FR-6:** A card number (`50k3`) positions the walk at customer number 50; the card index is
  dropped.
- **FR-7:** **Weiter** does **not** skip households that have already collected today. The sequence a
  staff member walks must not change under them as they work.
- **FR-8:** At either end of the group the corresponding control is rendered **disabled**, never
  hidden and never wrapping to the other end.
- **FR-9:** Navigation is a `GET` to `/ausgabe?nummer=N`. Nothing is written — no record, no
  reminder, no audit entry.
- **FR-10:** The typed lookup keeps working unchanged, including its keyboard-only loop: type,
  Enter, read, and the field comes back empty and focused.
- **FR-11:** All German strings live in `src/i18n/de.ts` under `de.distribution.walk`.

## Non-Goals

- **Not** a queue, a call-up order or a "who is next in the room" feature. The order is the customer
  number's, which is the order staff already think in (US-15, FR-6); the software makes no claim
  about who is actually standing outside.
- **Not** skipping the already-served. That was considered and rejected: see FR-7.
- **Not** wrapping around at the ends. A silent loop gives a staff member no way to tell they have
  walked the whole group.
- **Not** following the shown household's group. It follows the week's, so the screen never names two
  groups at once.
- **Not** a keyboard shortcut. The field is autofocused and Enter is spoken for; a hidden accelerator
  is a second, undocumented way to do this.
- **Not** a new port or a schema change. `CustomerRepository.list` already answers the query.
- **Not** a change to the verdict, the serve action, the certificate controls or the record link.
- **Not** the group tally and its list — that is `prd-us-23-group-progress.md`, which builds on this
  one.

## Design Considerations

- The two buttons belong **in the counter card**, on the row with the number field, because they are
  the same act as typing a number: they decide who the screen is about. Putting them next to the
  verdict would suggest they act on the household shown.
- `variant="outline"` for both: typing a number is the primary path and `Nachschlagen` keeps
  `default`. Two more solid buttons on that row would make the row read as three equal choices.
- The controls sit **after** `Nachschlagen`, so the tab order is number → look up → walk. A staff
  member working the keyboard never tabs through navigation to reach the field they type in.
- `radix-nova` defaults to `h-8`; the counter's controls are deliberately taller (`h-12` on the field
  and the submit). Match that height so the row has one baseline — see `docs/ui_conversion_guide.md`,
  "Findings from the pilot".
- The hint is one line and must stay one line at 1024 and above. It names the group; do not let it
  grow into an explanation of the walk.

## Technical Considerations

- `src/app/ausgabe/page.tsx` gains one more `await` in the existing `Promise.all` — the walk view is
  independent of the lookup and must not be sequenced behind it.
- `readGroupRoster` calls `getWeekColour` a second time on the same request. That is a settings-history
  read, not a customer query, and the page already resolves the colour twice today; if it ever
  matters, the fix is to pass the resolved view in, not to cache.
- `CustomerRepository.list` loads households, certificates and cards for every row it answers with —
  roughly 120 for a group. At DF's ~240 customers that is one query of a few hundred rows and is the
  same read `/kunden` performs on every visit. If it ever needs narrowing, add a numbers-only port
  method then, with the measurement that justified it.
- The `Group` union on a customer and the `WeekColour` union in settings are compared directly by
  `evaluateAtCounter` already; the walk uses the same comparison and does not introduce a mapping.
- `counterQueryOrNull` already exists and already returns `null` rather than throwing — use it, do
  not add a second parser.

## Success Metrics

- A staff member can serve a whole group without typing a number, and without ever seeing
  `NOT_FOUND` or `WRONG_GROUP` from a guess.
- Walking from the first to the last household of the demo register's Rot group produces the numbers
  in ascending order with no gaps and no repeats — checked by hand in `playwright-cli` as well as by
  the spec.
- Zero database writes during a walk, proved by the before/after snapshot in US-021.4.
- The counter row does not overflow at 800px.

## Open Questions

- **Should the walk state where in the group you are** ("14. von 61")? It is one more number on the
  busiest screen in the product, and US-23's tally answers a related question one card above. Left
  out deliberately; revisit only if staff report losing their place.
- **Should Zurück, with nothing looked up, go to the last household of the group?** Currently
  disabled, because "back from nowhere" has no obvious meaning. If staff turn out to work the group
  from the top down, this is the cheapest thing to change.
- **Does the walk want to include archived households after all?** No screen suggests it today, but a
  household archived mid-distribution is a case nobody has hit yet.
