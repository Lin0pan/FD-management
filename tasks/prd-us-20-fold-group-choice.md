# PRD: Fold the group choice away on `/kunden/neu` (US-20)

## Introduction

The registration form proposes a group — RED or BLUE — from the two current group sizes, and offers
two radios to override it. DF say they accept the proposal, so the radios are a permanently visible
control for a decision almost nobody makes, and they take a `Zuordnung` card that could be two lines
and make it five.

The restyle (PR #62) did not fold them. `#group-RED` is `.check()`ed by **three** spec files, and a
radio inside a closed `<details>` has no bounding box, so `check()` retries and times out. PR #62
therefore left the radios visible and gave them `GROUP_STYLES` instead, which was the other half of
`docs/ui_redesign_kunden_neu.md` §3.11.

This PRD folds them, and edits the three specs that stand in the way.

## Goals

- The group choice starts **closed**, with the proposed group readable without opening it.
- The proposal, the two group sizes and the override all stay reachable — nothing is removed.
- The `Zuordnung` card shrinks; `Aufnehmen` rises with it.
- The three specs that override the group pass, having opened the disclosure the way staff would.
- No other spec is touched, and the full suite stays green.

## User Stories

### US-020.1: The proposed group is legible with the choice folded away

**Description:** As a staff member registering a household, I want the group the software proposes to
be on screen without a control to read it through, so that accepting the proposal — which is what I
almost always do — costs no clicks.

**Acceptance Criteria:**

- [ ] The `Gruppe` `<fieldset>` on `/kunden/neu` sits inside a `<details>` that renders **without**
      the `open` attribute.
- [ ] The `<summary>` names the proposed group inline — "Gruppe: Rot — andere Gruppe wählen" — with
      the group word wearing `GROUP_STYLES[proposedGroup]`, so the colour is the printed card's and
      the word travels with it (US-03.4).
- [ ] The `<summary>` carries `data-testid="group-choice-open"`.
- [ ] `de.customers.assignment.suggestedGroup` and `de.customers.assignment.groupSizes` stay visible
      **while closed** — the sizes are what an override is decided from (FR-4 of US-16.4's sibling
      rule), and a staff member must not have to open the control to see whether the register is
      lopsided.
- [ ] Opening the disclosure reveals both radios, with `#group-RED` and `#group-BLUE` unchanged.
- [ ] The radios stay **native** `<input type="radio">` with `defaultChecked` on the proposal: the
      action reads `group` out of the `FormData`, and Radix's `RadioGroup` submits nothing of its
      own (guide rule 3).
- [ ] Submitting without opening the disclosure saves the **proposed** group.
- [ ] Any German string added or changed lives in `src/i18n/de.ts`.
- [ ] `npm run lint` and `npm run typecheck` pass.
- [ ] Verified in the browser with the `playwright-cli` skill against a production build: read the
      accessibility snapshot and confirm the summary announces the proposed group, and that both
      radios are named `radio` elements once opened.

### US-020.2: The three specs that override the group open it first

**Description:** As a developer, I want the three specs that pick a non-proposed group to open the
disclosure before checking a radio, so the suite exercises the control staff use.

**Acceptance Criteria:**

- [ ] `tests/e2e/archive.spec.ts`, `tests/e2e/card.spec.ts` and `tests/e2e/reregistration.spec.ts`
      each click `getByTestId("group-choice-open")` before `#group-RED` / `#group-BLUE`.
- [ ] The click is a real click on the summary, **not** `evaluate(d => d.open = true)`.
- [ ] `tests/e2e/customer-record.spec.ts` is **not** touched: it checks `getByTestId("group-RED")` on
      the customer record, which is a different control and stays visible.
- [ ] No spec file other than those three is modified.
- [ ] `npm run test:e2e` passes in full.

### US-020.3: The height the fold was for

**Description:** As a staff member, I want the submit button to be reachable without hunting for it.

**Acceptance Criteria:**

- [ ] Measured at 1440×900 on the freshly seeded demo register, the `Zuordnung` card is ≤ 210px tall.
- [ ] The top of the `Aufnehmen` button rises by at least 100px against its position today.
- [ ] `document.documentElement.scrollWidth - clientWidth` is `0` at 1920, 1280, 1024, 800 and 390.
- [ ] `playwright-cli console` reports 0 errors at every width checked.
- [ ] The before and after numbers are in the commit message.

## Functional Requirements

- **FR-1:** The group radios on `/kunden/neu` must sit inside a `<details>` that renders closed.
- **FR-2:** The `<summary>` must name the proposed group, tinted with `GROUP_STYLES`, and carry
  `data-testid="group-choice-open"`.
- **FR-3:** The suggested-group sentence and the two group sizes must be visible while closed.
- **FR-4:** `#group-RED` and `#group-BLUE` must keep their ids, their `name="group"`, their values
  and their `defaultChecked` behaviour.
- **FR-5:** A submit with the disclosure never opened must save the proposed group.
- **FR-6:** The open/closed state must **not** be persisted; every load starts closed.
- **FR-7:** `archive.spec.ts`, `card.spec.ts` and `reregistration.spec.ts` must click the summary by
  testid before checking a radio, and must not use `evaluate` to set `open`.
- **FR-8:** No spec other than those three may be modified.
- **FR-9:** The `Zuordnung` card must keep `proposed-number` holding exactly the proposed number, and
  `registration-error` must stay the testid of at most one element on screen at a time.

## Non-Goals

- **Not** removing the ability to choose a group at intake. The radios move behind one click; they do
  not go away. (Removing them entirely was considered and rejected — it would make `changeGroup` on
  the record the only route, which is a product change, not a layout one.)
- **Not** touching the group control on `/kunden/[id]`, which is a different component with a
  different job: there the choice **is** the reason you opened the card, and its two sizes sit beside
  it deliberately (US-16.4 FR-4).
- **Not** changing how the group is proposed, or the rule behind it.
- **Not** replacing the native radios with Radix `RadioGroup`.
- **Not** persisting the fold.
- **Not** folding the archive search; that is `prd-us-19-fold-archive-search.md`.

## Design Considerations

- The summary is a control, so here `w-fit` **is** right — unlike the archive search's summary, which
  wraps a `CardHeader`. See `docs/ui_conversion_guide.md`.
- The proposed group in the summary is the one place the colour appears on this screen while closed.
  It must carry the word, never the tint alone: a colour is a distinction only some of the staff can
  make (US-03.4), and the specs assert the word.
- The `Zuordnung` card after this change is: one `Stat` tile (the proposed number), one summary line,
  one hint line, a rule, and `Aufnehmen`.

## Technical Considerations

- `src/app/kunden/neu/registration-form.tsx` is the only component file involved.
- The disclosure must sit **inside** the `<form>`; a `<details>` is not a form boundary, and the
  radios must still be submitted with everything else.
- Radios are uncontrolled by design here and on the record. `src/app/kunden/[id]/group-control.tsx`
  carries a four-sentence comment on why: React resets a form after its action resolves, and a
  controlled radio comes back showing the old group. Do not "tidy" that while nearby.
- `docs/ui_redesign_kunden_neu.md` §11.3 and §12 are where this decision is recorded; update §12
  when it ships.

## Success Metrics

- `Zuordnung` card ≤ 210px, from roughly 310px today.
- `Aufnehmen` at least 100px higher on the page.
- Full e2e suite green with exactly three spec files changed.
- Registering a household without touching the group still saves the proposed group — checked by
  hand as well as by the suite.

## Open Questions

- **Does anyone actually override the group?** DF said no, which is what motivates this. If the
  answer turns out to be "rarely, but it matters when we do", the summary wording is what carries
  that weight and should be reviewed on the live screen.
- **Should the record's group control fold the same way?** Deliberately not in scope: there the
  choice is why you opened the card. Worth revisiting only if DF say the record's `Gruppe` section is
  also noise.
