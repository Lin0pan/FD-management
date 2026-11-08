# PRD: More filters on the customer list (US-46)

> **Source:** `local_only/additional-filters/requirement.md` (German: `requirement-refined_de.md`),
> refined with DF's developer over two rounds on 2026-11-08. Every point in that document was
> settled there; its decision table (A1–E5) is cited below by number. Two consequences the
> requirement does not spell out were decided while writing this PRD and are listed under
> §Open Questions for confirmation — they do not block the build.

## Introduction

DF run the software beside their Excel sheet and miss filters they use there through the column
autofilters. The customer list under **Kunden verwalten** (`/kunden`, US-15) has a GET filter form
today — Suche, Status, Gruppe, Bedarfsnachweis and „Archivierte Haushalte anzeigen" — whose values
live in the URL, combine with AND, and are named in the line „Gefiltert: …" above the table.

This story adds **four filters to the same form**, combined with the existing ones by AND:

1. **Erwachsene** — a dropdown of checkboxes, one per number of grown-ups that occurs in the register.
2. **Kinder** — the same for the number of children.
3. **Letzte Ausgabe vor** — a day; households whose latest hand-out lies strictly before it.
4. **Nachweis endet vor** — a day; households whose needs certificate ends strictly before it.

Everything that exists stays, the certificate-state filter included (C2).

## Goals

- DF can answer, on `/kunden`, the questions they answer with Excel's autofilter today: „more than
  5 children", „no children", „with children", „more than 3 grown-ups", „not seen since …",
  „certificate runs out before …".
- Every new filter lives in the URL, survives a reload, is named in the filter summary, and is
  cleared by „Filter zurücksetzen".
- No stored column, no schema change, no audit entry: every value filtered on is the one the table
  already shows, derived at read time.

## User Stories

### US-46.1: The list narrows by latest hand-out and by certificate end

**Description:** As a staff member, I want to list the households not served since a given day, or
whose certificate ends before a given day, so I can find who no longer comes and who needs to renew.

**Acceptance Criteria:**

- [ ] `ListCustomersInput` (`src/application/customers/list-customers.ts`) gains two optional fields,
      `lastHandoutBefore?: Date` and `certificateEndsBefore?: Date`. Absent = not filtered.
