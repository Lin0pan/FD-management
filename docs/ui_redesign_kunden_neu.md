# Redesigning "Neuen Kunden aufnehmen" (`/kunden/neu`)

A UX analysis of the registration screen as it stands today, and a concept for rebuilding it on the
shadcn/ui primitives — the fifth screen in the conversion `docs/ui_conversion_guide.md` describes,
after the `/ausgabe` pilot, `/kunden`, `/warteliste` and `/karten-neuausstellung`.

**Status:** built. See `docs/ui_conversion_guide.md` for the outcome and the numbers;
the open questions in §11 were put to FD and their answers are recorded in §12.

Read `docs/ui_redesign_kunden_record.md` alongside this. The two screens are the same household seen
before and after it joins the register, they share three components that are converted once, and the
household editor is the same problem on both — that document owns the shared decisions and this one
refers to them rather than repeating them.

Read `docs/ui_redesign_kunden_verwalten.md` for the colour budget and the "chrome marks the
exception" rule, and `docs/ui_redesign_warteliste.md` for the free-slot banner this screen also
renders.

---

## 1. How this was examined

Driven through `playwright-cli` against a production build (`npm run build && npm run start -- --port
3100`) on the demo register, freshly seeded — 3 applicants on the waiting list and customer number 3
free, so the banner is on screen — at 1920, 1440, 1280, 800 and 390 px wide. The accessibility
snapshot was read alongside the screenshots, per the conversion guide. Every number below is measured
off the live DOM at 1440×900 unless stated otherwise, not estimated.

Console: **0 errors, 0 warnings.** Horizontal page overflow: **0 at all five widths.** Nothing here
is broken, and the screen is not ugly. It is _unranked_: three things compete for the top of the page
and the one staff came for is the one they have to scroll to.

---

## 2. What this screen is for

One job, done a handful of times a month, with a person standing at the desk:

| #   | Job                                                                 | Frequency               | What the screen must make fast                     |
| --- | ------------------------------------------------------------------- | ----------------------- | -------------------------------------------------- |
| A   | **Type a new household into the register** (US-01)                  | The whole screen        | The first field, and a form that reads in one pass |
| B   | **Recognise a household that was here before** (US-11)              | A few times a year      | The search, and the certainty that it was offered  |
| C   | **Notice that the number being handed out is somebody's** (US-18.3) | Whenever a slot is free | The banner, once, before the first field           |
| D   | **Turn away a full register onto the waiting list** (US-12.4)       | Only when full          | The refusal, and the way out of it                 |

Three things follow that the current layout does not reflect.

**A is the screen.** Everything else is a door somebody may or may not need. Today the first field of
job A sits at **y = 752** on a 900px viewport — below the banner (146px) and below the archive panel
(270px), both of which belong to jobs that are not being done.

**B must not be missable.** The cost of missing it is a second record for a household FD already
knows, which is exactly what US-11 exists to prevent. That rules out the obvious fix for the 270px
(see §4.2b).

**C is a statement, not a gate.** The page comment is explicit: the banner "states a fact and gates
nothing — a walk-in may still be registered". It is read once and then it is furniture.

---

## 3. Findings — why it reads cluttered

### 3.1 The form starts 752px down, and 416 of those belong to other jobs

Measured, top to bottom on an empty form at 1440×900:

| Band                       | Top     | Height |
| -------------------------- | ------- | ------ |
| `h1` + `intro`             | 80      | 138    |
| Free-slot banner           | 218     | 146    |
| Archive search panel       | 382     | 270    |
| **`Person` — first field** | **752** | —      |
| `Anschrift`                | 892     | 176    |
| `Bedarfsnachweis`          | 1100    | 102    |
| `Haushalt`                 | 1234    | 314    |
| `Zuordnung`                | 1580    | 226    |
| Submit (`Aufnehmen`)       | 1766    | 40     |

Page height **1838px**. A staff member who opens this screen to do the only thing it is for sees
two panels and one and a half fields.

It gets worse as job B proceeds, because nothing collapses: one search result pushes the form to
**y = 1080** (page 2166), and applying that result pushes it to **y = 1364** (page 2450). The search
cap is twenty matches; at 280px per match row that is a panel about **5 600px** tall standing on top
of the form.

### 3.2 The archive panel spends 270px idle to be a three-field search

Its 270px are: an `<h2>`, a three-line paragraph, three inputs on one row, and a `Suchen` button on a
row of its own. The three fields are the only part that does anything. The button could sit beside
them; the paragraph explains a feature to somebody who is not using it.

And its results are worse. **One match row is 280px**, laid out as seven stacked bands:

```
Willi Mohr                                                    ← 24px
Geburtsdatum: 31.07.1990        Anschrift: Schöllerstr. 5 …   ← 52px, 2-col grid,
Archiviert am: 06.06.2026                                        third item wraps to row 2
1 Person im Haushalt                                          ← 20px
Grund der Archivierung: Arbeitsaufnahme, Bescheid …           ← 24px
Frühere Kundennummer: 3                                       ← 24px
Nur zur Wiedererkennung. Diese Nummer ist seit der …          ← 32px
[Daten übernehmen]                                            ← 30px
```

Every one of those facts has a reason to be there — the archive reason and the former-number
disclaimer both carry code comments arguing for them, and they are right. But the row is a **dossier
where a shortlist is wanted**: the question at this moment is "is this the household in front of me,
yes or no", and that is answered by name, birthdate and address. The rest is what you read after you
think you have found them.

### 3.3 The search criteria are wiped by the search

Measured: after submitting `Nachname = Mohr`, all three criterion inputs read `""` while the results
say "1 archivierter Haushalt gefunden". React resets an uncontrolled form after its action resolves,
and the three `<input defaultValue="">` come back empty.

