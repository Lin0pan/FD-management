# PRD: The Übersichten tab and „Zu erledigen" on the Start screen (US-38)

> Source: `local_only/overviews-and-to-dos/requirement.md` (refined 29.09.2026), which follows on
> from `local_only/overviews-and-to-dos/ui-concept.md`. Where the two disagree, the requirement wins;
> the concept is cited for the rules it states and the requirement does not repeat.

## Introduction

DF want more lists — certificates about to run out, cards issued but not yet printed, reports later.
The lists that exist today are scattered: _Karten neu ausstellen_ hangs off the Kunden hub,
_Ausgabetermine_ off the counter screen, and neither has a tab of its own. Before a third list
arrives, each needs a place.

There are two kinds of list, and they answer different questions:

| Kind                | Question it answers           | Place                                  | Visible             |
| ------------------- | ----------------------------- | -------------------------------------- | ------------------- |
| **To-do** (push)    | "Do I have to do something?"  | Start screen, block **„Zu erledigen"** | only when count > 0 |
| **Overview** (pull) | "I want to look something up" | New nav tab **„Übersichten"**          | always, also at 0   |

A reminder behind a tab nobody opens is no reminder, so a to-do goes where DF already look — the
Start screen. An overview goes behind a tab, where „none" is itself an answer worth showing.

This batch **moves what exists and builds nothing new**. Only two lists are placed:

| List                      | Change                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Ausgabetermine**        | Its home becomes Übersichten. The counter screen keeps its two links as shortcuts. What is counted does not change. |
| **Karten neu ausstellen** | A tile in Übersichten **and** a row in „Zu erledigen". The Kunden hub keeps its link for now.                       |
| **Warteliste**            | Untouched. It is a working tool — registration starts there — not a list to read.                                   |

The requirement calls the second list _Karten zur Neuausstellung_; the screen's own heading is
**„Karten neu ausstellen"** (`de.cardsDue.heading`), and that heading is what the tile and the row
say. One wording of one list — a second is how two screens come to disagree.

**The URLs do not move.** `/ausgabetermine`, `/ausgabetermine/[id]` and `/karten-neuausstellung`
stay where they are (decided 29.09.2026); only the tab that marks them changes. `/ausgabetermine`
was chosen deliberately over `/ausgaben` (US-37.3), and moving three routes to make the address bar
mirror the nav would churn six e2e specs and the actions' `revalidatePath` calls for nothing DF see.

## Goals

- A fifth nav tab, **Übersichten**, between Kunden verwalten and Einstellungen.
- One Übersichten page of tiles, each a number and the name of the list it opens, grouped by area.
- A **„Zu erledigen"** block on the Start screen, present only while something is due.
- Start and Übersichten can never disagree about a count: both read it from one use case.
- `/ausgabetermine` and `/karten-neuausstellung` belong to the Übersichten tab.

## Rules (from the UI concept)

- **Every to-do has its home in Übersichten; not every overview is a to-do.**
- **Only something a person can resolve, and which thereby returns to 0, goes on „Zu erledigen".**
  Ausgabetermine never does — it only ever grows.
- **Two entry points, one list.** A to-do row links to the same page its Übersichten tile does, and
  the count comes from one use case.
- **A page belongs to exactly one tab** — the one highlighted. Links from other screens (the Kunden
  hub, the counter screen, the Start screen) are shortcuts, not a second home.

## User stories

### US-38.1: The counts, from one place (application)

**Description:** As DF, I want the Start screen and the Übersichten tab to count from the same
source, so that the number I see on one is the number I see on the other.

**Acceptance Criteria:**

- [ ] New `countDistributionSessions(deps)` in
      `src/application/distribution/list-distribution-sessions.ts`, built from
      `listDistributionSessions` and measured — the shape `countCardsDueForReissue` already takes, so
      the tile can never promise a row the list does not show. The running session counts (it is a
      row of the list); a discarded one does not (it is not).
- [ ] New use case `src/application/overviews/read-overviews.ts` returning
      `{ cardsDue: number; pastSessions: number }` — the figures of every Übersichten tile, 0
      included.
- [ ] New use case `src/application/overviews/list-to-dos.ts` returning
      `ReadonlyArray<{ kind: ToDoKind; count: number }>` where `ToDoKind` is a union with one member
      today, `"CARDS_DUE"`. **An entry with a count of 0 is omitted** — the rule is the use case's,
      not the Start screen's. An empty array means the block is absent.
- [ ] Both read the cards-due figure through `countCardsDueForReissue` — never a second derivation.
- [ ] Both carry the `@throws` of what they call (`EmptyHousehold`, `BirthDateInFuture`).
- [ ] TDD against hand-written fakes; application coverage stays at 100%. Named tests:
      `leaves a to-do off the list when nothing is due`,
      `lists the cards due for reissue with their count`,
      `counts the cards due exactly as the overview does`,
      `shows an overview at zero`,
      `counts the running afternoon among the Ausgabetermine`,
      `counts no discarded afternoon`.