- [ ] `lastHandoutBefore`: a household is kept when its `lastHandoutAt` (the value the „Letzte
      Ausgabe" column shows, US-45) falls on a calendar day **strictly before** the given day (B1).
      „Calendar day" is the UTC day `germanDate` prints, so the filter and the column cannot
      disagree. A hand-out **on** the day does not qualify; one the day before does.
- [ ] A household with no hand-out at all (`lastHandoutAt === null`) is **never** kept by this
      filter, whatever the day (B2).
- [ ] A hand-out in the session running now counts at once; a removed hand-out no longer counts —
      both follow from reading `latestHandoutByCustomer()` as the column does, with no new query.
- [ ] `certificateEndsBefore`: a household is kept when its current certificate's `validUntil` lies
      **strictly before** the given day (C1). A certificate ending 30.11. is kept under „vor 01.12."
      and not under „vor 30.11." — it is still valid **on** its last day (`isExpired`).
- [ ] The certificate-end filter goes to the store as part of the existing `ValidUntilRange`, so it
      stays a `WHERE` clause. Combined with the certificate-state filter (`input.certificate`), the
      two ranges **intersect** (the earlier `before` wins, `from` is kept). The intersection is a pure
      function in `src/domain/customer/certificate.ts`, written test-first, e.g.
      `endingBefore(range: ValidUntilRange | undefined, day: Date): ValidUntilRange`. Its `before` is
      midnight UTC of `day` — `utcDay`, never a time of day.
- [ ] A future day is accepted by both filters (D4).
- [ ] Both filters combine with every existing filter by AND and with each other.
- [ ] Sorting is unchanged (by customer number, D1); `groupCounts` is unchanged by either filter
      (FR-3, ADR-017).
- [ ] No audit entry; no port method added (the store's `certificate` range already supports
      `before`, and `latestHandoutByCustomer` is already loaded).
- [ ] Tests written first, one named test per rule, e.g. `keeps a household served the day before`,
      `drops a household served on the day itself`, `never keeps a household never served`,
      `keeps a certificate ending the day before, not one ending on the day`,
      `intersects with the certificate state, the earlier end winning`. Domain function in
      `certificate.test.ts` with day-before / day-of / day-after and a 29 February boundary.

### US-46.2: The list narrows by numbers of grown-ups and children, and states which numbers occur

**Description:** As a staff member, I want to tick which numbers of grown-ups and of children to
show, so I can find the large families, the households without children, and so on.

**Acceptance Criteria:**

- [ ] `ListCustomersInput` gains `grownUps?: ReadonlyArray<number>` and
      `children?: ReadonlyArray<number>`. **Absent = not filtered. Present = exactly these counts**,
      OR within one list (A3). **An empty array matches nothing** (A1) — the one place the list does
      not follow `statusesFor`'s „empty means all"; say so in the field's doc comment.
- [ ] The counts compared are the row's `grownUps` / `children` — the same numbers as the
      „Erw. + Kinder" column, derived from birthdates by `composition(members, today)` against the
      use case's one `today`. A child is a child until the day before the 13th birthday
      (`GROWN_UP_AGE_YEARS`). Never stored.
- [ ] Applied in the use case after the composition is known (the store cannot derive it), the way
      `group` already is.
- [ ] `CustomerListView` gains `grownUpCounts: ReadonlyArray<number>` and
      `childCounts: ReadonlyArray<number>`: the distinct counts that **occur** in the register,
      ascending (A2). Taken over every **non-archived** household (`ACTIVE` and `BLOCKED`), plus the
      archived ones **only when `includeArchived` is true**. Independent of every other filter —
      search, status, group, certificate, the day filters and the count filters themselves do not
      change these lists.
- [ ] Any count named in the request's own `grownUps` / `children` is **also** in the matching list,
      even when no household has it any more (e.g. the only household with 7 children was archived).
      What the dropdown's label says must always be boxes the user can see and untick (see §Open
      Questions 1).
- [ ] The occurring counts are read with **one** extra `customers.list({ statuses })` over the
      register (bounded by the quota, ~240 rows) and `composition` per household — not one query
      per household, and not via `describeAllowances` (no price is needed).
- [ ] `groupCounts` and sorting are unchanged; no audit entry.
- [ ] Tests first against the hand-written fakes, one per rule, e.g.
      `lists the children counts that occur, ascending`, `leaves archived households out of the
  listed counts unless they are shown`, `does not narrow the listed counts by the other filters`,
      `shows only the ticked counts`, `shows nothing when no count is ticked`,
      `counts a child who turns 13 today as a grown-up`, `keeps a filtered count listed after its
  last household left`.

### US-46.3: „Letzte Ausgabe vor" and „Nachweis endet vor" on `/kunden`

**Description:** As a staff member on `/kunden`, I want two day fields in the filter form, so I can
apply US-46.1 from the screen and pass the view on as a link.

**Acceptance Criteria:**

- [ ] The filter form gets a **second row** below Suche / Status / Gruppe / Bedarfsnachweis (E5).
      This story puts the two day fields in it; US-46.4 adds the two dropdowns to the same row. Each
      control is as wide as a select in the row above (the same grid column width).
- [ ] Two fields labelled **„Letzte Ausgabe vor"** and **„Nachweis endet vor"** (from
      `src/i18n/de.ts`), each the existing `DateInput` (`TT.MM.JJJJ`, dots inserted while typing, no
      calendar picker — ADR-013), uncontrolled with `defaultValue` from the URL, with a real
      `<label htmlFor>` via `FilterField` and the placeholder `DateInput` uses elsewhere.
- [ ] URL parameters **`ausgabe-vor`** and **`nachweis-vor`**, carrying the text as typed
      (`ausgabe-vor=01.10.2026`). Parsed in the page's Zod schema with `parseCalendarDay`; an empty or
      absent value is „not filtered".