So the screen shows an answer with the question deleted. Narrowing a search means retyping it, and a
result list cannot be checked against what was asked for. This is a **bug, not a styling problem**
(§8), and it is the highest-value fix on the screen for job B.

### 3.4 Applying a household looks like nothing happened

Clicking `Daten übernehmen` fills the form 600px below the fold and does not move the page. Measured
from a realistic scroll position (`scrollY = 373`): the notice appears at y = 1012 — its top edge just
inside the viewport — and the first filled field is at **y = 1364**, well outside it. The match row
stays exactly as it was, still offering `Daten übernehmen`, with nothing marking it as the one that
was taken.

A staff member's evidence that anything happened is a paragraph that scrolled halfway into view.

### 3.5 Four content widths, three field widths, one grid

On one screen: `main` is **896px**, the archive panel **832**, `max-w-prose` paragraphs **656**, and
the household hint **574**. Four right-hand edges, none of them aligned.

Inside the form there is exactly one layout — `sm:grid-cols-2` — used by all four sections, so every
field is **408px** wide regardless of what goes in it. `PLZ` is 408px for five digits.
`Hausnummer` is 408px. `Straße` is 408px. A field's width is the most reliable hint a form has about
what it wants, and this form makes the same promise about every field it holds.

Nothing changes above 640px: page height is identical at 800, 1280 and 1920. At 1920 the screen is
896px of content in a 1920px window.

### 3.6 The household row's first input sits 20px below the other two, in every row

The first column's label is `Haushaltsmitglied 1 — Vorname`; the other two are `Nachname` and
`Geburtsdatum`. In a 199px column the long one wraps: measured **40px tall against 20**, so the input
below it starts at y = 440 while its two neighbours start at 420.

This is `docs/ui_conversion_guide.md`'s "a comparison that wraps is not a comparison" in its other
form. Nothing is being compared here, but three fields that are one row of one person's data no
longer look like one row, and the raggedness is per-row and permanent. On the customer record, where
a six-member household is ordinary, it happens **six times** (see the record concept, §3.4).

The fourth column is a full 199px slot holding `Zeile entfernen` — the rarest control in the section,
given a quarter of the row.

### 3.7 A single digit in a 408px box, twice — and an 832px box for one more

`Erwachsene (ab 13 Jahren): —` and `Kinder (unter 13 Jahren): —` are two 408px bordered boxes. The
proposed customer number is an **832px** bordered box containing the character `3`.

This is the pilot's "eleven identical boxes" at the counter, which was fixed by lifting the figures
that drive the decision into large tiles. The same fix applies, and the tile already exists twice in
the codebase (`Stat` at the counter, `Counts` on `/karten-neuausstellung`).

### 3.8 The form has no heading, and its five sections are siblings of the search panel

From the accessibility snapshot:

```
h1  Neuen Kunden aufnehmen
  h2  Ein Platz ist frei
  h2  Im Archiv suchen
  h2  Person
  h2  Anschrift
  h2  Bedarfsnachweis
  h2  Haushalt
  h2  Zuordnung
```

Seven `h2`s at one level, of which two are doors and five are the form. Nothing in the outline says
that `Person` … `Zuordnung` are one thing that gets saved by one button, or that `Im Archiv suchen`
is not part of it. Read by heading — which is how a screen reader user navigates a long form — this
is a flat list of seven unrelated panels.

`Person` and `Anschrift` are also two headings for one act. They are 176px each, of which 36 is the
heading and its gap.

### 3.9 The page does not line up with the navigation bar

`<main>` is `max-w-4xl … p-8`; the nav's container is `max-w-6xl px-3 md:px-5`. Measured at 1440: the
nav container starts at **x = 144**, the page's content at **x = 272** — a **128px** step. At 1920 it
is the same 128px (384 against 512). Every converted screen uses the shared `SHELL` string and lines
up; this one does not.

`SHELL` itself is now **copy-pasted verbatim into five files** (`ausgabe`, `kunden`, `warteliste`,
`karten-neuausstellung`, and it would be a sixth here). It wants to be one exported constant beside
`src/app/accents.ts` — see §4.5.

### 3.10 Amber means three things, and green is about to mean two

- `archive-prefill-notice` — "these values came from an archived record" — is amber.
- `archive-search-truncated` — "too many results, narrow the search" — is amber.
- Across the rest of the application amber means exactly one thing: **a certificate has lapsed**
  (`/kunden`, `/warteliste`, the counter).

Neither of the two here is a warning about a certificate, and the prefill notice is not a warning at
all: it is a statement of provenance with an undo attached. The truncation notice is closer to a
caution but it is about the search, not the household.

Meanwhile `SaveFeedback` on the customer record confirms a save in green, and emerald already means
"a slot is free" application-wide (`FREE_SLOT_ACCENT`). That collision is the record's to fix, but it
is the same budget and it is settled once, in §6 here and §6 there.

### 3.11 The group is chosen without its colour

`Rot` and `Blau` are 13px native radios with plain text beside them. RED and BLUE _are_ the printed
cards FD hands out — `accents.ts` says so, and `/kunden`, `/karten-neuausstellung` and the card view
all paint them. The one screen where the group is actually **chosen** is the one screen that shows it
in black and white.

### 3.12 What the e2e suite does and does not hold

Worth knowing before the restyle starts, because it decides where care is spent.
`registration.spec.ts` and `reregistration.spec.ts` assert `household-row`, `grown-ups`, `children`,
`proposed-number` (`customer-number-select` since US-24), `registration-error`, `archive-match-name`,
`-household-size`, `-reason`,
`-former-number`, `archive-prefill-notice`, `-detail`, `-clear`, `archive-search-submit`,
`add-member`, `remove-member-0`, and sixteen field `#id`s.

They assert **nothing** about `archive-search-count`, `archive-search-empty`,
`archive-search-truncated`, `archive-prefill-error` or `registration-waiting-list-link`. Those five
states have no automated proof that a restyle left them working, and three of them need seeding to
reach at all. They must be exercised by hand (§10).