- [ ] No schema change, no new port method, nothing in `src/domain/`.
- [ ] Typecheck, lint and unit tests pass.

### US-38.2: The Übersichten tab and its page (presentation)

**Description:** As DF, I want a tab where every list I can look something up in is one click away,
with its size on it, so that I see at a glance what there is before I open it.

**Acceptance Criteria:**

- [ ] `NavSection` in `src/app/active-section.ts` gains `"overviews"`, and `NAV_ITEMS` gains
      `{ section: "overviews", href: "/uebersichten", routes: ["/uebersichten", "/ausgabetermine",
"/karten-neuausstellung"] }`, placed **between `customers` and `settings`**:
      _Start · Ausgabe · Kunden verwalten · Übersichten · Einstellungen_.
- [ ] `distribution` owns `["/ausgabe"]` only and `customers` owns `["/kunden", "/warteliste"]`
      only. The comments that justified the old ownership (why `/ausgabetermine` had no item, the
      "four items US-17 settled on") are replaced, not left arguing with the new table.
- [ ] `src/app/active-section.test.ts` updated: `/uebersichten`, `/ausgabetermine`,
      `/ausgabetermine/7` and `/karten-neuausstellung` mark `overviews`; `/ausgabe` still marks
      `distribution`; `/warteliste` still marks `customers`.
- [ ] `de.nav.overviews: "Übersichten"`, and the page `h1` is the same word read from the same key
      or from a key that holds the same string (label = heading). The `de.nav.label` comment that
      counts "four links" is corrected.
- [ ] New route `src/app/uebersichten/page.tsx`, `force-dynamic` (a birthday overtakes a card at
      midnight with nothing written), calling **`readOverviews`** and nothing else, with its
      composition root in `src/app/uebersichten/deps.ts`.
- [ ] Tiles grouped by area under an `h2` each:
  - **Kunden** — one tile: the cards-due count, labelled `de.cardsDue.heading`, linking to
    `/karten-neuausstellung`;
  - **Ausgaben** — one tile: the session count, labelled `de.distribution.pastSessions.heading`,
    linking to `/ausgabetermine`.
- [ ] A tile is **one link** whose accessible name carries both the number and the list's name
      (check it in the `playwright-cli` accessibility snapshot, not the screenshot). Build it on
      `Stat` (`src/app/stat.tsx`) — `tabular-nums`, the same figure size — rather than a new tile
      shape; a hover/focus state shows it is clickable. `data-testid`s: `overview-cards-due` and
      `overview-past-sessions` on the values, `overview-cards-due-link` and
      `overview-past-sessions-link` on the links.
- [ ] **0 is shown.** "None due" is information in an overview.
- [ ] **No descriptions under the tiles and no intro text** (CLAUDE.md, „Don't explain the screen";
      `ui_styling_guide.md` §8). The number and the name are the tile.
- [ ] `navigation.spec.ts` updated in this story so CI stays green: `SECTIONS` gains the fifth
      section (path `/uebersichten`, its heading), `HUB_ROUTES` loses `/karten-neuausstellung`, and
      a list of the routes Übersichten owns without naming them — `/ausgabetermine`,
      `/karten-neuausstellung` — is asserted to mark `nav-overviews` and nothing else.
- [ ] Five items still fit the bar at DF's MacBook window width without wrapping; if they wrap, the
      existing `flex-wrap` does so cleanly. Checked in the browser, not assumed.
- [ ] Typecheck, lint, unit tests and `npm run test:e2e` pass.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-38.3: The two lists find their way home (presentation)

**Description:** As DF, I want each list to lead back to Übersichten, so that its tab and its way
out agree.

**Acceptance Criteria:**

- [ ] `/ausgabetermine` and `/karten-neuausstellung` each gain a back link to `/uebersichten`,
      labelled with the tab's name, in the shape `/ausgabetermine/[id]`'s link back to the list
      already has (`ArrowLeft`, „back to the list", `ui_styling_guide.md` §12). Test ids
      `past-sessions-back` and `cards-due-back`.
- [ ] The counter screen's two links to `/ausgabetermine` (`session-past-link`,
      `last-session-past-link`) **stay** as shortcuts. The comments beside them that say the list
      "has no item in the nav bar" and the `de.distribution.pastSessions.link` comment that calls the
      counter screen "the only screen this one is reached from" are corrected.
- [ ] The Kunden hub's link to `/karten-neuausstellung` (`hub-cards-due`, with its badge) **stays
      unchanged** — a decision from refinement, to be revisited once DF say where they look for it.
