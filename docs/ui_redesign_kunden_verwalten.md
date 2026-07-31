# Redesigning "Kunden verwalten" (`/kunden`)

A UX analysis of the customer hub as it stands today, and a concept for rebuilding it on the
shadcn/ui primitives — the second screen in the conversion `docs/ui_conversion_guide.md` describes,
after the `/ausgabe` pilot.

**Status:** analysis and concept only. Nothing in `src/` has been changed. This document is the
argument that the implementation PR should be able to point at.

---

## 1. How this was examined

The screen was driven through `playwright-cli` against a production build (`npm run build && npm run
start`) on the demo register (15 households, 8 red / 7 blue, two cards due for reissue), at 1440×900,
800×900 and 390×844. The accessibility snapshot was read alongside the screenshots, per the
conversion guide. Numbers quoted below are measured off the live DOM, not estimated.

Console: **0 errors, 0 warnings.** Horizontal page overflow: **0 at all three widths.** The screen is
not broken. It is _unreadable at a glance_, which is a different and harder problem.

---

## 2. What this screen is for

Four staff, one shared machine, ~240 households, one distribution a week. `/kunden` replaced the
spreadsheet, and the spreadsheet was used for four jobs:

| #   | Job                                                            | What the screen has to make fast           |
| --- | -------------------------------------------------------------- | ------------------------------------------ |
| A   | **Find one household** — by name, customer number, card number | The search box and the name column         |
| B   | **Answer "who is behind on their Nachweis?"**                  | Filter + the certificate column, scannable |
| C   | **Decide a new household's group** (US-01)                     | The red/blue balance, whole and unfiltered |
| D   | **Get to the three customer actions** (US-17.2)                | New customer, waiting list, cards due      |

A is by far the most frequent. C and D are single glances. B is periodic. Everything else on the
screen — the four numeric columns, the reminder tally — is _reference data_, looked at once a
household is already found.

**The current layout does not reflect that ranking anywhere.** That is the root cause behind most of
what follows.

---

## 3. Findings — why it reads as cluttered

### 3.1 The table starts 628px down a 900px viewport

Measured: the `<table>`'s top edge is at **y = 628** at 1440×900 (**744** at 800px, **1124** at
390px). At the standard laptop height FD works on, **five rows of a 240-row register are visible
before scrolling**, and the page's own scroll height is 1341px on a 15-row demo — the real register
will be roughly 11 000px.

Six blocks stack above the list, each a full-width band separated by `gap-6`:

```
h1  →  intro paragraph (2 lines)  →  hub actions  →  group balance + hint (3 lines)
    →  filter form (2 rows)  →  archive hint (2 lines)  →  result count  →  table
```

Three of those six are **explanatory prose** (`intro`, `groupBalanceHint`,
`includeArchivedHint`) — 5 lines, ~70 words, at the top of a screen staff open twenty times a day.
They are well written and they were right when the screen was new. They are now a permanent tax on
the thing people came for. The `intro` in particular explains the software's internals ("werden bei
jedem Aufruf neu … berechnet") to an audience that has long since learned it.

**This is the single biggest win available.** Nothing about the list needs to change to get most of
it back.

### 3.2 Colour means three different things at once, and two of them are red

Three independent state systems are painted into every row, with overlapping palettes:

| Cell     | Values                              | Paint                                      |
| -------- | ----------------------------------- | ------------------------------------------ |
| Gruppe   | Rot / Blau                          | `red-600/10` · `blue-700/10`               |
| Status   | aktiv / gesperrt / archiviert       | `emerald-600/10` · **`red-500/10`** · grey |
| Nachweis | gültig / läuft bald ab / abgelaufen | none · `amber-500/10` · **`red-500/10`**   |

A household in the **Rot** group with a valid certificate and no block wears a red pill. A **blocked**
household wears a red pill. An **expired certificate** wears a red pill. On the demo register, row 1
(Möldner) shows a red "Rot" badge _and_ a red "abgelaufen" badge side by side, meaning nothing in
common; row 7 (Diezel) shows red "Rot" next to red "gesperrt".

