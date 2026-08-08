# PRD: Drop the week-colour date lookup from `/ausgabe` (US-22)

## Introduction

`/ausgabe` carries a second card under the counter: a date field that answers "which group collects
in the week of _this_ day". It was built because `docs/archiv/user_stories_mvp.md` §US-03 criterion 3 asked
for it, and the criterion was written before anyone had used the screen.

FD say they do not need it. What the counter is asked, and the only thing it is asked, is which
group collects **now** — today's, or the next distribution's on a day that is not one. The banner
already answers that, in words and in paint, as the dominant element of the screen. The date lookup
is a second, quieter answer to a question nobody has, sitting on the busiest screen in the product
and pushing the counter's own results further up the page.

This PRD removes it: the card, its strings, its error path, its two specs, and the criterion in
`docs/` that asked for it. This is a **retraction of a requirement**, not a defect fix, so the
documents that carry the requirement are part of the change rather than an afterthought.

## Goals

- `/ausgabe` shows the banner and the counter, and nothing about any other day.
- The `datum` query parameter no longer exists; a URL still carrying one is ignored, not an error.
- Every string, type and function that existed only for the lookup is gone — no dead code kept "in
  case".
- `docs/archiv/user_stories_mvp.md` and `tasks/prd-us-03-week-colour.md` say the requirement was withdrawn
  and why, so nobody rebuilds it in six months.
- The rest of US-03 — the banner, the alternation rule, the anchor, the next-distribution line — is
  untouched and stays proved.

## User Stories

### US-022.1: Remove the lookup card from the distribution screen

**Description:** As a staff member, I want the distribution screen to answer one question — who
collects now — without a second control offering to answer a different one.

**Acceptance Criteria:**

- [ ] The lookup `Card` at the foot of `src/app/ausgabe/page.tsx` is gone, with its `<form>`, its
      date `Input`, its submit and its `Zurücksetzen` link.
- [ ] The `LookupResult` component, the `Lookup` type, the `lookUp` function and the `lookupDate` Zod
      schema are deleted. `ErrorNote` **stays** — the settings-missing card and the counter's
      number error both use it.
- [ ] `messageFor` stays, and keeps handling `NoSettingsInForce`; its `InvalidAnchor` branch stays
      too, because the banner can still provoke it.
- [ ] `searchParams` is typed `{ nummer?: string | string[] }` — `datum` is gone from the signature.
- [ ] A request to `/ausgabe?datum=2026-13-45` renders the ordinary screen: the banner stands, no
      error is shown, and the parameter is simply not read. It must not throw and must not render
      `lookup-error`.
- [ ] The testids `lookup-result`, `lookup-colour`, `lookup-error` and the id `lookup-date` no longer
      appear anywhere in `src/`.
- [ ] `week-colour-banner`, `week-colour-group`, `next-distribution`, `counter-input`,
      `counter-error`, `settings-missing` and every counter testid are **unchanged**.
- [ ] `npm run lint` and `npm run typecheck` pass — with no unused import left behind (`z` from
      `zod`, `Badge` and `germanDate` are each used by something else or must go with the card;
      check, do not assume).
- [ ] Verified with the `playwright-cli` skill against a **production** build: the screen's heading
      outline (`querySelectorAll('h1,h2,h3')`) lists the counter heading and no longer lists the
      lookup heading, and the accessibility snapshot has no date textbox on the page.

### US-022.2: Remove the strings the lookup owned

**Description:** As the next developer, I want the German dictionary to hold only strings the app
renders, so a search for a phrase on screen leads somewhere.

**Acceptance Criteria:**

- [ ] `de.distribution.lookup` is removed in full from `src/i18n/de.ts` — `heading`, `hint`, `label`,
      `submit`, `reset`, `result`, `isDistributionDay`, `nextDistribution`.
- [ ] `de.distribution.errors.notADate` is removed. `noSettings` and `invalidAnchor` stay: both are
      still reachable from the banner.
- [ ] `de.distribution.banner.*`, `de.distribution.colours`, `de.distribution.group` and
      `de.distribution.counter.*` are untouched.
- [ ] A grep for `distribution.lookup` and for `notADate` across `src/` and `tests/` returns nothing.
- [ ] `npm run lint` and `npm run typecheck` pass.

### US-022.3: Retire the two specs that drove the lookup

**Description:** As a developer, I want the suite to describe the screen that exists.

**Acceptance Criteria:**

- [ ] In `tests/e2e/distribution.spec.ts`, two tests are **deleted**, not skipped: the one that
      refuses a day the calendar does not have and leaves the banner standing, and the one that looks
      up the colour of a week two years out.
- [ ] The three banner tests — a red distribution day, the following blue one, and a weekday without
      a distribution — stay exactly as they are, including the pinned-clock setup and the `afterAll`
      that removes the clock file.
- [ ] The file's header comment is updated: it currently explains the lookup among the things it
      proves, and would otherwise describe a screen the suite no longer reaches.
- [ ] One new test replaces the removed error case: `/ausgabe?datum=2026-13-45` renders the banner
      and shows **no** error — the old URL is inert rather than fatal.
- [ ] No other spec file is modified.
- [ ] `npm run test:e2e` passes in full.

### US-022.4: Record the withdrawal in the documents that asked for it

**Description:** As the next developer, I want to find out that the date lookup was deliberately
removed, at the place where I would otherwise read that it is required.

**Acceptance Criteria:**