---

## 4. The concept

### 4.1 Principle

> **The form is the screen.** The banner is read once and then it is furniture; the archive search is
> a question asked before typing, not a panel to scroll past; and the first field a staff member has
> to fill is above the fold on the machine FD actually use.

### 4.2 Proposed structure

```
┌─ Nav (existing, sticky, h-12, max-w-6xl) ─────────────────────────────────────┐

  h1  Neuen Kunden aufnehmen
  ┌─ Card: Ein Platz ist frei ─────────────────── emerald ────────────────────┐  ← only when free
  │  h2 Ein Platz ist frei · Kundennummer 3 …  [ Jetzt registrieren ] [Liste] │
  └───────────────────────────────────────────────────────────────────────────┘
  ┌─ Card: Im Archiv suchen ──────────────────────────────────────────────────┐
  │  h2 Im Archiv suchen        War dieser Haushalt schon einmal aufgenommen? │  ← CardDescription
  │  [Nachname      ] [Vorname     ] [Geburtsdatum] [ Suchen ]                │  ← one row
  │  … results, when there are any                                            │
  └───────────────────────────────────────────────────────────────────────────┘
  ┌─ Card: Person und Anschrift ──────────────────────────────────────────────┐
  │  Vorname(4) Nachname(4) Geburtsdatum(4)                                   │  ← 12-col grid
  │  Straße(6)  Hausnummer(2)  PLZ(2)  Ort(4)     Bemerkung(12)               │
  └───────────────────────────────────────────────────────────────────────────┘
  ┌─ Card: Bedarfsnachweis ───────────────────────────────────────────────────┐
  ┌─ Card: Haushalt ──────────────────────────────────────────────────────────┐
  │  Table: #  Vorname  Nachname  Geburtsdatum  Alter        [entfernen]      │
  │  [ + Weiteres Haushaltsmitglied ]                                         │
  │  [Erwachsene 2] [Kinder 1]                              ← Stat tiles      │
  └───────────────────────────────────────────────────────────────────────────┘
  ┌─ Card: Zuordnung ─────────────────────────────────────────────────────────┐
  │  [Kundennummer 3]   Gruppe ( ) Rot  (•) Blau   ← tinted                   │
  │  ─────────────────────────────────────────────────────────────────────    │
  │  [ Aufnehmen ]                                            ← CardFooter    │
  └───────────────────────────────────────────────────────────────────────────┘
```

Seven decisions carry it.

**(a) The page moves to the shared `SHELL`** — `max-w-6xl … p-6 md:p-8`. It lines up under the bar
(§3.9), and the extra 256px is what pays for a three-column form row and a household table that does
not wrap.

The cards span the shell; the **field grid does not**. A 1152px-wide text input is worse than a
400px one, so the fields sit in a 12-column grid and take 2, 4 or 6 of it (§4.2d). Cards get the
width; fields get meaning.

**(b) The archive search is compressed to one row — and stays open.** _(It no longer does; US-19
folded it away. The argument is kept because the risk it names did not go away — see the note at the
end of this section and §12.)_

The tempting fix is a closed `<details>`, and it is wrong. Job B's cost of failure is a duplicate
record for a household FD already has, and a control that must be opened is a control that will be
forgotten on the day it matters. US-11 exists precisely to stop that.

So: keep it visible, and take the 270px down to about 150 by doing less with them. The `<h2>` stays,
the three-line `intro` becomes a one-line `CardDescription`, and the three fields and `Suchen` share
one row (`lg:grid-cols-4`, the button aligned to the field baseline, not on a line of its own).

> **Answered by US-19: it is closed now, and the argument above is mitigated rather than withdrawn.**
> FD were asked §11.1 and chose the fold. The cost of failure has not changed — a missed search is a
> duplicate record for a household FD already has, which is the whole of US-11 — so the mitigation is
> that the closed `<summary>` **asks the question** instead of naming a feature: "War dieser Haushalt
> schon einmal aufgenommen?" is on screen whether or not the panel is open. The control that could be
> forgotten says at every load what it is for. That is the entire mitigation, it is one line of
> prompt, and if a returning household is ever missed after this the next step is auto-opening the
> panel when the register holds archived households — cheap, and the runner-up when FD were asked.
> §12 records what was built and what it measures.

**(c) A match row becomes a shortlist entry, not a dossier.** Name, birthdate and address on one
line; household size, archive reason and the former number with its disclaimer **behind a
`<details>`** inside the row (guide rule 4 — and a `Dialog` would portal the content out of the row,
where `row.getByTestId(…)` could no longer reach it). `Daten übernehmen` sits at the right of the
first line.

Budget: ~64px closed against 280 today, so twenty matches are ~1 300px rather than ~5 600. Every
testid keeps its own text; `archive-match-reason` keeps `whitespace-pre-line`, which there is an e2e
for.

**(d) Field widths start telling the truth.** A 12-column grid at `lg`, collapsing to 2 columns at
`sm` and 1 below:

| Field                           | Columns (of 12) |
| ------------------------------- | --------------- |
| Vorname, Nachname, Geburtsdatum | 4 each          |
| Straße                          | 6               |
| Hausnummer, PLZ                 | 2 each          |
| Ort                             | 4               |
| Art des Nachweises, gültig bis  | 6 each          |
| Bemerkung                       | 12              |

Pure `className`, and the single largest legibility change on the screen.

**(e) `Person` and `Anschrift` merge into one card.** They are one act — who this is and where they
live — and the record already calls that pair by one name (`de.customers.record.detailsHeading`,
"Person und Anschrift"). Using the same words on both screens is most of what makes them read as one
product. `Anschrift` survives as a muted sub-label inside the card, not as a second `h2`.

This costs a new dictionary key and deletes a heading, so it is a content change (§8) — the two
existing keys stay, because `archive-search-panel.tsx` and the record's details editor both use
`addressHeading` for their own labels.