- [ ] The Warteliste is not touched.
- [ ] Typecheck, lint and `npm run test:e2e` pass.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-38.4: „Zu erledigen" on the Start screen (presentation)

**Description:** As DF, I want the Start screen to tell me when something is waiting to be done, so
that a card due for reissue is not left until somebody happens to open the list.

**Acceptance Criteria:**

- [ ] `src/app/page.tsx` calls `listToDos` beside the two reads it already makes (one
      `Promise.all`), with whatever deps it needs composed in `src/app/uebersichten/deps.ts` or an
      existing composition root — not constructed in the page.
- [ ] Position, by urgency: `h1` → the running-session panel (when one runs) → **„Zu erledigen"** →
      the date line → the not-configured card. A forgotten session blocks every household, so it
      stays above; the date describes the calendar and outranks nothing.
- [ ] **When `listToDos` is empty the whole block is absent** — no heading, no "alles erledigt", no
      empty card. Test id `to-dos` on the block.
- [ ] Headed „Zu erledigen" (`h2`, new key under `de.home`). One row per to-do: the count, the
      list's name (`de.cardsDue.heading`, the tile's own words) and a trailing `ChevronRight`
      (`aria-hidden`).
- [ ] **The whole row is one link** to the same page its Übersichten tile opens
      (`/karten-neuausstellung`), with a counter-sized hit target — at least the nav's `h-12`.
      Test ids `to-do-cards-due` (the row link) and `to-do-cards-due-count` (the number).
- [ ] The href and label per `ToDoKind` come from a `Record<ToDoKind, …>` in the app layer, so a
      second to-do kind added later fails the build until it is given a place to link to.
- [ ] **Neutral styling** — a to-do is not an error. No amber, no red, no alert box; the existing
      notice tiers are for something already overdue, and nothing on this list is.
- [ ] `ChevronRight` registered in `ui_styling_guide.md` §12 as „opens the list" (affordance) — and
      **not** `ArrowRight`, which already means _before → after_ on `/karten-neuausstellung`.
- [ ] The page's header comment no longer says the signals live only on the hub.
- [ ] Typecheck, lint and `npm run test:e2e` pass.
- [ ] Driven and reviewed with the `playwright-cli` skill.

### US-38.5: Two entry points, one count, proved end to end (e2e)

**Description:** As a developer, I want the promise that Start and Übersichten never disagree proved
through the screens, because two pages counting the same thing is exactly where they drift.

**Acceptance Criteria:**

- [ ] New `tests/e2e/overviews.spec.ts`, over the engine's own registers (`tests/e2e/registers.ts`,
      ADR-012), producing a stale card the way `reissue.spec.ts` / `age-13.spec.ts` already do:
  - with nothing due, Start has **no** `to-dos` block, and Übersichten shows the cards-due tile at
    **0**;
  - with one card due, Start shows the block with a count of 1, Übersichten shows 1, and the Kunden
    hub badge says the same — three screens, one number;
  - following the Start row lands on `/karten-neuausstellung` with `nav-overviews` marked;
  - reissuing the card there and returning to Start: the block is gone again (a to-do resolves to
    0 and leaves), and the tile reads 0;
  - the Ausgabetermine tile counts the sessions the list shows — start one session, end it, start a
    second: the tile reads 2 and the list has two rows. A discarded session changes neither.
- [ ] `home.spec.ts` still passes unchanged, or is changed only where it asserted the Start screen
      holds nothing but the greeting, the date and the two panels.
- [ ] Both engines pass: `npm run test:e2e` and `npm run test:e2e:webkit`.

### US-38.6: The Betriebsanleitung and the architecture record (documentation)

**Description:** As DF, I want the handout to say where the lists now live, so that the new tab is
found without being shown.

**Acceptance Criteria:**

- [ ] `docs/handout/betriebsanleitung.md` gains a short German, printable section on **Übersichten**
      and **Zu erledigen**: where the lists are, that „Zu erledigen" appears only when something is
      due and disappears once it is done. „Frühere Ausgaben nachschlagen" says the list is under
      Übersichten (and still reachable from the Ausgabe screen).
- [ ] arc42 updated with the `arc42` skill: **05** — the `/uebersichten` route, the two new use
      cases, and the `/ausgabetermine` row no longer claims it is reached from the counter screen
      alone or that the bar holds four items; **12** — _Übersicht_ and _Zu erledigen_ if the words are
      worth fixing. No ADR: a fifth tab is reversible in one commit, and nothing here is hard to undo.
- [ ] `ui_styling_guide.md`: the passage on the nav bar that says „Four items" says five; the
      `ChevronRight` row from US-38.4 is in the §12 registry.
- [ ] `scripts/ralph/prds/README.md` gains the batch 38 row and a short paragraph: presentation +
      two application use cases, no schema change, no port method, no domain edit.