- [ ] `docs/archiv/user_stories_mvp.md` §US-03 acceptance criterion 3 ("A staff member can look up the
      colour of a past or future week") is marked as **withdrawn**, with the reason — FD do not need
      it; the counter answers about now — and the marker style already used in that file for edits
      (`[added]`).
- [ ] `tasks/prd-us-03-week-colour.md` is updated in three places: §US-03.4 loses the date-picker
      criterion, §US-03.5 loses the two-years-out criterion, and **FR-4** is struck with a note that
      it was withdrawn by US-22.
- [ ] Neither document loses the reason the lookup once existed. A withdrawn requirement is recorded
      as withdrawn, never deleted, so the next person to propose it finds the answer.
- [ ] `getWeekColour(deps, date?)` keeps its optional date parameter, and §US-03.3's criteria about
      resolving settings at that date stay: `lookupCustomer` and `recordAttendance` both pass an
      explicit instant, so the parameter is load-bearing and only its _screen_ is gone.
- [ ] No source file and no spec file is changed in this story.
- [ ] `npm run format:check`, `npm run lint` and `npm run typecheck` pass.

## Functional Requirements

- **FR-1:** `/ausgabe` must not offer any control for looking up a day other than the one it is
  showing.
- **FR-2:** The banner must keep stating today's date, its ISO week, whether today is a distribution
  day, and — when it is not — the date and colour of the next one.
- **FR-3:** The `datum` search parameter must be ignored entirely. Any value, including an
  unparseable one, must render the ordinary screen.
- **FR-4:** No German string may remain in `src/i18n/de.ts` that no screen renders.
- **FR-5:** `getWeekColour`'s optional `date` parameter must remain, and its behaviour — resolving
  the settings version in force **at that date** — must stay tested.
- **FR-6:** The removal must not touch `src/domain`, `src/application`, `src/infrastructure` or
  `prisma/`. A diff reaching any of them means the change was misread.

## Non-Goals

- **Not** removing the week-colour rule, the anchor setting, the alternation, or any part of the
  domain. Only the screen that asked about other days goes.
- **Not** touching the banner's copy or its paint. `/ausgabe` was the shadcn pilot and the banner is
  the worked example; this PRD removes a card and changes nothing else on the screen.
- **Not** removing the ISO week from the banner. Staff check it against a wall calendar, which is a
  different use from looking up an arbitrary day.
- **Not** hiding the card behind a disclosure. FD do not need the feature at all; folding it away
  would keep the code, the strings and the specs for something nobody opens.
- **Not** removing `getWeekColour`'s date parameter (see FR-5).
- **Not** adding anything in the space that frees up — the counter simply moves up. US-21 and US-23
  each place their own controls deliberately.

## Design Considerations

- This is the cheapest change on the screen and should land **first** of the three: both US-21 and
  US-23 edit `src/app/ausgabe/page.tsx`, and doing this one afterwards would mean resolving a
  conflict in a file that has just been rearranged.
- Vertical space is the counter's scarcest resource — the verdict, the household's figures, the serve
  controls and two disclosures all sit below the fold on a laptop. Removing roughly 200px of card
  above them is the point of the change, not a side effect. Measure and record it.
- Nothing replaces the card. A "Zurücksetzen" link, an empty state or a note explaining where the
  lookup went would all be new furniture for a feature that is gone.

## Technical Considerations

- `src/app/ausgabe/page.tsx` is the only source file with logic to remove; `src/i18n/de.ts` is the
  only other source file touched.
- Check the imports after the delete: `z` (zod) is used **only** by `lookupDate`, and `Badge` only by
  `LookupResult`. `germanDate` stays — the banner uses it. `Input` stays — the counter uses it.
- The lookup's `defaultValue={typeof datum === "string" ? datum : ""}` is the last reader of `datum`;
  removing the card removes the parameter's only use, and the type must follow it.
- `src/app/page.tsx` (the hub) calls `getWeekColour(distributionDeps)` with no date and is not part of
  this change.

## Success Metrics

- `/ausgabe` is shorter by the height of the removed card, measured at 1440×900 before and after and
  recorded in the commit message.
- The counter's verdict banner sits higher on the page by that amount for a lookup made from a fresh
  load.
- Two e2e tests fewer, one new inert-parameter test, and the rest of the suite unchanged and green.
- A grep for `lookup` under `src/app/ausgabe/` returns only the counter's own `lookupCustomer` /
  `lookUpNumber`.

## Settled before this was written

**Does anyone at FD ever need a past or future week's colour — anywhere, not only at the counter?**
Asked explicitly, because the two readings of "remove the lookup" produce different work: a screen in
the wrong place is a relocation, and a capability nobody wants is a withdrawal. **FD's answer is that
it is not needed at all**, so criterion 3 is struck rather than re-homed, and this PRD is a
withdrawal. If it ever comes back, the argument to beat is that one, and the right home would be the
settings screen beside the anchor that decides the alternation — never the counter.

Note what is _not_ withdrawn: the colour of any day stays computable. `getWeekColour(deps, date?)`
keeps its date parameter and its settings-at-that-date behaviour (FR-5), because `lookupCustomer` and
`recordAttendance` both pass an explicit instant. Only the way a human reaches it is gone.

## Open Questions

- **Should the hub (`/`) state the next distribution's colour more prominently** now that `/ausgabe`
  is the only place a colour is looked up at all? Out of scope here; raise it against US-17 if staff
  start opening `/ausgabe` merely to read the banner.