**(f) The household becomes a `Table`, on this screen and on the record.** Three editable fields per
member with identical column meanings is tabular data, which is exactly the case the guide reserves
`Table` for. It buys four things at once:

- the row-number-in-the-label wrap disappears (§3.6) — the number becomes a narrow first column;
- the age moves out of the birthdate label into a column of its own, so the labels stop differing
  per row;
- `Zeile entfernen` stops being a quarter of the row and becomes an icon-and-word button in a
  shrink-to-fit last column;
- one component shape serves `/kunden/neu` and `/kunden/[id]`, which is where most of the seam
  between them lives.

Each input keeps a real accessible name — `aria-label` carrying `Haushaltsmitglied 2 — Vorname`, the
string the visible label carries today — so nothing an assistive reader hears is lost when the
visible label becomes a column heading. The `data-testid`s and the `#memberFirstName-N` ids move with
their inputs unchanged.

**(g) The two derived counts become the counter's tile.** `Stat` — small muted label above a large
`tabular-nums` value, `bg-muted/50`, `min-w-56`, `whitespace-nowrap`, label and value inside one
`<p>`. It exists twice already (`Stat` in `ausgabe/page.tsx`, `Counts` in
`karten-neuausstellung/page.tsx`) and is wanted twice more (here and four times on the record). This
is the second screen that needs it, which is the guide's own threshold: **extract it** to
`src/app/stat.tsx` in this pass.

`Vorgeschlagene Kundennummer` becomes the same tile in the `Zuordnung` card, instead of an 832px box.

> **Superseded by US-24.** The tile was right while the number was the software's to pick, and wrong
> once it became the staff member's. It is now a labelled native `<select>`
> (`data-testid="customer-number-select"`) offering every free number and opening on the lowest, with
> a `free-number-count` hint beneath it; the `proposed-number` testid is gone. The rest of this
> section still holds — `Stat` is what the two derived counts are, on this screen and on the record.
>
> **And the card came onto the grid with it.** Replacing the tile with a labelled control gave the
> number column a label row that the group column — folded into a summary carrying its own „Gruppe:“
> — did not have, so the select sat 26px below its neighbour and the two hint lines 24px apart. The
> `flex flex-wrap` row is therefore now the form's own `GRID` with `FIELD_ROWS` on each column
> (`grid-rows-subgrid`, from `/einstellungen`): the number takes `lg:col-span-2`, the span `PLZ`
> gets, and the group `lg:col-span-6` and a field label of its own. The summary lost its „Gruppe:“
> prefix to that label and the `<legend>` inside it to `aria-labelledby`, so the word is on screen
> once. Measured at 1440×900 on a production build: labels, controls and hints each on one baseline,
> and the card 235px → 219px.

**(h) The submit gets a `CardFooter` and a size.** `Aufnehmen` is the one irreversible-ish act on the
screen and it is currently a 119×40 button after 1 700px of form. In the `Zuordnung` card's footer,
`size="lg"`, with the disabled-because-full case (§4.4) beside it.

Considered and rejected: a sticky action bar. It costs a fixed layer on every viewport, and once the
page is ~1 200px instead of 1 838 the scroll to reach the button is not the problem.

### 4.3 The two writes that follow a search

**Applying a household must be visible.** Three changes, none of them cosmetic:

1. The prefill notice moves **into the top of the `Person und Anschrift` card**, so the explanation
   sits on the values it explains rather than floating between two panels.
2. The applied match row says so — `Daten übernehmen` becomes a disabled `Übernommen` state with a
   `Badge`, so the row that was clicked is distinguishable from the nineteen that were not.
3. Focus moves to `#firstName` after a successful apply. It scrolls the form into view and it says
   "you can start typing" in the same gesture. The counter's `getElementById` refocus is the
   precedent, and it is exercised by hand because no spec covers it.

**And the criteria must survive it** (§3.3). Controlled inputs, or `defaultValue` fed back from the
returned state. This is a bug fix with its own commit and its own test (§8).

### 4.4 The full register

When `proposal.customerNumber === null` the screen shows a red panel and disables `Aufnehmen`. That
panel is the answer to job D and it currently sits at the bottom of `Zuordnung`, 1 600px down, under
a form that cannot be submitted.

It becomes an `Alert variant="destructive"` **directly under the `h1`**, with
`de.customers.new.waitingListLink` as a `Button variant="outline" asChild` rather than an underlined
link. The form stays on screen below it, disabled — not removed: staff need to see that the fields
exist and why they cannot be used, and `registration-error` is asserted by exact text.

It should link to `/warteliste#warteliste-aufnehmen`, the anchor `/warteliste` built. Note the trap
recorded in `docs/ui_redesign_warteliste.md`: `waiting-list.spec.ts:177` waits for `**/warteliste`
and that glob does not match a URL carrying a fragment. That is why the fragment was not added when
the anchor was built, and it is a spec edit — a third commit with its own argument (§8), not a
restyle.

### 4.5 Two extractions this pass should make

Both are the guide's own "extract when the second screen needs it" rule coming due:

- **`SHELL`** — verbatim in five files, a sixth here. One exported constant in `src/app/shell.ts`,
  beside `accents.ts`.
- **`Stat`** — §4.2g.

And one that must **not** be made yet: `fieldClass` is defined identically in `registration-form.tsx`,
`archive-search-panel.tsx` and the record's `record-forms.tsx`. It is not extracted; it is **deleted**,
because `Input` replaces it in all three.

### 4.6 What is deliberately _not_ changed

- **The search panel stays a sibling of the form, never nested in it.** HTML forms do not nest, and
  the search criteria are not part of the registration. Two cards, two forms.
- **The prefill remains a remount** (`key={formGeneration}`). It is what makes "leer beginnen" work
  and what stops a second selection merging into a first.