Red is FD's most important colour — it is one of the two printed cards. Spending it a second and
third time on "blocked" and "expired" means the eye can no longer use it as a signal at all. There
are **45 tinted pills on 15 rows** (3 per row, always, including 8 rows whose only news is "aktiv,
gültig"). Colour applied to every row is not emphasis; it is texture.

The conversion guide's rule 9 is the right instinct — the RED/BLUE literals stay, because they are
the physical cards. The correction is to stop _competing_ with them elsewhere.

### 3.3 The columns are sized by their headers, not by their data

Measured column widths at 1440px (table 1088px wide):

| Column              | Width     | Typical content     |
| ------------------- | --------- | ------------------- |
| Nr.                 | 39px      | `1`–`240`           |
| **Name**            | **159px** | `Nwachukwu, Mario`  |
| Karte               | 57px      | `12k1`              |
| Gruppe              | 72px      | `Rot`               |
| Status              | 98px      | `aktiv`             |
| **Erwachsene**      | 108px     | `2`                 |
| **Kinder**          | 66px      | `1`                 |
| **Portionen**       | 89px      | `6`                 |
| Preis               | 65px      | `6,00 €`            |
| Nachweis gültig bis | 217px     | `16.02.2027` + pill |
| **Erinnerungen**    | 117px     | `0`                 |

The four single-digit household columns plus the reminder tally consume **480px — 44% of the
table** — to display one character each. The name, the thing job A scans for, gets **159px (15%)**
and wraps onto two lines at 800px ("Möldner, / Sally"). "Erinnerungen" is 117px wide and reads `0`
on 13 of 15 rows.

Every heading is also `whitespace-nowrap`, so each column has a hard floor equal to its German
label. The table is laid out for the vocabulary rather than for the register.

### 3.4 The register's card number repeats its customer number

On all 15 demo rows, `cardNumber` is exactly `customerNumber` + `k` + issue count (`17` → `17k2`).
Two adjacent columns, 96px together, where the second is the first plus one digit. The _only_ new
information is the issue count — which matters, but does not need a column of its own.

### 3.5 Search is smaller than a filter it should dominate

Measured: the Suche input is **281px**; the Bedarfsnachweis select beside it is **303px**. The most
used control on the screen is the smallest thing in its row, and its placeholder — the one place the
`50` / `50k3` syntax is taught — is clipped mid-sentence at 1440px.

The row also does not align: the input is 42px tall (`border` + `py-2`), the selects are 40px, the
submit button 42px. Three heights in one row, visible as a ragged baseline.

At 800px the six controls reflow into three ragged lines with "Filter zurücksetzen" stranded alone
on a fourth. There is no visual container holding them together, so wrapped controls read as loose
page furniture rather than as one form.

### 3.6 The sticky table header does not stick

`page.tsx:443` says `<thead className="sticky top-0 …">`, with a comment explaining that at 240 rows
the columns are otherwise unreadable halfway down. **It does not work.** Measured at 1440×500 scrolled
to y=841: `thead.getBoundingClientRect().top` is **−213** — the header has scrolled off the top of the
window.

Two independent causes:

1. The wrapper is `<div className="overflow-x-auto">`. `overflow-x: auto` makes `overflow-y` compute
   to `auto` as well, so the div is a scroll container, and `position: sticky` inside it sticks to
   _that_ container's scrollport — which is as tall as the whole table and never scrolls internally.
   The header therefore never engages during page scroll.
2. Even if it engaged, `top-0` is wrong: `<Nav>` is `sticky top-0 z-40 h-12`. The header would park
   underneath it. The nav is also translucent (`bg-background/75 backdrop-blur`), so scrolled content
   is faintly visible through it — in the scrolled screenshot the "Filtern" button and the column
   headings both ghost through the bar.

This is the one _functional_ defect in the list, and it is exactly the kind the e2e suite cannot see.

### 3.7 The accessibility tree loses the screen's structure

From the snapshot: below `heading "Kunden verwalten" [level=1]` there is **not one `heading` on the
page**. The hub actions, the group balance, the filters and the list are four `generic` nodes. A
screen-reader user has one landmark and 240 rows.

Related, smaller:

- The filter labels are `generic`, not `<label>` elements bound by `htmlFor` — they work today only
  because the control is _nested inside_ the `<label>`. It works; it is fragile the moment a control
  moves.
- The group balance is a bare `paragraph "Rot: 8 · Blau: 7"` with no accessible name saying what the
  number counts. Its explanation is a separate sibling paragraph.
- Every filter `combobox` is correctly named. That part is good and must survive the restyle
  (see §7).

### 3.8 The hub actions read as three unrelated things

One solid black button, then two underlined text links each trailing a grey pill. They sit on the
same line, they belong to the same job (D), and they are styled from three different vocabularies.
At 800px the third wraps to its own line, breaking even the accidental grouping. The two count pills
are the same neutral grey by design (PRD §6 — a stale card is not an alarm), which is right; but grey
pills attached to underlined links look like decoration, not like the section's dashboard.

### 3.9 Density and rhythm

`gap-6` (24px) between every block, whether the two blocks are related or not, so the group balance
floats equidistant from the actions above and the filters below and belongs to neither. Meanwhile
rows are 43px tall with `align-top`, which for single-line cells reads as top-heavy — the badge pills
sit high in their cells against baseline-aligned digits.

---

## 4. The concept

### 4.1 Principle

> **One screen, one job: find a household.** Everything else earns its place by being either a single
> glance (the balance, the three actions) or an aid to finding (the filters). Prose explains only
> where a staff member can act on the explanation.

Concretely: **get the table above the fold.** Target ≤ 300px from the top of `<main>` to the first
data row at 1440×900, down from 628px. That is ~14 rows visible instead of 5.

### 4.2 Proposed structure

```
┌─ Nav (existing, sticky, h-12) ────────────────────────────────────────────────┐

  h1  Kunden verwalten                            [ + Neue Kundin aufnehmen ]   ← header row
                                                                                  (CardAction-style)
  ┌─ Card: Übersicht & Aktionen ─────────────────────────────────────────────┐
  │  ┌──────────┐ ┌──────────┐   Warteliste  ▸  niemand wartet               │
  │  │ Rot   8  │ │ Blau  7  │   Karten neu ausstellen  ▸  2 Karten          │
  │  └──────────┘ └──────────┘                                                │
  │  Die kleinere Gruppe wird bei der nächsten Aufnahme vorgeschlagen.        │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌─ Card: Kundenliste ──────────────────────────────────────────────────────┐
  │  h2 Kundenliste                                          15 Haushalte    │  ← CardHeader
  │  ┌────────────────────────────────┐ ┌──────┐┌──────┐┌────────┐ [Filtern] │
  │  │ 🔍 Name, Kundennummer (50) …   │ │Status││Gruppe││Nachweis│ [Zurück…] │  ← filter row
  │  └────────────────────────────────┘ └──────┘└──────┘└────────┘           │
  │  ☐ Archivierte Haushalte anzeigen  ⓘ                                     │
  │  ─────────────────────────────────────────────────────────────────────    │
  │  Nr  Name              Karte  Gruppe  Status   Haushalt  Preis  Nachweis  │  ← sticky
  │   1  Möldner, Sally    ·k1    Rot     aktiv    4 + 0     8,00   26.06.26  │
  │   2  Dück, Milena      ·k1    Blau    aktiv    2 + 1     5,00   12.08.26 ⚠│
  └──────────────────────────────────────────────────────────────────────────┘
```

Four decisions carry this:

**(a) The `h1` row takes the primary action.** `Neue Kundin oder neuen Kunden aufnehmen` is the only
_write_ on the screen; it belongs beside the heading, following the page skeleton in the conversion
guide. Frees a full band.

**(b) The intro paragraph goes.** It explains the implementation. If anything survives, it is one
short line as `CardDescription` on the list card. This is a **content change**, not a restyle — see
§8.

**(c) The balance becomes two stat tiles.** Job C is "which group is smaller?", answered by
comparison, and comparison is what two tiles do and a run-on string does not. This reuses the pilot's
`Stat` component from `counter-lookup.tsx` verbatim — same `rounded-lg bg-muted/50 px-4 py-3`, same
`<p>`-wrapping so label and value stay one announced fact. The tiles wear **no** red/blue paint: the
words "Rot" and "Blau" are the label, and painting them here would add two more competing pills to a
screen that already has too many (§3.2). The hint keeps its `text-sm text-muted-foreground` and moves
under the tiles, where it explains the thing it is under.

> ⚠️ **Constraint:** `customer-list.spec.ts` asserts
> `getByTestId("group-counts")` `.toHaveText(de.customerList.groupBalance(red, blue))` — exact — plus
> `data-red` / `data-blue`. Two tiles cannot carry one exact string. Options, in order of preference:
>
> 1. Keep `data-testid="group-counts"` with `data-red`/`data-blue` on the **wrapper** of the two tiles
>    and let `toHaveText` match the concatenation — this requires changing `de.customerList.groupBalance`
>    to compose from the same parts, and the spec then still passes unedited only if the accessible
>    text concatenates to the identical string. Fragile; verify with `playwright-cli` before committing.
> 2. Keep the single balance paragraph exactly as-is and simply give it more presence (`text-3xl`,
>    `tabular-nums`) inside the card. Zero risk, most of the benefit.
>    **Recommendation: option 2 for the restyle PR.** The two-tile version is a content change and
>    belongs in its own commit with the spec updated deliberately.

**(d) The filters move inside the list card, above the table.** They are the table's controls; they
have no meaning apart from it. Inside a `Card`, a wrapped control row still reads as one form. The
`includeArchivedHint` — two lines of prose today — becomes a hover/focus tooltip or a `<summary>`
beside the checkbox, or is cut to one clause. It is guidance about a checkbox; it should live on the
checkbox.

### 4.3 The table

**Columns: 11 → 8.**

| Now                 | Proposed                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nr. · Karte         | **Nr.** — card issue shown as a superscript/suffix in the same cell (`17 ·k2`), or as a muted second line under the name                                                                                         |
| Name                | **Name** — widened; `font-medium`, `min-w-[14rem]`, never wraps below 800px                                                                                                                                      |
| Gruppe              | **Gruppe** — keeps its literal red/blue paint (guide rule 9)                                                                                                                                                     |
| Status              | **Status** — `Badge variant="secondary"` for aktiv is _dropped entirely_; only `gesperrt` (destructive) and `archiviert` (outline) render a badge. "aktiv" is the default state of 90% of rows and needs no ink. |
| Erwachsene · Kinder | **Haushalt** — one cell, `4 + 0` / `2 + 1`, `tabular-nums`, header `Erw. + Kinder`. Saves 174px and reads as the one fact it is.                                                                                 |
| Portionen · Preis   | **Portionen** · **Preis** — kept, headers abbreviated (`Port.`) so the column sizes to the digit                                                                                                                 |
| Nachweis gültig bis | **Nachweis** — the date, `tabular-nums`; the state badge shows **only** for `läuft bald ab` (amber) and `abgelaufen` (red). "gültig" is the default and gets no pill — the date alone says it.                   |
| Erinnerungen        | **Erinner.** — kept but right-most and muted; `0` renders as `–` in `text-muted-foreground` so only non-zero tallies catch the eye                                                                               |

Effect on the noise budget, counted on the demo register (15 rows: 3 `gesperrt`, 3 `abgelaufen`,
2 `läuft bald ab`):

|                            | Now    | Proposed |
| -------------------------- | ------ | -------- |
| Gruppe pills               | 15     | 15       |
| Status pills               | 15     | **3**    |
| Nachweis pills             | 15     | **5**    |
| **Total tinted pills**     | **45** | **23**   |
| …of which are _exceptions_ | 8      | **8**    |

The 22 pills that disappear all said "this row is normal", so nothing is lost. What is gained is that
the eye now has 8 marks to find instead of 45, and the Gruppe column becomes the only _systematic_
colour on the screen — which is right, because it is the only column where the colour **is** the
datum.

If the 15 group pills still read as busy once built, the fallback is a 10px colour swatch beside the
word rather than a bordered pill — lighter ink, same information, and the word still travels with the
colour. Decide with `playwright-cli show --annotate` in front of FD, not in advance.

> ⚠️ **Constraint:** `customer-row-status` and `customer-row-certificate-state` are asserted with
> exact `toHaveText` against `de.customers.status.ARCHIVED` and
> `de.customerList.certificateStates.EXPIRED`/`.VALID`. So the _element with the testid_ must still
> contain the word — including for the "gültig" and "aktiv" cases (`customer-list.spec.ts:416-418`
> asserts `VALID`). Resolution: keep the `<span data-testid=…>` always present with its word, and
> apply/omit the badge chrome around it. "gültig" then renders as plain muted text in the cell rather
> than as an outlined pill. Same for "aktiv". **No badge, but the word stays** — which is also what
> the accessibility argument (US-03.4, colour is never alone) requires.

**Row semantics:** `align-top` → `align-middle`; row height ~40px; `hover:bg-muted/50` comes free
from the shadcn `TableRow` and gives the row-tracking cue an 11-column table badly needs. Archived
rows keep their dimming _and_ their word, unchanged.

**The name becomes the row's link target**, styled `font-medium hover:underline` rather than
permanently underlined — 240 underlines is 240 pieces of visual noise, and the whole row is
hoverable.

**Sticky header, done properly:**

```tsx
<TableHeader className="sticky top-12 z-10 bg-background">
```

with the outer scroll container removed _or_ made `overflow-x-auto overflow-y-visible` at ≥ md. `top-12`
matches the nav's `h-12`. The nav's `z-40` stays above; the header's `z-10` sits above the rows. The
header needs an **opaque** `bg-background` (not the nav's translucency) or rows will read through it.
Verify by scrolling in `playwright-cli` — the current code proves this is not verifiable by reading.

### 4.4 What is deliberately _not_ changed

- The GET form. It is what puts the filters in the URL, and "the list I was looking at" surviving a
  reload and being sendable to a colleague is a product requirement (FR-5), not an implementation
  detail.
- One status at a time rather than a multi-select (PRD §6).
- The balance ignoring the filters (FR-3).
- Cards-due and waiting-list badges shown at zero, in neutral grey (US-13.4, US-18.1).
- The hub naming nobody from the waiting list (US-18.3).
- `force-dynamic`.

---

## 5. Mapping to shadcn/ui

Everything needed is **already installed** (`alert badge button card checkbox dialog dropdown-menu
input label radio-group select table textarea`). No new component is strictly required.

| Element today                                                           | Becomes                                                                                                                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HubActions` `<section>`                                                | `Card` + `CardHeader`/`CardContent`, `<h2>` inside `CardTitle`                                                                                           |
| `hub-new-customer` `<Link className="bg-foreground …">`                 | `<Button asChild><Link>` in the `h1` row, with a `UserPlus` icon                                                                                         |
| `hub-waiting-list` / `hub-cards-due` links                              | `<Button variant="ghost" asChild><Link>` — stays an `<a>`                                                                                                |
| local `CountBadge`                                                      | `<Badge variant="secondary">`; the free-slot tint stays a `className` override, keeping `data-free-slot`                                                 |
| group balance `<p>`                                                     | the pilot's `Stat` shape, or `text-3xl tabular-nums` in place (§4.2c)                                                                                    |
| `FilterForm` `<form>`                                                   | unchanged element, wrapped in `CardContent`; controls per below                                                                                          |
| filter `<input type="text">`                                            | `<Input className="h-10">` + a `Search` lucide icon, `md:col-span-2`                                                                                     |
| filter `<select>`                                                       | **stays a native `<select>`** — styled with the same token classes (see §7)                                                                              |
| archive `<input type="checkbox">`                                       | **stays native** (guide rule 3 — the GET form reads it as presence)                                                                                      |
| "Filtern" `<button>`                                                    | `<Button type="submit">`                                                                                                                                 |
| "Filter zurücksetzen" `<Link>`                                          | `<Button variant="ghost" asChild><Link>`                                                                                                                 |
| local `Badge`                                                           | **delete** — `@/components/ui/badge` (guide: this local component shadows the shadcn name and must be renamed/removed as part of converting this screen) |
| local `Table` / `Heading` / `Row`                                       | `Table`/`TableHeader`/`TableRow`/`TableHead`/`TableCell`; `Row` stays as a local `CustomerRow` (renamed to avoid confusion)                              |
| `customer-list-empty` `<p>`                                             | `<Alert role="status"><AlertDescription>`                                                                                                                |
| `NoSettings` screen                                                     | `Card` + `Alert` + `<Button asChild>` to `/einstellungen`                                                                                                |
| `border-foreground/10,/20`, `bg-foreground/5`, `text-foreground/70,/80` | `border-border`, `bg-muted/50`, `text-muted-foreground`                                                                                                  |

**Optional additions**, if we want them later — none are needed for this pass:

- `tooltip` — for the archive hint on the checkbox (§4.2d). The plain-HTML alternative is `<details>`
  or a `title` attribute; a tooltip is the nicer answer and costs one `shadcn add`.
- `separator` — cosmetic; a `border-t` does the same.
- `skeleton` — no loading states here; the page is server-rendered dynamic.

**Do not reach for:** `Select` (§7), `Combobox`/`Command` (would replace the URL-bearing GET form with
client state), `DataTable`/TanStack (sorting and pagination are not asked for, and 240 rows do not
need them — see §9).

---

## 6. Colour, after

| Meaning                     | Treatment                                        | Why                                         |
| --------------------------- | ------------------------------------------------ | ------------------------------------------- |
| Gruppe Rot / Blau           | literal `red-600` / `blue-700` tint + the word   | It **is** the printed card (guide rule 9)   |
| Status aktiv                | plain muted text, no pill                        | The default state of the register           |
| Status gesperrt             | `Badge variant="destructive"` + the word         | A real exception, and rare                  |
| Status archiviert           | `Badge variant="outline"`, row dimmed + the word | Unchanged; its number may be reused (US-10) |
| Nachweis gültig             | plain date, no pill                              | The default                                 |
| Nachweis läuft bald ab      | amber tint + the words                           | Actionable within 30 days                   |
| Nachweis abgelaufen         | red tint + the words                             | Actionable now                              |
| Counts (Warteliste, Karten) | `Badge variant="secondary"`, neutral             | Not alarms (PRD §6)                         |
| Freier Platz                | emerald tint + "Platz frei" **in words**         | Unchanged (US-18.2)                         |

Red now appears in exactly two roles — the red _card_, and "this needs doing" — and never twice for
unrelated reasons in the same row, because "aktiv/gültig" rows print no red at all. Every colour is
still accompanied by its word, which is the non-negotiable from US-03.4.

---

## 7. Constraints the implementation must not break

Beyond the ten in `docs/ui_conversion_guide.md`, this screen has its own, all derived from
`tests/e2e/customer-list.spec.ts` — which must pass **with no test edited**.

1. **The three filters must stay native `<select>`.** The spec calls `.selectOption("BLUE")` and
   `.toHaveValue("BLUE")` on `status-filter`, `group-filter`, `certificate-filter`. Radix's `Select`
   renders a `<button>` plus a portalled listbox; both Playwright calls fail against it. Style the
   native element with the theme tokens instead — this is the same trade the guide records for
   `Label` in server components.
2. **The archive toggle stays a native `<input type="checkbox">`** — `.check()` / `.toBeChecked()`,
   and the GET form needs it to submit `archiv=1` by presence.
3. **`group-counts` keeps `data-red` and `data-blue`, and its exact text** (see the warning in §4.2c).
4. **Every `customer-row-*` testid stays on the element holding exactly its value**, `toHaveText` being
   exact: `-number`, `-card`, `-group`, `-status`, `-grown-ups`, `-children`, `-portions`, `-price`,
   `-certificate` (date only), `-certificate-state` (word only), `-reminders`. Merging Erwachsene and
   Kinder into one cell therefore means **two spans inside one `<td>`**, each keeping its testid — not
   one span holding `"4 + 0"`.
5. **`customer-row` keeps `data-customer-number` and `data-status` on the `<tr>`.**
6. **`hub-new-customer`, `hub-waiting-list`, `hub-cards-due` stay clickable links** to their paths;
   `waiting-list-badge` keeps its exact text and `data-free-slot`; `cards-due-badge` keeps its text.
7. **The submit button's accessible name stays `de.customerList.filters.submit`.**
8. **`h1` stays `de.customerList.heading`.**
9. **Every new German string goes in `src/i18n/de.ts`** — including the abbreviated column headers,
   which are new keys and not edits to the existing ones if the old wording is still used anywhere.
10. **Give every card's `CardTitle` a real `<h2>` inside it.** §3.7 shows the screen currently has
    none; the conversion must add them, not preserve the absence.

---

## 8. Restyle vs. content change

The conversion guide is explicit: _"A conversion touches JSX structure and `className` only."_ Parts
of this concept do more than that. Splitting them keeps the restyle PR reviewable and its e2e run
honest:

| Change                                                    | Restyle? | Notes                                                            |
| --------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| Cards, tokens, shadcn primitives, `Badge`/`Table` renames | ✅       | Pure conversion                                                  |
| Sticky-header fix                                         | ✅       | A defect in the code being converted                             |
| Dropping the "aktiv"/"gültig" pill chrome (word stays)    | ✅       | `className` only; testids and text untouched                     |
| Moving the new-customer button into the `h1` row          | ✅       | Structure                                                        |
| Filters into the list card                                | ✅       | Structure                                                        |
| Merging Erwachsene + Kinder into one `<td>`               | ✅       | Both testids survive (§7.4)                                      |
| Merging Karte into the Nr. cell                           | ⚠️       | Both testids survive, but the header text is a dictionary change |
| **Deleting the intro paragraph**                          | ❌       | Content — own commit                                             |
| **Shortening `includeArchivedHint`**                      | ❌       | Content — own commit                                             |
| **Abbreviating column headers**                           | ❌       | Dictionary — own commit                                          |
| **Two stat tiles for the balance**                        | ❌       | Changes `groupBalance` and its spec                              |

Suggested sequence: **(1)** conversion + sticky fix, e2e green untouched → **(2)** copy and column
headers, with the spec updated deliberately where the dictionary moves → **(3)** the balance tiles, if
we still want them after seeing (1).

---

## 9. Responsive

- **≥ 1280px** — the target. All 8 columns, no horizontal scroll. Filters in one row.
- **~1024–1280px** — filters wrap to two rows inside the card; table still fits.
- **~800px** — the table gets a horizontal scroll container (`[data-slot=table-container]` brings its
  own). Currently at 800px the container already scrolls (947px content in a 736px box) _and_ the name
  wraps; widening Name and dropping three columns should remove the wrap and may remove the scroll.
  Acceptable either way — this is not the working width.
- **390px** — today the table starts at y=1124 and the register is unusable. Not worth solving with a
  card-per-household layout: FD works from one shared desktop, and building a phone view we have no
  evidence anyone uses is the kind of speculative work this project's CLAUDE.md argues against. Target
  is only: **no page-level horizontal overflow** (already true), and get the filters compact enough
  that the table is reachable in one scroll.
- **No pagination, no virtualisation.** 240 rows is 240 rows. Introducing paging would break the
  "one dense sheet, sorted by number" mental model the spreadsheet established, and add a control to
  learn. Revisit only if the register ever passes ~1000.

---

## 10. Verification, before the PR is opened

Per the conversion guide's definition of done, plus the two this screen adds:

```bash
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:e2e                    # with no test edited
npm run build && npm run start -- --port 3100
playwright-cli open http://127.0.0.1:3100/kunden
playwright-cli snapshot             # read it
```

- Snapshot: an `<h2>` for every card title; `combobox` for each of the three filters, each still named;
  `checkbox` named "Archivierte Haushalte anzeigen"; the balance and the counts announced as complete
  facts, not as loose text.
- **Scroll to the bottom of the table and confirm the header is still visible and opaque** — the
  regression in §3.6 shipped with a comment claiming the opposite.
- Measure `document.querySelector('[data-testid=customer-table]').getBoundingClientRect().top` at
  1440×900: **≤ 300** is the goal, 628 is today.
- Three widths: `scrollWidth - clientWidth === 0` at 1440, 800, 390.
- `playwright-cli console` — 0 errors.
- Exercise the writes there are: submit the filter form, tick the archive toggle, follow all three hub
  links, follow a row's name link.
- `playwright-cli show --annotate` to put it in front of FD before merging.

Driving the screen writes to `data/fd.db`; `npm run db:demo -- --reset` restores the demo register.

---

## 11. Open questions

1. **Erinnerungen** — is a per-row tally something staff read from this list, or only from a
   household's record? If it is the latter, the column can go entirely (~117px) and the concept
   improves further.
2. **Sorting** — the list is always by customer number. Is "sort by Nachweis-Datum" a thing FD would
   use for job B, or does the certificate filter already answer it? (Filter is cheaper and stays in
   the URL; sorting needs a decision about what it does to the URL.)
3. **The intro paragraph** — cut entirely, or keep one line as `CardDescription`? Recommend cutting.
4. **Karte** — is the issue count (`k1` vs `k2`) read from this list at all, or only at the counter?
   If not, the column merges away without a suffix.