- [ ] `npm run arc42:check` passes.

## Functional requirements

- **FR-1:** The nav bar shows five items, in this order: Start, Ausgabe, Kunden verwalten,
  Übersichten, Einstellungen. Each item's label is its page's heading.
- **FR-2:** `/uebersichten` shows one tile per overview, grouped by area (Kunden, Ausgaben), each
  with its count — including 0 — and linking to its list.
- **FR-3:** The Ausgabetermine tile's count is the number of rows `/ausgabetermine` lists: every
  non-discarded session, the running one included. What is counted does not change.
- **FR-4:** The cards-due tile's count is the number of rows `/karten-neuausstellung` lists.
- **FR-5:** The Start screen shows a „Zu erledigen" block below the running-session panel only when
  at least one to-do has a count above 0; each row appears only with a count above 0.
- **FR-6:** Today there is exactly one to-do, _Karten neu ausstellen_. Ausgabetermine is never a
  to-do.
- **FR-7:** A to-do row and its Übersichten tile link to the same page and show the same count,
  both read through one use case.
- **FR-8:** `/ausgabetermine`, `/ausgabetermine/[id]` and `/karten-neuausstellung` mark the
  Übersichten tab. Their URLs do not change.
- **FR-9:** The counter screen's links to Ausgabetermine and the Kunden hub's link to Karten neu
  ausstellen remain, as shortcuts.
- **FR-10:** The Warteliste stays on Kunden verwalten, unchanged.

## Non-goals

- **No new list.** _Karten noch nicht gedruckt_ and _Nachweise laufen bald ab_ are illustrations in
  the concept, not scope: the first needs a recorded "printed" confirmation (an event, with an audit
  entry), the second a threshold as a policy value. Both are future to-dos that would add a row.
- No removal of the Kunden hub's reissue link — revisited after DF feedback.
- No move of the Warteliste.
- No URL changes, no redirects.
- No counts in the nav bar: the bar reads nothing, or every route becomes dynamic (`nav.tsx`).
- No dashboard growth on the Start screen: it carries push/urgency content only. Pull content
  belongs in Übersichten.
- No sub-navigation inside Übersichten, no reports.
- No schema change, no new port method, no audit entry (nothing here writes).

## Design considerations

- Übersichten sketch, from the concept:

  ```
  Übersichten

  Kunden
    [ 3  Karten neu ausstellen → ]

  Ausgaben
    [ 12  Ausgabetermine → ]
  ```

- „Zu erledigen" sketch:

  ```
  Willkommen im Delbrücker Füllhorn
  [running-session panel, if any]

  Zu erledigen
    3  Karten neu ausstellen            ›

  Heute ist Dienstag, 29. September 2026.
  ```

- Reuse `Stat`, `Card`, `SHELL`, the `Button`/`Link` pattern the Start screen's panels use. No new
  colour: a to-do is not an alarm (`/karten-neuausstellung`'s own header comment says why).
- Label = heading, everywhere: the tab says what the page's `h1` says; a tile and a row say what the
  list's `h1` says.

## Technical considerations

- **The count has one source.** `listToDos` and `readOverviews` both go through
  `countCardsDueForReissue`, which measures the list rather than re-deriving it. Deriving the count a
  second way — a `COUNT(*)`, a filter in the page — is how the Start screen would come to promise a
  row the list does not show.
- **The "count > 0" rule belongs in `listToDos`**, where it is tested, not in `page.tsx`.
- **Cost:** `countCardsDueForReissue` reads the whole active register (~240 households) and compares
  birthdates; the Start screen now pays that on every load. That is the same cost the Kunden hub has
  always paid and is fine at this size (US-13.3 documented it). Do not cache it — it changes at
  midnight with nothing written.
- The Start screen renders before anything is configured; `listCardsDueForReissue` over an empty
  register returns `[]`, so the block is simply absent. Keep it that way — do not let a to-do read
  turn an unconfigured install into an error page.
- **Three places must agree on who owns `/karten-neuausstellung`**: `active-section.ts`, its unit
  test, and `navigation.spec.ts`. All three change in US-38.2 or CI goes red.
- Nothing here touches `prisma/`, `src/infrastructure/`, `src/application/ports.ts` or
  `src/domain/`. A story that finds itself there has misread the batch.

## Success metrics

- A card due for reissue is visible on the first screen DF open, without anyone opening a list.
- Start, Übersichten and the Kunden hub show the same cards-due number in the e2e spec.
- Every existing list is reachable from exactly one tab, and every page marks exactly one tab.

## Open questions

- Should the Kunden hub's link to Karten neu ausstellen go once Start and Übersichten carry it?
  Leaning yes — ask DF where they look for it today.
- Whether five items fit the bar on DF's MacBook without wrapping is checked in US-38.2, in the
  browser.