- **The counts stay underivable from an input.** There is no field for grown-ups or children and
  there must not be one; the form calls `composition` against the server's day.
- **`FreeSlotBanner` is not inlined.** It is shared with `/warteliste` and was converted there; this
  screen renders it and must be checked, not rewritten (§5).
- **`force-dynamic`.** The proposal goes stale the moment anybody else registers somebody.
- **The mirror rule** — the first household row follows the personal name until it is edited by
  hand, and never mirrors on a pre-filled form. That is a rule with a comment arguing for it, and a
  layout change must not disturb it.

---

## 5. Mapping to shadcn/ui

Everything needed is installed. No `shadcn add` required.

| Element today                                                           | Becomes                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `<main className="max-w-4xl … p-8">`                                    | the shared `SHELL` — `max-w-6xl … p-6 md:p-8`, imported                        |
| `<header>` + `intro`                                                    | `h1` row; `intro` kept as a muted paragraph under it                           |
| `ArchiveSearchPanel`'s `<section>`                                      | `Card` / `CardHeader` (`<h2>` in `CardTitle`, `intro` as `CardDescription`)    |
| its three `Criterion` fields                                            | `<Input>` + `<label htmlFor>`, one row (`lg:grid-cols-4`) with the button      |
| `archive-search-submit` `<button>`                                      | `<Button variant="outline">`                                                   |
| `archive-search-error`, `archive-prefill-error`                         | `<Alert variant="destructive" role="status">`                                  |
| `archive-search-empty`                                                  | `<Alert role="status">` inside the card                                        |
| `archive-search-truncated`                                              | `<Alert role="status">`, neutral — not amber (§6)                              |
| `archive-search-count`                                                  | muted text in `CardHeader`'s `CardAction`, or a `<Badge variant="secondary">`  |
| `MatchRow` `<li className="rounded border …">`                          | `<li className="border-b last:border-0 py-3">` — one card, not twenty          |
| its dossier lines                                                       | a `<details>` inside the row (§4.2c); `Detail` keeps its one-`<p>` shape       |
| `archive-select-<id>` `<button>`                                        | `<Button variant="outline" size="sm">`, disabled + `Badge` once applied        |
| `archive-prefill-notice` `<section role="status">`                      | `<Alert role="status">` at the top of the form card, neutral (§6)              |
| its `<h2>`                                                              | stays an `<h2>` — it is a real heading, and `Alert` will not supply one        |
| `archive-prefill-clear` `<button>`                                      | `<Button variant="ghost" size="sm">`                                           |
| each `<section>` + `<h2>` in `RegistrationForm`                         | `Card` / `CardHeader` / `CardTitle` wrapping a real `<h2>` / `CardContent`     |
| `TextField`'s nested `<label><span>` + `fieldClass` `<input>`           | `<label htmlFor>` + `<Input id>` — ids already exist                           |
| the `sm:grid-cols-2` grids                                              | a 12-column grid with per-field spans (§4.2d)                                  |
| household `<ul>` / `<li className="grid sm:grid-cols-4">`               | `Table` / `TableHeader` / `TableRow` / `TableCell`; testids move to `TableRow` |
| `add-member` / `remove-member-N` `<button>`s                            | `<Button variant="outline" size="sm">` / `variant="ghost" size="sm"`           |
| `grown-ups` / `children` boxes                                          | the extracted `Stat` tile (§4.2g)                                              |
| `proposed-number` box                                                   | the same `Stat` tile — replaced by a native `<select>` in US-24                |
| the `Gruppe` `<fieldset>` + native radios                               | stays a `<fieldset>`; each option a `<label>` wearing `GROUP_STYLES` (§6)      |
| `registration-error` (full register)                                    | `<Alert variant="destructive" role="status">` under the `h1` (§4.4)            |
| `registration-error` (save refused)                                     | `<Alert variant="destructive" role="status">` in the `Zuordnung` footer        |
| `registration-waiting-list-link`                                        | `<Button variant="outline" asChild><Link>`                                     |
| the submit `<button className="bg-foreground …">`                       | `<Button type="submit" size="lg">` in `CardFooter`                             |
| `border-foreground/15,/20`, `bg-foreground/5`, `text-foreground/60,/70` | `border-border`, `bg-muted/50`, `text-muted-foreground`                        |

**Native radios stay native.** The action reads `group` out of the `FormData`, and Radix's
`RadioGroup` submits nothing of its own unless it is wired to a hidden input — guide rule 3, in the
form it takes for radios. `#group-RED` is reached by CSS id in `registration.spec.ts`, so the ids are
load-bearing too.

**Do not reach for:** `Dialog` (rule 4, and §4.2c), `Select` for the group, a `DataTable`, or any
client-side validation. The refusals come from `registerCustomer` and are reported by
`useActionState`.

---

## 6. Colour, after

| Meaning                     | Treatment                      | Why                                                           |
| --------------------------- | ------------------------------ | ------------------------------------------------------------- |
| A slot is free              | `FREE_SLOT_ACCENT` + the words | One meaning, one colour — the hub and `/warteliste` (US-18.2) |
| Gruppe Rot / Blau           | `GROUP_STYLES` + the words     | The colour _is_ the printed card (guide rule 9)               |
| Register full, cannot save  | `Alert variant="destructive"`  | The one refusal on the screen                                 |
| A save was refused          | `Alert variant="destructive"`  | Same weight as the refusal it is                              |
| Data taken from the archive | **neutral `Alert`**, no tint   | Provenance with an undo, not a warning (§3.10)                |
| Too many matches            | **neutral `Alert`**            | About the search, not the household                           |
| Everything else             | tokens                         | —                                                             |

Amber then appears nowhere on this screen, which is right: no certificate is lapsing here — one is
being entered. Amber goes on meaning exactly one thing across the application.