- [ ] **An unreadable day** (`01.10.`, `31.02.2026`, `abc`) does not filter, and is not swallowed
      either (E4): the field keeps the typed text, carries `aria-invalid="true"`, its label is
      reddened as on other refused fields, and the existing sentence **„Kein gültiges Datum."** stands
      under it, joined by `aria-describedby`. Reuse an existing `de.ts` key for the sentence — do not
      add a third copy. The other filters still apply. A day typed into the field and one typed by
      hand into the URL are the same case and behave the same.
- [ ] A readable day is named in the filter summary and the empty-state message:
      **„Letzte Ausgabe vor 01.10.2026"**, **„Nachweis endet vor 01.01.2027"** (new
      `de.customerList.filterClauses` entries, day formatted with `germanDate`). An unreadable one
      is not named. New clauses stand after the existing ones and before the archived clause, joined
      as the existing clauses are.
- [ ] „Filter zurücksetzen" (the plain `<a href="/kunden">`) leaves both fields empty (D3).
- [ ] Layout: at the 1100px window (`BELOW_BREAKPOINT` in `tests/e2e/layout.ts`) and at
      `GATE_WIDTH`, the form has no horizontal overflow (`expectNoHorizontalOverflow`) and the second
      row's controls line up under the selects above. Narrow widths wrap as the first row does.
- [ ] e2e in `tests/e2e/customer-list.spec.ts`: (a) a household served before the day is listed,
      one served on the day is not, one never served is not; (b) a certificate ending the day before
      is listed, one ending on the day is not; (c) the URL carries `ausgabe-vor=` and survives a
      reload; (d) `ausgabe-vor=31.02.2026` keeps the text, shows „Kein gültiges Datum.", filters
      nothing and is absent from the summary; (e) reset empties both fields. Dates relative to the
      app's today (use the helpers in `tests/e2e/day.ts`).
- [ ] Driven and reviewed with the `playwright-cli` skill (accessibility snapshot and screenshot) at
      desktop width and at 1100px, `docs/guideline/ui_styling_guide.md` §11.

### US-46.4: „Erwachsene" and „Kinder" dropdowns on `/kunden`

**Description:** As a staff member on `/kunden`, I want two Excel-style checkbox dropdowns, so I can
apply US-46.2 from the screen and see at a glance, collapsed, whether one is set.

**Acceptance Criteria:**

- [ ] Two dropdowns in the second filter row, **„Erwachsene"** and **„Kinder"**, each listing one
      checkbox per count in `view.grownUpCounts` / `view.childCounts`, labelled with the number alone
      (`0`, `1`, …). **No household counts beside the boxes** (A4).
- [ ] Built from a native **`<details>` / `<summary>`** with native `<input type="checkbox">` inside —
      not Radix `DropdownMenu`, which portals its content out of the `<form>` so its checkboxes would
      submit nothing. The form stays a server component with no JavaScript of its own. The open
      panel overlays the content below (absolutely positioned, above the sticky table header) rather
      than pushing the table down, and is reachable and operable by keyboard.
- [ ] **A tick takes effect on „Filtern"** (E1), like every other filter — the table and the
      summary do not change while ticking.
- [ ] Default and „Filter zurücksetzen": **every box ticked** = not filtered (A1, D3).
- [ ] URL parameters **`erwachsene`** and **`kinder`**, repeated per ticked count
      (`kinder=1&kinder=7`). Absent = not filtered. Values that are not non-negative integers are
      dropped; a parameter left with no readable value is „not filtered", like every other
      unreadable parameter on this page.
- [ ] **Every box unticked must be expressible**, although a GET form submits nothing for unticked
      checkboxes: each dropdown also submits a hidden `<input name="kinder" value="keine">` (resp.
      `erwachsene`). `kinder=keine` alone means „no count ticked" and yields an empty table with
      `de.customerList.empty.filtered` naming the filters (A1) — never „then show everything".
