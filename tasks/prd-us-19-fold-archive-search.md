# PRD: Fold the archive search away on `/kunden/neu` (US-19)

## Introduction

`/kunden/neu` carries three things above the form staff came to fill in: the free-slot banner, the
archive search, and the form itself. The archive search exists for a household returning after being
archived (US-11) — which the demo register says happens twice in twenty — and DF have said they
would rather it folded away.

The restyle (PR #62) built it as a `<details open>`: the fold exists, but it starts open, because a
control inside a closed `<details>` has no bounding box and Playwright's `fill()` cannot reach it.
`tests/e2e/reregistration.spec.ts` fills `#archiveLastName` by CSS id, so closing it by default turns
that spec red for a reason that has nothing to do with what the spec is about.

This PRD closes it, and edits the one spec that stands in the way.

**The risk this takes on, stated plainly.** `docs/ui_redesign_kunden_neu.md` §4.2b argues against
closing it: the cost of missing this search is a second record for a household DF already has, which
is the whole of US-11, and a control that must be opened is a control that will be forgotten on the
day it matters. DF were asked and chose to fold it. The mitigation agreed with them is that the
closed summary **asks the question** rather than naming a feature — "War dieser Haushalt schon einmal
aufgenommen?" is on screen whether or not the panel is open, so the prompt to check survives the
fold. That is the whole of the mitigation, and it should be reviewed with DF on the live screen.

## Goals

- The archive search starts **closed** on every load of `/kunden/neu`.
- The prompt to check the archive is legible without opening anything.
- `#firstName` moves from 630px to ≤ 470px with the free-slot banner on screen, at 1440×900.
- `tests/e2e/reregistration.spec.ts` passes, with the disclosure opened the way staff open it.
- No other spec is touched, and the full suite stays green.

## User Stories

### US-019.1: The archive search starts closed and says what it is for

**Description:** As a staff member registering a household, I want the archive search folded away so
that the first field of the form is near the top of the screen, without losing the prompt to check
whether this household was here before.

**Acceptance Criteria:**

- [ ] The archive-search `<details>` on `/kunden/neu` renders **without** the `open` attribute.
- [ ] Its `<summary>` carries `de.customers.archiveSearch.intro` — the question, not the feature
      name — and the `<h2>` in `CardTitle` is kept, so the heading outline is unchanged.
- [ ] The `<summary>` has `data-testid="archive-search-open"` so a spec can click it.
- [ ] Clicking the summary opens the card and reveals the three criteria and `Suchen`.
- [ ] The disclosure is a real `<details>`/`<summary>` — no `Dialog`, no portal (guide rule 4).
- [ ] Any German string added or changed lives in `src/i18n/de.ts`.
- [ ] `npm run lint` and `npm run typecheck` pass.
- [ ] Verified in the browser with the `playwright-cli` skill against a production build: read the
      accessibility snapshot and confirm the summary announces, and that the `<h2>` is still in the
      outline when the panel is closed.

### US-019.2: The one spec that fills the search opens it first

**Description:** As a developer, I want `reregistration.spec.ts` to open the disclosure before it
types into it, so that the suite exercises the control staff actually use.

**Acceptance Criteria:**

- [ ] `tests/e2e/reregistration.spec.ts`'s `searchArchive` helper clicks
      `getByTestId("archive-search-open")` before filling `#archiveLastName`.
- [ ] The click is a real click on the summary, **not** `evaluate(d => d.open = true)`: a fold that
      stopped opening must turn the suite red rather than pass.
- [ ] The helper is idempotent, or the spec never calls it twice against an already-open panel —
      whichever is simpler to read; a second click would close the panel again.
- [ ] No other spec file is modified.
- [ ] `npm run test:e2e` passes in full.

### US-019.3: The height the fold was for

**Description:** As a staff member, I want the form to start near the top of the screen, which is the
only reason to fold anything.

**Acceptance Criteria:**

- [ ] Measured at 1440×900 on the freshly seeded demo register with the free-slot banner on screen,
      the top of `#firstName` is ≤ 470px (it is 630px today, and was 752px before the restyle).
- [ ] The closed archive card is ≤ 90px tall (160px today).
- [ ] `document.documentElement.scrollWidth - clientWidth` is `0` at 1920, 1280, 1024, 800 and 390.
- [ ] `playwright-cli console` reports 0 errors at every width checked.
- [ ] The before and after numbers are in the commit message.

## Functional Requirements

- **FR-1:** The archive-search disclosure on `/kunden/neu` must render closed on every page load.
- **FR-2:** Its `<summary>` must carry the question `de.customers.archiveSearch.intro` and a
  `data-testid` of `archive-search-open`.
- **FR-3:** The `<h2>` inside `CardTitle` must survive the change, closed and open alike.
- **FR-4:** Opening the disclosure must reveal `#archiveLastName`, `#archiveFirstName`,
  `#archiveBirthDate` and `archive-search-submit`, all with their current ids and testids.
- **FR-5:** The open/closed state must **not** be persisted; every load starts closed.
- **FR-6:** `tests/e2e/reregistration.spec.ts` must click the summary by testid before filling, and
  must not use `evaluate` to set `open` directly.
- **FR-7:** No spec other than `reregistration.spec.ts` may be modified by this work.
- **FR-8:** Every result state the panel can reach — `archive-search-count`,
  `archive-search-empty`, `archive-search-truncated`, `archive-prefill-error`, and a match row's
  `archive-match-*` — must still render inside the opened panel with its exact current text.

## Non-Goals

- **Not** changing what the search does, what it returns, or the twenty-match cap.
- **Not** removing the panel, and **not** moving it onto a screen of its own.
- **Not** persisting the fold across page loads or sessions.
- **Not** touching the free-slot banner, which is shared with `/warteliste`.
- **Not** touching the pre-fill notice, the applied-row badge or the focus move — all shipped in
  PR #62 and all outside this change.
- **Not** folding the group radios; that is `prd-us-20-fold-group-choice.md`, and the two are
  separately decidable.

## Design Considerations

- The recipe is the one `/karten-neuausstellung` settled and this repo now uses in four places:
  `cn(buttonVariants({ variant: "outline" }), "w-fit cursor-pointer list-none
[&::-webkit-details-marker]:hidden")`.
- **`w-fit` is wrong when the `<summary>` wraps a `CardHeader`.** This is recorded in
  `docs/ui_conversion_guide.md` and cost 348px of wrapped description during PR #62: shrinking a
  header to its minimum content width wraps the `CardDescription` into a column. Either drop the
  `CardHeader` from inside the summary and make the summary a plain control row, or keep the header
  full width and do not add `w-fit`.
- The card is the panel's boundary either way; a closed disclosure must not read as a collapsed
  section spanning the row.

## Technical Considerations

- `src/app/kunden/neu/archive-search-panel.tsx` is the only component file involved.
- The panel is a **sibling** of the registration form and must stay one: HTML forms do not nest, and
  the search criteria are not part of the registration.
- Playwright's `fill()` and `check()` require a non-empty bounding box; anything that keeps the
  content reachable while closed also keeps it visible, which defeats the fold. The spec edit is the
  only honest route, and both design documents reserve a commit of its own for exactly this.
- `docs/ui_redesign_kunden_neu.md` §12 records why this was left undone in PR #62; update it when
  this ships.

## Success Metrics

- Top of `#firstName` ≤ 470px at 1440×900 with the banner on screen — from 752px before the restyle
  and 630px today.
- Closed archive card ≤ 90px, from 270px before the restyle and 160px today.
- Full e2e suite green with exactly one spec file changed.

## Open Questions

- **Should this be reviewed with DF on the live screen before it merges?** §4.2b's argument is
  strong enough that seeing the folded screen may change their answer. `playwright-cli show
--annotate` is the way to ask.
- **Is one line of prompt enough?** If DF do miss a returning household after this ships, the next
  step is probably auto-opening the panel when the register holds archived households — cheap, and
  it was the runner-up option when they were asked.