Both literal tints come from `src/app/accents.ts`. Neither is invented here, and neither travels
without its word (US-03.4).

---

## 7. Constraints the implementation must not break

Beyond the ten in `docs/ui_conversion_guide.md`. All of these come from `registration.spec.ts` and
`reregistration.spec.ts`, which must pass **with no test edited**.

1. **The sixteen field `#id`s stay**: `#firstName`, `#lastName`, `#birthDate`, `#street`,
   `#houseNumber`, `#zip`, `#city`, `#certificateType`, `#certificateValidUntil`, `#notes`,
   `#group-RED`, `#archiveLastName`, `#archiveFirstName`, `#archiveBirthDate`, and
   `#memberFirstName-N` / `#memberLastName-N` / `#memberBirthDate-N`. They are filled by CSS id, not
   by label. Adding `htmlFor` and `aria-label` is free; renaming an id is not.
2. **`grown-ups` and `children` hold exactly the digit** — `toHaveText("1")`. A `Stat` tile may wrap
   them; the testid must not come to contain its own label.
3. ~~**`proposed-number` holds exactly the number**, asserted against the value the API returned.~~
   [superseded by US-24] The tile is a `<select data-testid="customer-number-select">`, and the specs
   read its `inputValue()` rather than its text. What is _not_ superseded is the constraint: the
   number the form shows is still asserted against the value the API returned, never a literal.
4. **`household-row` counts are asserted**: 1 on a fresh form, 0 when the last row is removed, 2
   after a two-member prefill. Whatever a row becomes, `data-testid="household-row"` must sit on
   exactly one element per member.
5. **`registration-error` keeps its exact text** `de.customers.errors.noFreeCustomerNumber(quotaN)`
   — and note that the same testid is used by **two** elements in the source today (the full-register
   panel and the save refusal). They are never on screen together, but a conversion must keep it that
   way or `getByTestId` becomes strict-mode-ambiguous.
6. **`archive-match-name`, `-household-size`, `-reason`, `-former-number` keep their exact text**,
   and are read **inside a row** (`row.getByTestId(…)`). Nothing may portal them out of the `<li>` —
   this is the second reason §4.2c uses `<details>` and not `Dialog`.
7. **`archive-match-reason` keeps `whitespace-pre-line`** — there is an e2e asserting the CSS itself.
8. **`archive-prefill-detail` keeps its exact sentence**, and `archive-prefill-notice` must be
   **absent** (`toHaveCount(0)`), not hidden, after `archive-prefill-clear`.
9. **`add-member` and `remove-member-0`** keep their testids and their positional numbering.
10. **The submit's accessible name stays `de.customers.new.submit`**, matched with `exact: true` by
    `customer-record.spec.ts:116`. `Aufnehmen` must not become `Kunden aufnehmen`.
11. **Every new German string goes in `src/i18n/de.ts`** — the merged card title and the search's
    one-line description are new keys.
12. **Give every `CardTitle` a real `<h2>`** (guide trap 1), and keep the prefill notice's `<h2>`.

---

## 8. Restyle vs. content change

| Change                                                          | Restyle? | Notes                                                  |
| --------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| Shell width, cards, tokens, shadcn primitives, `Input`/`Button` | ✅       | Pure conversion                                        |
| 12-column field grid                                            | ✅       | `className` only                                       |
| Household `<ul>` → `Table`, age as a column                     | ✅       | Structure; testids and ids keep their own text         |
| `Stat` tiles for the counts and the proposed number             | ✅       | Element swap + an extraction                           |
| Search fields and button onto one row                           | ✅       | `className`                                            |
| Match row → shortlist + `<details>`                             | ✅       | Structure; every asserted string stays put             |
| Neutral instead of amber on the two notices                     | ✅       | `className`                                            |
| Group radios wearing `GROUP_STYLES`                             | ✅       | Imported constant                                      |
| `SHELL` and `Stat` extractions                                  | ✅       | Refactor — **its own commit**, before the conversion   |
| **`Person` + `Anschrift` merged into one card**                 | ❌       | New key, one heading fewer — own commit                |
| **The three-line `intro` cut to a one-line description**        | ❌       | Content — own commit                                   |
| **The full-register alert moving under the `h1`**               | ⚠️       | Structure with a product argument — own commit         |
| **Search criteria surviving the search**                        | ❌       | **A bug fix.** Own commit, own test                    |
| **Applied match marked; focus moved to `#firstName`**           | ❌       | Behaviour — own commit                                 |
| **`/warteliste#warteliste-aufnehmen` fragment on the link**     | ❌       | Needs `waiting-list.spec.ts:177` edited — own argument |

Suggested sequence: **(0)** the two extractions → **(1)** the conversion, e2e green untouched →
**(2)** the copy: merged card, cut intro → **(3)** the criteria bug and the apply feedback →
**(4)** the full-register alert and the deep link, if (1)–(3) leave job D still feeling like a dead
end.

---

## 9. Responsive

- **≥ 1280px** — the target. Three-column personal data, household table on one line per member,
  search on one row.
- **~1024px** — the 12-column grid collapses to 6+6; the household table still fits. Check
  `documentElement.scrollWidth - clientWidth` **at** 1024, not around it: `/kunden` pushed the page
  26px sideways exactly there and it was invisible at 800 and 1440.
- **~800px** — two columns; the search's `Suchen` drops below the criteria. Fine.
- **390px** — today the page is 3 724px. Target is only: no horizontal overflow (already true), and
  the household table scrolling inside its own `[data-slot=table-container]` rather than pushing the
  page. As on `/kunden`, a phone-specific layout is not worth building for a shared desktop machine.
- Verify **every breakpoint the concept introduces**, including the `lg:grid-cols-4` on the search
  row and whatever width the household table stops fitting at.

---

## 10. Verification, before the PR is opened