- [ ] **The URL is made canonical by a server redirect** (`redirect` from `next/navigation`) when the
      count parameters as submitted differ from their canonical form: the sentinel is dropped when
      any count is ticked; a list in which **every listed box is ticked** is removed entirely, so
      that dropdown is unset and unmarked and the URL carries nothing for it (E3). The redirect
      rewrites only `erwachsene` and `kinder`; every other parameter passes through as submitted, an
      unreadable day's text included.
- [ ] **The collapsed dropdown states its contents** (A6, E2): its `<summary>` reads
      **„Kinder: alle"** when not filtered, **„Kinder: 1, 7"** when filtered, **„Kinder: keine"** when
      no box is ticked (likewise „Erwachsene: …"). A set dropdown also gets a **coloured border**
      from an existing accent token (guide §5) — text and colour together, never colour alone. The
      summary reflects the filter **in force** (the URL), not unsubmitted ticks.
- [ ] The filter summary and the empty-state message name a set dropdown with the same words as its
      label („Kinder: 1, 7", „Kinder: keine"), as new `de.customerList.filterClauses` entries, in the
      order Erwachsene, Kinder, then the day filters (US-46.3), then the archived clause. An unset
      dropdown is not named.
- [ ] Every new string lives in `src/i18n/de.ts`. No hint text in or beside the dropdowns —
      CLAUDE.md „Don't explain the screen on the screen".
- [ ] Layout as in US-46.3: no horizontal overflow at 1100px and at `GATE_WIDTH`; the open panel
      is not clipped by the card (`Card` already gets `overflow-visible` here) and covers nothing it
      should not when closed (`expectNothingCovers` on the first table row).
- [ ] e2e in `tests/e2e/customer-list.spec.ts`, each with a register of its own as the suite does
      (`tests/e2e/registers.ts`): (a) only the counts that occur are listed; ticking archived adds
      an archived-only count; status/group filters do not change the boxes; (b) unticking `0` under
      Kinder and pressing „Filtern" shows only households with children, the summary reads
      „Kinder: 1, …" and the collapsed label matches; (c) unticking every box shows the empty
      message naming „Kinder: keine"; (d) re-ticking every box and pressing „Filtern" leaves no
      `kinder` in the URL and the label reads „Kinder: alle"; (e) the filter survives a reload; (f)
      reset ticks every box again.
- [ ] Driven and reviewed with the `playwright-cli` skill (accessibility snapshot and screenshot):
      both dropdowns closed, open, set, and with every box unticked, at desktop width and at 1100px.

### US-46.5: The handout and the architecture record describe the new filters

**Description:** As DF, I want the printed handout to say how to use the new filters; as the next
developer, I want the architecture record to stay true.

**Acceptance Criteria:**

- [ ] `docs/handout/betriebsanleitung.md` gains a short section on filtering the customer list (it
      has none yet), in German and in the handout's tone, following `docs/handout/README.md` (no
      links, no paths). It covers the four new filters with DF's own typical questions as examples
      — „mehr als 5 Kinder" (0–5 abwählen), „keine Kinder" (nur 0), „mit Kindern" (0 abwählen),
      „seit … nicht mehr da" (Letzte Ausgabe vor) — and states the two non-obvious rules: a
      household never served never appears under „Letzte Ausgabe vor", and a tick counts only after
      „Filtern".
- [ ] `docs/architecture/05-building-block-view.md` and any other chapter that describes the
      customer list's filters are checked and updated if they name the filter set; nothing is added
      where no chapter speaks of it. `arc42.py check` stays green. No ADR (nothing hard to reverse).