```bash
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:e2e                    # with no test edited
pkill -f next-server && npm run build && npm run start -- --port 3100 &
curl -s http://127.0.0.1:3100/kunden/neu | grep -c "<a string you just added>"   # prove the build
playwright-cli open http://127.0.0.1:3100/kunden/neu
playwright-cli snapshot             # read it
```

Numbers to take, before and after, at 1440×900 on the freshly seeded demo register:

| Claim                                         | Before | Target                          |
| --------------------------------------------- | ------ | ------------------------------- |
| Top of `#firstName`, banner on screen         | 752px  | ≤ 560                           |
| Top of `#firstName`, no banner                | 574px  | ≤ 390                           |
| Top of `#firstName`, one search result shown  | 1080px | ≤ 700                           |
| Archive panel height, idle                    | 270px  | ≈ 150                           |
| One match row, closed                         | 280px  | ≈ 64                            |
| Page scroll height, empty form                | 1838px | ≤ 1250                          |
| Household row: first input top vs. neighbours | +20px  | 0                               |
| Distinct content widths on the page           | 4      | 1 (plus deliberate field spans) |
| Content box left edge vs. the nav's           | +128px | 0                               |

The budget behind "≤ 560": nav 48 + padding 32 + `h1` 36 + gap 24 + banner 146 + gap 24 + search card
150 + gap 24 + card header 65 ≈ 549. If it comes out higher, **say so with the budget** rather than
quietly dropping the target — that is the mistake `docs/ui_redesign_kunden_verwalten.md` §12.4
records, and `docs/ui_redesign_warteliste.md` had to make good on twice.

Then, by hand, because the suite does not cover them (§3.12):

- **Search with no matches** (`archive-search-empty`) and **with a term that returns more than the
  cap** (`archive-search-truncated`) — the latter needs seeding.
- **Search, then check the criteria are still in the fields**, then narrow and search again.
- **Apply a household**, and confirm: the notice sits on the form, the row says it was taken, focus
  lands in `#firstName`, and the household rows match the archived record.
- **Clear the prefill** and confirm the form is blank with nothing left behind.
- **Fill and submit a real registration**, and check where it lands.
- **A full register** — `registration-error` under the `h1`, the form visibly disabled, the waiting
  list reachable. This needs the quota lowered in `/einstellungen` to reach.
- **The free-slot banner on this screen and on `/warteliste`** — one component, two screens.
- Snapshot: an `<h2>` per card, every field a named `textbox`, the notices `status` regions, the
  household a `table` with column headers.
- `playwright-cli console` — 0 errors, at all five widths.
- `playwright-cli show --annotate` to put it in front of FD before merging.

Driving these flows **writes to `data/fd.db`**; `npm run db:reset && npm run db:demo` puts the demo
register back.

---

## 11. Open questions

1. **Is the archive search used at all?** It is designed for a household returning after being
   archived, which the demo register says happens twice in twenty. If FD say they never search — that
   they simply know their people — the panel could become a disclosure after all, and §4.2b's
   argument goes away. Worth asking before the restyle, because it is the one decision here that a
   measurement cannot settle.
2. **`Bemerkung` at registration.** The note field sits in `Person` on a screen where nobody has met
   the household yet. Is anything ever typed into it at intake, or is it always filled later from the
   record?
3. **Does the group ever get overridden?** The form proposes a group from the two sizes and offers
   radios. If staff always accept the proposal, the radios could become a disclosure ("andere Gruppe
   wählen") and the `Zuordnung` card would shrink to two tiles.
4. **The certificate at intake.** `Bedarfsnachweis` is two fields and 102px between two much larger
   sections. Would FD rather it sat beside the personal data, given it is the thing that decides
   whether the household may be registered at all?

---

## 12. What was decided, and what was built

FD were asked the questions in §11 before any code was written. Their answers:

| Question                                     | Answer                                                              |
| -------------------------------------------- | ------------------------------------------------------------------- |
| §11.1 Is the archive search used?            | Fold it away — but see the caveat below                             |
| §11.2 `Bemerkung` at intake                  | Keep it, at the end of the merged card, full width                  |
| §11.3 Does the group ever get overridden?    | Fold the radios away — built in US-20, see below                    |
| §11.4 The certificate at intake              | Move it beside the personal data, in the merged card                |
| §8 ⚠️ The full-register alert under the `h1` | Yes, with a plain link to `/warteliste` — no fragment, no spec edit |

**The archive search is a closed `<details>`.** PR #62 shipped it as `<details open>`, because an
element inside a closed `<details>` is invisible to `fill()` and `check()`, which then retry and time
out — and `#archiveLastName` is reached by CSS id. US-19 is the third-commit-with-its-own-argument
this document reserved for exactly that: `tests/e2e/reregistration.spec.ts` is the only spec that
fills the panel, and its `searchArchive` helper now clicks `getByTestId("archive-search-open")` — a
real click on the summary, not `evaluate(d => d.open = true)`, so a fold that silently stopped opening
turns the suite red — and waits for `#archiveLastName` before typing. One spec file touched, the
suite green. `archive.spec.ts` and `card.spec.ts` needed no edit after all: they reach `#group-RED`,
and the group radios were not folded **at that point** — US-20 folded them and did have to edit both,
plus `reregistration.spec.ts` a second time; see below.

§4.2b's argument against closing it (a control that must be opened is one that will be forgotten on
the day it matters, which is the whole of US-11) is not withdrawn. It is mitigated: the closed
summary asks "War dieser Haushalt schon einmal aufgenommen?", so the prompt survives the fold. That
mitigation is one line of prompt and should still be reviewed with FD on the live screen.

**The group radios are a closed `<details>` too** (US-20). PR #62 left them visible for the same
reason as the archive search, and with the argument that a disclosure around two radios which has to
be open by default is only noise — which was true for exactly as long as the specs made the fold
impossible. US-20 paid that price: `tests/e2e/archive.spec.ts`, `tests/e2e/card.spec.ts` and
`tests/e2e/reregistration.spec.ts` each click `getByTestId("group-choice-open")` before checking
`#group-RED` or `#group-BLUE` — a real click on the summary, never `evaluate(d => d.open = true)`, so
a fold that silently stopped opening turns the suite red. Those three are the only spec files
touched, and the full suite is green. The closed `<summary>` names the proposal in the group's own
colour — "Gruppe: Rot — andere Gruppe wählen", the word always with the tint (US-03.4) — while the
suggestion sentence and the two group sizes stay **outside** the disclosure: the sizes are what an
override is decided from, so they must be readable without opening the control. The radios themselves
are unchanged: native, uncontrolled, `defaultChecked` on the proposal, wearing the `GROUP_STYLES` PR
#62 gave them, which was the other half of §3.11. Nothing about the fold is persisted — every load of
`/kunden/neu` starts closed — and a registration submitted without ever opening it saves the proposed
group.

**The record's group control is deliberately _not_ folded.** `src/app/kunden/[id]/group-control.tsx`
looks like the same control and is not: on `/kunden/neu` the group is a proposal being accepted,
while on the record the choice **is** why the card was opened, and its two group sizes sit beside it
by US-16.4 FR-4. `tests/e2e/customer-record.spec.ts` reaches that one by `getByTestId("group-RED")`
and needed no edit. The two must not be made to match by someone tidying one against the other.

### Numbers, before and after

| Claim                                         | Before  | Target | After |
| --------------------------------------------- | ------- | ------ | ----- |
| Top of `#firstName`, banner on screen         | 752px   | ≤ 560  | 630   |
| Archive panel height, idle                    | 270px   | ≈ 150  | 160   |
| One match row, closed                         | 280px   | ≈ 64   | 56    |
| Page scroll height, empty form                | 1 838px | ≤ 1250 | 1 627 |
| Household row: first input vs. its neighbours | +20px   | 0      | 0     |
| Content box left edge vs. the nav's           | +128px  | 0      | 0     |
| Headings on the screen                        | 8       | —      | 6     |

And after US-19 closed the panel, measured the same way — a production build at 1440×900 on a freshly
seeded demo register (`npm run db:reset && npm run db:demo`) with the free-slot banner on screen:

| Claim                                 | Before PR #62 | After PR #62 | US-19 target | After US-19 |
| ------------------------------------- | ------------- | ------------ | ------------ | ----------- |
| Top of `#firstName`, banner on screen | 752px         | 630px        | ≤ 470        | 548         |
| Archive card height, idle             | 270px         | 160px        | ≤ 90         | 78          |

And after US-20 closed the group choice, measured the same way at 1440×900:

| Claim                         | Before batch 20 | After US-020.1 (open) | US-20 target   | After US-020.2 |
| ----------------------------- | --------------- | --------------------- | -------------- | -------------- |
| `Zuordnung` card height       | 220px           | 259px                 | ≤ 210          | 220px          |
| Top of the `Aufnehmen` button | y = 1 461       | y = 1 500             | ≥ 100px higher | y = 1 461      |

**Neither height target was met, and neither is reachable by folding these radios.** §11.3's PRD
derived both from "roughly 310px today", a number nobody had measured; the card was 220px before the
batch began. The `Zuordnung` card's content is a `flex flex-wrap` row, so it is as tall as its
_tallest_ child — the `Vorgeschlagene Nummer` `Stat` tile, 81px of `py-3` around a two-line
label/value. The group column is 56px closed and 120px open, under the tile in both states, so
folding it cannot move the row and cannot move the button beneath it. The 39px the fold does recover
is the cost of the button-styled summary US-020.1 added, not a saving against the screen as PR #62
shipped it. The fold is therefore worth having for the two lines of visual noise it removes and for
putting the proposal on one legible line — not for page height. A future "make `/kunden/neu` shorter"
story should target the `Zuordnung` footer (69px) or the `Stat` tile, which is where the 220px
actually is, and should measure _which element sets the height_ before it states a budget.

That story never came, and the tile went anyway: US-24 replaced it with the number `<select>`, and
the alignment fix that followed took the row onto the grid. Measured the same way, 1440×900, on a
production build with the demo seed:

| Claim                                 | After US-020.2 | After US-24 | After the alignment fix |
| ------------------------------------- | -------------- | ----------- | ----------------------- |
| `Zuordnung` card height, group closed | 220px          | 235px       | 219px                   |
| Rag between the two columns' controls | n/a (tile)     | 26px        | 0                       |
| Rag between the two hint lines        | n/a            | 24px        | 0                       |

Still not the ≤ 210 that §11.3 asked for, and for the reason recorded above: the budget was derived
from a number nobody had measured. What sets the height now is the card's own padding and its 69px
footer, not anything in the row — which is what a "make `/kunden/neu` shorter" story would have to
take on.

The closed card met its target; `#firstName` did not, and the two criteria could not both hold. 470
is 630 − 160, which assumes the archive card takes **zero** height once closed — but the same story
asks for a closed card of up to 90px, and 78px is what a `CardHeader` of title plus question
measures. What is left above `#firstName` is the page header (92px), the free-slot banner (146px, an
explicit non-goal to touch) and the form's own `Person und Anschrift` header (80px); the form itself
starts at 468px. Only deleting the panel would reach 470, which is a non-goal. At 390px the closed
card is 98px because the question wraps to two lines — the viewport is part of the number.

Two targets from the restyle were not reached, and the arithmetic rather than a quiet drop: §10's budget for
`#firstName` left out the page's own intro paragraph (~48px plus its gap), which §5 says to keep, and
the card's content padding above the first field (~24px). 549 + 80 = 629 against a measured 630. The
page-height target fails for the same reason at scale — four card headers and four card paddings are
~360px the flat sections did not spend, and they are what makes each form's extent legible.