**Definition of done for every story** (beside `tasks/README.md`'s): both e2e engines green
(`npm run test:e2e` and `npm run test:e2e:webkit`).

## Functional Requirements

- FR-1: Four new filters on `/kunden`, combined with each other and with Suche, Status, Gruppe,
  Bedarfsnachweis and „Archivierte Haushalte anzeigen" by AND.
- FR-2: Erwachsene / Kinder: a list of the counts that occur (non-archived households; archived ones
  only while shown; independent of other filters), plus any count the filter in force names. OR
  within one list. All ticked = not filtered; none ticked = empty table.
- FR-3: The counts are `composition(members, today)`'s — the „Erw. + Kinder" column's numbers.
- FR-4: Letzte Ausgabe vor: `lastHandoutAt`'s calendar day `<` the day; never-served households
  never match.
- FR-5: Nachweis endet vor: `validUntil < ` midnight UTC of the day; combinable with the
  certificate-state filter by intersecting the ranges.
- FR-6: URL parameters `erwachsene`, `kinder` (repeated; `keine` = none ticked), `ausgabe-vor`,
  `nachweis-vor` (`TT.MM.JJJJ`). All-ticked lists are removed from the URL by a server redirect.
- FR-7: An unreadable day never filters, keeps its text, and is marked „Kein gültiges Datum.".
- FR-8: The filter summary and empty-state message name every new filter in force.
- FR-9: „Filter zurücksetzen" clears all four.
- FR-10: Unchanged: sorting by customer number, the group balance, archived households hidden by
  default, `/ausgabe`'s household list. Reading the list writes no audit entry.

## Non-Goals

- Export, printing or extra columns (phone, address) for a filtered list (D2).
- Sorting by a date (D1).
- Counts beside the checkboxes, an age filter, a household-size filter, comparison operators or
  combined conditions (A4, A5).
- A „between" for either day filter (B1, C1).
- A registration date standing in for households never served (B2).
- Any filter on the household list under the counter mask on `/ausgabe`.
- Applying a tick without „Filtern".

## Design Considerations

- Second filter row below the first, same grid column widths, so the four new controls line up
  under the selects (E5). Search keeps its wider column in row one.
- A set dropdown is marked by its label text **and** a coloured border (guide §5: never colour
  alone). Reuse an existing accent token from `src/app/accents.ts` or the guide's palette rather
  than introducing a new colour; if none fits, the guide is updated in the same story.
- No icon is required. If one is added to the dropdown's summary (e.g. a chevron), it is
  `aria-hidden`, from `lucide-react`, and registered in guide §12.
- The day fields' refused state looks exactly like a refused day field elsewhere.

## Technical Considerations

- **Where filtering happens.** Status, search and certificate range stay `WHERE` clauses in the
  store; the certificate-end day joins the range. Group, the two count lists and the latest-hand-out
  day are applied in the use case, because they depend on derived values (parity, composition, the
  hand-out map). All are bounded by the quota.
- **`statusesFor` is not changed.** The count lists' „empty matches nothing" is a separate reading,
  documented on the input field.
- **One `today`.** The occurring counts, the row compositions and the day comparisons all use the
  use case's single `deps.clock.now()`.
- **The page stays thin**: Zod parses the URL (counts as integers, days via `parseCalendarDay`,
  keeping the raw text for the refused state), the redirect canonicalises the count parameters, one
  use case is called, the result rendered. Deciding „every listed box ticked" needs the use case's
  listed counts, so the page compares after the call and redirects if the URL is not canonical.
- **`FilterForm` is a server component**; `DateInput` is a client component and already used inside
  server-rendered forms elsewhere. The „Zurücksetzen is a plain `<a>`" note in `page.tsx` applies to
  the new uncontrolled fields too.
- **No schema change, no migration, no new port method, no ADR, no audit entry.**

## Success Metrics

- Each of DF's typical questions (§Goals) is answered on `/kunden` with at most one dropdown or one
  day field and one press of „Filtern".
- A filtered view passed on as a link shows the same table to a colleague.

## Open Questions

None that block the build. Two consequences were decided while writing this PRD; confirm with DF
when convenient:

1. **A filtered count that no longer occurs stays listed.** With „Kinder: 1, 7" in force and the only
   7-children household archived, the box `7` still appears (ticked) so the label and the boxes
   agree and the filter can be undone. A2 read literally would hide it, leaving a label naming a box
   nobody can see.
2. **Wording for no box ticked:** „Kinder: keine" in the collapsed label and in the filter summary.
