# Redesigning the customer record (`/kunden/[id]`)

A UX analysis of the customer record as it stands today, and a concept for rebuilding it on the
shadcn/ui primitives — the sixth screen in the conversion `docs/ui_conversion_guide.md` describes,
and the largest one left.

**Status:** built. See `docs/ui_conversion_guide.md` for the outcome and the numbers;
the open questions in §11 were put to FD and their answers are recorded in §12.

This pass also converts **`kunden/archive-controls.tsx` and `kunden/block-controls.tsx`**, which the
record shares with the counter. They are already on a converted screen, so they are a visible seam
today (§3.7); the guide's progress list says to do them here, and this document owns them.

Read `docs/ui_redesign_kunden_neu.md` alongside this: the household editor, the `Stat` tile and the
`SHELL` extraction are shared decisions, made there and used here. Read
`docs/ui_redesign_kunden_verwalten.md` for the colour budget the record has to live inside.

---

## 1. How this was examined

Driven through `playwright-cli` against a production build (`npm run build && npm run start -- --port
3100`) on the freshly seeded demo register, at 1920, 1440, 1280, 800 and 390 px wide. Three records
were measured, because the screen has three quite different shapes:

| Record                     | Why                                                   |
| -------------------------- | ----------------------------------------------------- |
| **13 — Francesco Roecker** | Six-member household, four hand-outs — the big case   |
| **7 — Johann Diezel**      | `BLOCKED`, so the block reason and its control are on |
| **3 — Willi Mohr**         | `ARCHIVED`, so the whole screen renders read-only     |

The accessibility snapshot was read alongside the screenshots, per the conversion guide. Numbers are
measured off the live DOM at 1440×900 unless stated otherwise.

Console: **0 errors, 0 warnings.** Horizontal page overflow: **0 at all five widths.** Nothing is
broken. The screen is 3 623px of correct information in no particular order.

---

## 2. What this screen is for

| #   | Job                                                             | Frequency                              | What the screen must make fast              |
| --- | --------------------------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| A   | **Answer "what is going on with this household?"**              | Every visit, including from `/ausgabe` | Identity, status, counts, certificate, note |
| B   | **Correct the household** — a baby, someone moved out (US-16.1) | The commonest write                    | The member list and its four consequences   |
| C   | **Correct a name or an address** (US-16.2)                      | Occasional                             | Nothing; it must merely be findable         |
| D   | **Record a renewed certificate** (US-16.5)                      | Regularly, per household per year      | Two fields                                  |
| E   | **Leave a note for the counter** (US-16.3)                      | Occasional                             | One field                                   |
| F   | **Move a household between RED and BLUE** (US-16.4)             | Rare                                   | The two group sizes beside the choice       |
| G   | **Reissue a card, block, archive** (US-09, US-08, US-10)        | Rare, irreversible                     | Nothing; it must be deliberate              |

Two things follow.

**A is not a write, and it is most of the traffic.** A record is read whenever a name comes up — from
the customer list, from the counter's "Zur Kundenübersicht" button, from a question at the door. The
screen currently has no read view at all: every fact about the household except the four in
`Stammdaten` is rendered as the current value of an editable input.

**The order of the writes is not the order of the reads.** The page comment states the current order
as deliberate — "who this is, where they live, who lives with them, what they may collect" — and for
a _paper_ record that is right. On screen it puts the least-read section (the address, job C) 512px
above the most-read one (the household, jobs A and B), and it puts the certificate and the note —
both of which exist for the counter — at y = 2126 and y = 2484.

---

## 3. Findings — why it reads cluttered

### 3.1 Eight forms, seventy-two inputs, one page

Record 13 measured: **3 623px** tall, **72** `input`/`textarea` elements, **15** buttons, **8**
`<form>`s, **8** submit buttons, **14** headings (one `h1`, eight `h2`, five `h3`).

Section map:

| Section              | Top  | Height |
| -------------------- | ---- | ------ |
| Stammdaten           | 184  | 144    |
| Person und Anschrift | 360  | 480    |
| Haushalt             | 872  | 950    |
| Gruppe               | 1854 | 240    |
| Bedarfsnachweis      | 2126 | 326    |
| Bemerkung            | 2484 | 286    |
| Bisherige Ausgaben   | 2802 | 297    |
| Aktionen mit Folgen  | 3131 | 404    |

On a 900px viewport the first screenful is: four grey boxes, then a form for correcting the address.
Job A gets `Stammdaten`. Everything else it needs is between one and three screens down.

The five save buttons are right to be five (`record-forms.tsx` argues it well, and they are labelled
after what they save). What is wrong is that they are five identical black slabs at five unpredictable
depths, with nothing bounding the form each one belongs to. **A card is what says where a form ends.**

### 3.2 Nothing is grouped, so nothing is ranked

There is not one container on the screen. Sections are `<section>` + `<h2>` + `gap-8`, so the only
signal that `Bemerkung` has ended and `Bisherige Ausgaben` has begun is 32px of white space. The
converted screens all use one `Card` per section, and the counter — which shows a subset of exactly
this data — reads immediately because of it.

The only bordered things on the screen are 22 hairline boxes: four in `Stammdaten`, four derived
figures, six `Zeile entfernen` buttons, three `<details>` bars, and the danger-zone frame. None of
them is emphasis; all of them together are texture.

### 3.3 A blocked household says so 2 591px away from why

Record 7, measured:

- `customer-status` reads **gesperrt** at **y = 297**, in the same plain grey box as `Kundennummer`,
  with no chrome of any kind;
- `block-reason-current` — the only record the block has, and the sentence read out verbatim at the
  counter — is at **y = 2888**, inside `Aktionen mit Folgen`.

So the fact is unmarked and its explanation is two and a half screens below it, filed under the
controls rather than under the household. `/kunden` gives `BLOCKED` a `destructive` badge in the list;
the record gives it nothing. One meaning, two treatments, and the quieter one is on the screen where
you go to find out what happened.

### 3.4 Six household rows, six ragged baselines

The household editor is the same component shape as `/kunden/neu`'s and has the same defect, six times
over. Each row is a 4-column grid; the first column's label is `Haushaltsmitglied N — Vorname` and
wraps to two lines (**40px against 20**), so the first input starts **20px below** its two neighbours.
Measured on all six rows of record 13: input tops `[60, 40, 40]`, `[154, 134, 134]`, `[248, 228,
228]`, and so on.

The age is inside the birthdate label (`Geburtsdatum (39 Jahre)`), which is a genuinely good idea —
the 13-year boundary is what drives a reissue — but it means the third column's label differs on every
row, so nothing in the block lines up vertically except by accident.

`Nachname` is typed six times as `Roecker`. Six `Zeile entfernen` buttons stack into the strongest
vertical rhythm on the screen, which is `/warteliste`'s "a stack of remove buttons with names
attached" reappearing in a household. The section is **950px**, of which the six rows are 468.

### 3.5 Four single digits in 408px boxes

`Erwachsene 3`, `Kinder 3`, `Portionen 9`, `Preis 9,00 €` are four bordered boxes, each **408px**
wide, each holding one figure. These are the four numbers the whole household section exists to
produce — FR-1 says the point is that the consequences of an edit are visible before it is saved —
and they are the least emphatic thing in it.

The counter shows the same four figures as large tiles and they are the first thing the eye lands on
there. Same data, same application, two ranks.

Below them sit **three** stacked hint paragraphs in three sizes (`text-xs`, `text-xs`, `text-sm`),
five lines of grey prose between the figures and the save button.

### 3.6 The archived banner is not a heading, and it is painted like nothing

Record 3: the banner is 198px, `border-foreground/30 bg-foreground/10` — plain grey — and its
headline `Für diesen Haushalt …` is a **`<p className="text-2xl font-bold">`**, not a heading.

From the snapshot, an archived record's outline runs `h1 → h2 Stammdaten → …` with the banner
contributing nothing. That is `docs/ui_conversion_guide.md`'s trap 1 arriving from the direction the
warteliste doc found it: not a heading deleted by a primitive, but a heading never written — on the
single most important element of that variant of the screen.

The banner is also grey on a screen whose every other panel is grey.

### 3.7 The two shared controls are a visible seam on a converted screen

`ArchiveControls` and `BlockControls` render on `/ausgabe`, which was the conversion pilot. Measured
there, on record 7's lookup: the two `<details>` bars are **1088 × 42px** with `border-radius: 4px`
and a `foreground/20` border, sitting directly under a `Card` with `border-radius: 14px` and beside
`Button`s with `10px`. Three radii and two border systems in one column.

On the record they are three such bars (`Kartenverlust`, `Sperre`, `Archivieren`), each spanning the
full 800px content width. `/karten-neuausstellung` already settled what a `<summary>` should look
like: `buttonVariants({ variant: "outline" })` plus `w-fit`, `list-none` and the webkit marker
override. Closed, a disclosure must not look like a collapsed section spanning the row.

### 3.8 The `h1` names the screen, not the household

Every record's `h1` is **`Kundenübersicht`**, with the household's name as a `<p className="text-xl">`
below it. The nav bar already says which section you are in; the one thing this page has that no
other page has is _which household_. The counter gets this right — its card header is the name, with
`Kundennummer 7 · Kartennummer 7k1` beneath it and the status and group as badges beside it.

`Stammdaten`'s four boxes are that same line, spread over 144px and 800px of width.

### 3.9 It never uses more than 896px, and never changes above 640px

`<main>` is `max-w-4xl`, so the content box starts at **x = 272** where the nav starts at **144** — a
**128px** step, identical at 1920 (512 against 384). And the page height is **3 623px at 800, 1280 and
1920 alike**: the only breakpoint on the screen is `sm:grid-cols-2`, so a 1920px window shows the same
two-column form as an 800px one with 512px of margin either side.

Two of the sections are genuinely wide content — a household of six and a hand-out history — and both
are being squeezed into half the available width.

### 3.10 Green means "saved", and green already means "a slot is free"

`SaveFeedback` confirms every save with `border-green-600/40 bg-green-600/10`. `FREE_SLOT_ACCENT` is
`border-emerald-600/40 bg-emerald-600/15`. Two greens, one budget, and `accents.ts` is explicit that a
meaning gets one colour across the application.

A save confirmation is not a fact about the household; it is transient feedback that is gone on the
next render. It should not be spending a colour (§6).

### 3.11 A read-only archived record is the good version of this screen

Record 3 is **1 640px** with **zero inputs** — less than half the height of record 13 — and it is
markedly easier to read. That is worth saying plainly: the archived variant is what the record looks
like when it is not primarily a set of forms, and it is better. It is not an argument for making the
record read-only; it is an argument for §4.

### 3.12 What the e2e suite does and does not hold

`customer-record.spec.ts`, `age-13.spec.ts`, `reissue.spec.ts`, `archive.spec.ts` and `block.spec.ts`
between them assert `grown-ups`, `children`, `portions`, `price`, `card-number`, `customer-status`,
`reminder-count`, `household-member`, `member-{first-name,last-name,birth-date}-2`, `add-member`,
`household-submit`, `household-saved`, `household-error`, `group-RED`, `group-sizes`, `group-submit`,
`group-saved`, `notes-field`, `notes-submit`, `notes-saved`, `renewal-{type,valid-until,save,saved}`,
`reissue-{open,confirm,submit,error}`, `block-{open,reason,submit}`, `block-reason-current`,
`unblock-{open,submit}`, `archive-{open,confirm,reason,submit,error}`, `archived-banner`,
`archived-reason` and `card-view-link`.

They assert **nothing** about:

| Uncovered                                                       | What that means for the restyle               |
| --------------------------------------------------------------- | --------------------------------------------- |
| `details-first-name` … `details-submit`, `details-saved/-error` | The **entire personal-data form** is unproven |
| `history-row`, `history-paid`, `history-price`, `history-empty` | The hand-out table is unproven                |
| `no-shows`                                                      | Shown only when > 0 — unproven                |
| `notes-text`                                                    | The archived read-only note — unproven        |

Those four areas get hand-driven verification (§10), and they are where a silent regression would
otherwise land.

---

## 4. The concept

### 4.1 Principle

> **A record states what it is before it offers to change it.** Every write stays, exactly as it is
> and with its own audit entry — but the first screenful answers "what is going on with this
> household?", and each form is bounded by the card that names it.

### 4.2 Proposed structure

```
┌─ Nav (existing, sticky, h-12, max-w-6xl) ─────────────────────────────────────┐

  h1  Francesco Roecker              [Rot] [gesperrt]     [ Kundenkarte anzeigen ]
      Kundennummer 13 · Kartennummer 13k1 · aufgenommen am 11.03.2026
      [2 Ausgaben in Folge verpasst]                          ← only when > 0

  ┌─ Alert (destructive): Sperrgrund ─────────────────────────────────────────┐  ← BLOCKED only
  │  Wiederholt aggressives Verhalten …            (whitespace-pre-line)      │
  └───────────────────────────────────────────────────────────────────────────┘
  ┌─ Alert: Dieser Haushalt ist archiviert ───────────────────────────────────┐  ← ARCHIVED only
  │  h2 + reason + "nichts ist mehr änderbar"                                 │
  └───────────────────────────────────────────────────────────────────────────┘

  ┌─ Card: Haushalt ──────────────────────────────────────────────────────────┐
  │  [Erwachsene 3] [Kinder 3] [Portionen 9] [Preis 9,00 €]   ← Stat tiles     │
  │  Table: #  Vorname  Nachname  Geburtsdatum  Alter     [entfernen]         │
  │  [ + Weiteres Haushaltsmitglied ]                                         │
  │  ────────────────────────────────────────────────  [ Haushalt speichern ] │
  └───────────────────────────────────────────────────────────────────────────┘
  ┌─ Card: Bedarfsnachweis ───────────────────────────────────────────────────┐
  │  Art — gültig bis 08.11.2026 · Erinnerungen 0                             │
  │  h3 Neuen Bedarfsnachweis erfassen  [Art] [gültig bis]  [ speichern ]     │
  └───────────────────────────────────────────────────────────────────────────┘
  ┌─ Card: Bemerkung ─────────────────────────────────────────────────────────┐
  ┌─ Card: Person und Anschrift ──────────────────────────────────────────────┐
  ┌─ Card: Gruppe ────────────────────────────────────────────────────────────┐
  ┌─ Card: Bisherige Ausgaben ────────────────────────────────────────────────┐
  ┌─ Card: Aktionen mit Folgen ───────────────────────────────────────────────┐
  │  h3 Kartenverlust     [ ▸ Karte neu ausstellen (Verlust) ]   ← w-fit      │
  │  h3 Sperre            [ ▸ Sperren ]                                       │
  │  h3 Archivieren       [ ▸ Diesen Haushalt archivieren ]                   │
  └───────────────────────────────────────────────────────────────────────────┘
```

Seven decisions carry it.

**(a) The page moves to the shared `SHELL`** — `max-w-6xl … p-6 md:p-8`, the constant extracted in the
`/kunden/neu` pass. It lines up under the bar (§3.9), and the 256px it adds go to the two sections
that are actually wide: the household table and the hand-out history. Field grids stay narrow (§4.2e).

**(b) The header becomes the record.** The `h1` is the household's name; `Kundenübersicht` is deleted
as a heading — the nav and the browser tab already say where you are, and `card.heading` survives for
the not-found page. Under it, one muted line: `Kundennummer 13 · Kartennummer 13k1 · aufgenommen am
11.03.2026`. Beside it, the group and the status as `Badge`s, using the **same chrome table as
`/kunden`** (`STATUS_CHROME` — nothing for `ACTIVE`, `destructive` for `BLOCKED`, `outline` for
`ARCHIVED`) and `GROUP_STYLES` for the group.

`Stammdaten` as a section disappears; nothing in it is lost. `card-number` and `customer-status` keep
their exact text in spans of their own — the separators sit outside them (constraint 1).

`Kundenkarte anzeigen` moves from a stranded link at the bottom of the page into the header row as a
`Button variant="outline" asChild`. This is the guide's stated exception: a link naming a _record_ —
here, this household's printed card — stays, because the four-item bar cannot express it.

**(c) The block reason moves to the top, the block control stays at the bottom.** The fact is a state
of the household and belongs where states are stated; the control is irreversible-ish and belongs
behind the heading that says so. An `Alert variant="destructive"` under the header carrying
`block-reason-current` with its `whitespace-pre-line`, and `BlockControls` untouched in
`Aktionen mit Folgen`. That is exactly the split `/kunden` and the counter already make.

**(d) The archived banner gets a real `<h2>` and the `outline` treatment.** Trap 1, fixed. It stays the
first thing on the page and it stays loud — but loud through a ring and the `archiviert` badge in the
header, not through another grey fill on a grey page. It keeps `archived-banner`, `archived-reason`
and its exact sentence.

**(e) One `Card` per section, one save per card, in `CardFooter`.** The five save buttons keep their
five distinct labels — that argument in `record-forms.tsx` is right and the labels are what make them
distinguishable by keyboard and by screen reader. What changes is that each now sits in the footer of
the card holding its own form, so a reader can see what a button is about to save.

`SaveFeedback` becomes an `Alert role="status"` beside the button, and **loses its green** (§6).

Field grids inside the cards use the same 12-column scheme as `/kunden/neu` (§4.2d there), so
`Hausnummer` and `PLZ` stop being 408px wide.

**(f) The household section leads, and its four figures lead it.** The `Stat` tile extracted in the
`/kunden/neu` pass, four across at `lg`, above the member table — the same shape and the same rank the
counter gives them. The member list becomes a `Table` with the age as a column of its own, which fixes
the six ragged baselines and the six differing labels in one move (§4.2f of the `/kunden/neu` concept
has the full argument; it is one component serving both screens).

The three stacked hint paragraphs collapse to one: `derived.hint` and `derived.standardValues` become
the card's `CardDescription`, and `record.householdHint` — the one that explains the cards-due
consequence — stays above the save button, where it is about to matter. That is a content change (§8).

**(g) The section order changes to the order the record is read.** Header, block/archive alert,
**Haushalt**, **Bedarfsnachweis**, **Bemerkung**, then `Person und Anschrift`, `Gruppe`,
`Bisherige Ausgaben`, `Aktionen mit Folgen`.

The current order is a deliberate decision with a comment arguing for it, so this is the one change
here that should not be made quietly. The argument against the comment: the address is the least-read
thing on the screen and costs 480px above the household; the certificate and the note both exist _for
the counter_, and both are currently below 2 100px. Nothing is removed and nothing is renamed — only
the order changes, and it is trivially reversible.

Marked ⚠️ in §8, sequenced last, and listed as an open question for FD (§11 q1).

### 4.3 The two shared controls

Converted here, used on two screens. `ArchiveControls`, `BlockControls` and `ReissueControls` all take
the `/karten-neuausstellung` summary recipe:

```tsx
<summary className={cn(buttonVariants({ variant: "outline" }), "w-fit list-none [&::-webkit-details-marker]:hidden")}>
```

They stay `<details>`/`<summary>` — guide rule 4, and here the product argument is the counter's: the
queue is waiting, and nothing may have to be dismissed before the next customer can be served. The
`<details>` is also what several specs click directly by testid.

Inside them, the confirmation becomes an `Alert`, the reason field a `<Textarea>` + `<label htmlFor>`,
and the submit a `Button variant="destructive"` — replacing the current `bg-red-700 text-white`, which
is the only solid red in the application and shouts louder than the archive it sits above. The
disabled-until-a-reason-is-typed rule is untouched: it is asserted, and it is FR-1.

**Both screens must be checked in this pass.** `/ausgabe` is where the seam is visible today, and it
is a converted screen, so a regression there is a regression in finished work.

### 4.4 The hand-out history

It is already a real `<table>` and reads well; it becomes the `Table` primitive with
`TableHeader`/`TableRow`/`TableHead`/`TableCell`, `hover:bg-transparent` on the header row, and
`tabular-nums` kept on the date and price columns.

One judgement to make with the "count how many rows will wear it" rule: **`Bezahlt: nein` is the
exception** — 8 of 42 hand-outs across the demo register. That is a badge's worth of rarity. But
`Erschienen: nein` is a second exception in the same table and a no-show is not a debt, so two chromes
in one small table is texture again. **Recommendation: no chrome in the history**, and revisit if FD
say they scan it for unpaid visits. The words already say it, which is the requirement.

`history-empty` becomes an `Alert role="status"` inside the card, for the same reason
`waiting-list-empty` did: a bare paragraph reads like a table that failed to load.

### 4.5 What is deliberately _not_ changed

- **Five forms, five saves, five audit entries.** The edits are separate decisions (PRD §7). Nothing
  here merges them, and no "alles speichern" button appears.
- **The read-only archived variant.** Every form is replaced by the same values as text (FR-8). It
  gets the same cards and the same tiles; it does not get inputs.
- **The customer number is not editable, and no field for it appears.** The use case takes none
  (US-16.2 FR-7).
- **The group radios stay uncontrolled**, with `defaultChecked` from the record. `group-control.tsx`
  has a four-sentence comment explaining that a controlled radio comes back showing the old group
  after React resets the form. A conversion that "tidies" that into a controlled input reintroduces a
  bug nobody will find for months.
- **`<details>` everywhere it is today** — rule 4, and the specs click them.
- **The two group sizes stay beside the group choice** (FR-4): the move is decided by comparing them.
- **`force-dynamic`.** The screen shows data its own forms write.
- **The renewal form's remount key** (`key={state.saves}`), which is what gives the next renewal an
  empty form.

---

## 5. Mapping to shadcn/ui

Everything needed is installed. No `shadcn add` required.

| Element today                                                                       | Becomes                                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `<main className="max-w-4xl … p-8">`                                                | the shared `SHELL`, imported                                                 |
| `<h1>Kundenübersicht</h1>` + name `<p>`                                             | `<h1>` = the name; identity line as one muted `<p>`                          |
| `Stammdaten`'s four `Field`/`Derived` boxes                                         | the identity line + `Badge`s in the header row                               |
| `Section` (`<section>` + `<h2>`)                                                    | `Card` / `CardHeader` / `CardTitle` wrapping a real `<h2>` / `CardContent`   |
| `ArchivedBanner` `<section>` + `<p className="text-2xl">`                           | `<Alert>` with a real `<h2>` inside (trap 1)                                 |
| `block-reason-current` `<p className="border-red-500/40 …">`                        | `<Alert variant="destructive">` under the header, `whitespace-pre-line` kept |
| `Derived` (three separate definitions)                                              | the extracted `Stat` tile — one definition                                   |
| household `<ul>` / `<li className="grid sm:grid-cols-4">`                           | `Table`; `household-member` moves to `TableRow`; age becomes a column        |
| `HouseholdReadOnly`'s `<ul>`                                                        | the same `Table`, values as text — one shape for both variants               |
| `fieldClass` `<input>` + nested `<label><span>`                                     | `<Input id>` + `<label htmlFor>`                                             |
| `notes-field` `<textarea>`                                                          | `<Textarea>` + `<label htmlFor>`                                             |
| `SaveButton` (`bg-foreground …`)                                                    | `<Button type="submit">` in `CardFooter`                                     |
| `SaveFeedback` saved / error                                                        | `<Alert role="status">` / `<Alert variant="destructive" role="status">` (§6) |
| the history `<table>`                                                               | `Table` / `TableHeader` / `TableRow` / `TableHead` / `TableCell`             |
| `history-empty` `<p>`                                                               | `<Alert role="status">` inside the card                                      |
| `Gruppe` `<fieldset>` + native radios                                               | stays native; each option wears `GROUP_STYLES` (§6)                          |
| the danger `<div className="rounded-xl border">`                                    | one `Card`; the three `<h3>`s stay                                           |
| `reissue-open`, `block-open`, `unblock-open`, `archive-open`                        | `<summary>` styled `buttonVariants({ variant: "outline" }) w-fit` (§4.3)     |
| `archive-confirm` (amber), `reissue-confirm`, unblock confirm                       | `<Alert>` — destructive for archive and block, neutral for reissue/unblock   |
| `block-submit` (`bg-red-700 text-white`)                                            | `<Button variant="destructive">`                                             |
| `archive-submit`, `reissue-submit`, `unblock-submit`                                | `<Button variant="destructive">` / `default`                                 |
| `card-view-link` `<Link className="underline">`                                     | `<Button variant="outline" asChild><Link>` in the header row                 |
| `border-foreground/15,/20,/30`, `bg-foreground/5,/10`, `text-foreground/60,/70,/80` | `border-border`, `bg-muted/50`, `text-muted-foreground`                      |

**`Label` is `"use client"`.** The record is a server component holding client editors. Inside a
client editor `Label` is free; in the server-rendered read-only variant, use a plain `<label>` or a
`<th scope="row">` rather than pushing a client boundary in for styling — the guide's pilot finding.

**Do not reach for:** `Dialog` (rule 4, and the specs), `Accordion` for the sections (a record whose
sections must be opened is a record you cannot scan), `Tabs` (they hide half the record and break
`getByRole("main")` `toContainText` assertions that sweep the whole page), or a `DataTable`.

---

## 6. Colour, after

| Meaning                        | Treatment                                  | Why                                                         |
| ------------------------------ | ------------------------------------------ | ----------------------------------------------------------- |
| Gruppe Rot / Blau              | `GROUP_STYLES` + the word                  | The colour _is_ the printed card (guide rule 9)             |
| Status `gesperrt`              | `Badge variant="destructive"` + the word   | Same as `/kunden`'s `STATUS_CHROME` — one meaning, one mark |
| Status `archiviert`            | `Badge variant="outline"` + the word       | Likewise                                                    |
| Status `aktiv`                 | **no chrome**                              | Nine records in ten; a pill on it says "this is normal"     |
| The block reason               | `Alert variant="destructive"`              | It is the reason a household is being refused               |
| The archive banner             | `Alert`, `outline` weight, no fill         | A state, not an alarm; the household is simply gone         |
| A certificate that has lapsed  | amber + the words                          | The application's one amber (`/kunden`, the counter)        |
| Archive / block confirmation   | `Alert variant="destructive"`              | About to do something that cannot be typed over             |
| Reissue / unblock confirmation | neutral `Alert`                            | Consequential, not destructive — a new card, a lifted block |
| **A save succeeded**           | **neutral `Alert role="status"`, no tint** | Transient feedback, not a fact about the household (§3.10)  |
| Everything else                | tokens                                     | —                                                           |

Dropping the save confirmation's green settles §3.10: **green means "a slot is free", once, across the
application.** The confirmation loses nothing — it is a `role="status"` region whose text says
`gespeichert`, and it is asserted by text, not by colour.

> **Superseded in part.** FD asked for the registration confirmation on this screen — the sentence
> shown when a record is arrived at straight from `/kunden/neu` — to be green, and that is their call
> to make. Green therefore now carries two meanings, both named in `src/app/accents.ts`:
> `CONFIRMATION_ACCENT` for **a completed act** (a hand-out recorded, a certificate renewed, a
> household taken on) and `FREE_SLOT_ACCENT` for a free customer number. What this section decided
> still holds where it was aimed: **a save is not a completed act**, so the six `SaveFeedback`
> confirmations on this screen stay neutral. The boundary, and the argument for it, is written at
> `SaveFeedback` in `kunden/[id]/record-forms.tsx`.

Both literal tints come from `src/app/accents.ts`. Neither is invented here, and neither travels
without its word (US-03.4).

---

## 7. Constraints the implementation must not break

Beyond the ten in `docs/ui_conversion_guide.md`. These come from `customer-record.spec.ts`,
`age-13.spec.ts`, `reissue.spec.ts`, `archive.spec.ts`, `block.spec.ts` and `reregistration.spec.ts`,
which must pass **with no test edited**.

1. **`card-number` and `customer-status` hold exactly their value** — `toHaveText(\`${n}k1\`)`and`toHaveText(de.customers.status.X)`. In the new identity line the separators and the labels sit
**outside** those spans, and a `Badge` may wrap the status span but must not replace it
(`StateWord`in`kunden/page.tsx` is the pattern).
2. **`grown-ups`, `children`, `portions`, `price` hold exactly the figure**, and are re-read _after a
   household edit_ — `age-13.spec.ts` drives them live. A `Stat` tile may wrap them.
3. **`household-member` counts are asserted** (`toHaveCount(2)`), in both the editable and the
   read-only variant. One element per member, in both.
4. **`member-first-name-2`, `member-last-name-2`, `member-birth-date-2`** are filled by testid at
   index 2 — the positional numbering is part of the contract, and a new row must still be index
   `rows.length`.
5. **`block-reason-current` holds exactly the reason and must be absent (`toHaveCount(0)`) when the
   household is active.** Moving it to the header is fine; duplicating it is not.
6. **`reissue-confirm` keeps its exact sentence** naming both card numbers, and `reissue-error` must
   be `toHaveCount(0)` on success.
7. **`block-submit` and `archive-submit` stay disabled until a reason is typed** — asserted with
   `toBeDisabled()`, twice, before and after whitespace-only input.
8. **`archive-open`, `block-open`, `unblock-open`, `reissue-open` stay clickable `<summary>`
   elements** reached by testid. No `Dialog`, no portal.
9. **`archived-banner` and `archived-reason` keep their testids and exact text**, and the reason keeps
   `whitespace-pre-line`.
10. **`group-sizes` keeps its exact sentence**, and its `innerText` is read in one spec — so it stays
    one element holding one string.
11. **`renewal-saved` keeps its exact text**, and `reminder-count` must read `0` after a renewal.
12. **`card-view-link` keeps its testid** and still points at `/kunden/<id>/karte`. Moving it into the
    header row is fine; it is asserted in two specs.
13. **`getByRole("main")` `toContainText(...)` sweeps** are used for the customer's name, the
    certificate type and its date. Nothing may move out of `<main>`.
14. **The five submit buttons keep their five distinct accessible names.**
15. **Every new German string goes in `src/i18n/de.ts`.** The identity line's separator format is a
    new key; so is anything the header says that `Stammdaten` used to.
16. **Give every `CardTitle` a real `<h2>`**, and give the archived banner the `<h2>` it never had
    (§3.6).

---

## 8. Restyle vs. content change

| Change                                                               | Restyle? | Notes                                                        |
| -------------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| Shell width, cards, tokens, `Input`/`Textarea`/`Button`/`Table`      | ✅       | Pure conversion                                              |
| `Stat` tiles for the four derived figures                            | ✅       | Uses the extraction from the `/kunden/neu` pass              |
| Household `<ul>` → `Table`, age as a column                          | ✅       | Structure; testids and ids keep their own text               |
| 12-column field grids                                                | ✅       | `className`                                                  |
| Saves into `CardFooter`; `SaveFeedback` → `Alert`                    | ✅       | Element swap                                                 |
| Save confirmation loses its green                                    | ✅       | `className`; asserted by text, not colour                    |
| `<summary>` → `w-fit` outline button; `bg-red-700` → `destructive`   | ✅       | `className` — **changes `/ausgabe` too**                     |
| Status and group as `Badge`s, from `/kunden`'s chrome table          | ✅       | Imported constants                                           |
| History `<table>` → `Table`; `history-empty` → `Alert`               | ✅       | Element swap                                                 |
| **`h1` becomes the household's name; `Stammdaten` becomes one line** | ❌       | New key, one heading fewer — own commit                      |
| **`card-view-link` moves into the header row**                       | ⚠️       | Guide's stated exception; harmless, but not a restyle        |
| **The block reason moves under the header**                          | ⚠️       | Structure with a product argument — own commit               |
| **Three household hints collapsed to one + a `CardDescription`**     | ❌       | Content — own commit                                         |
| **Section order changed (§4.2g)**                                    | ⚠️       | Contradicts a documented decision — own commit, own argument |

Suggested sequence: **(1)** the shared controls, converted and checked on both screens — smallest
diff, biggest visible seam closed → **(2)** the record's conversion, e2e green untouched → **(3)** the
header and the block reason → **(4)** the copy → **(5)** the section order, if FD want it.

Splitting (1) out first is worth the extra PR: it is the only part of this pass that changes a screen
somebody has already signed off, and a green suite means more when that is the only thing in the diff.

---

## 9. Responsive

- **≥ 1280px** — the target. Four `Stat` tiles across, household table on one line per member, the
  history table comfortable.
- **~1024px** — tiles drop to two across; the household table is the thing to watch. Measure
  `documentElement.scrollWidth - clientWidth` **at** 1024: `/kunden` pushed the page 26px sideways
  exactly there because ten columns needed more than an `lg` content box had, and it was invisible at
  800 and 1440.
- **~800px** — one column of tiles or two; the household table scrolls inside its own
  `[data-slot=table-container]`. That container must be the only thing that scrolls — and note
  `Card` ships `overflow-hidden`, so a table meant to scroll inside a card needs
  `<Card className="overflow-visible">` or it gets a second scrollport.
- **390px** — today the page is 5 467px. Target is only: no page-level horizontal overflow (already
  true) and the danger-zone summaries not spanning the screen.
- **No sticky table header** on either table. The household is at most a dozen rows and the history a
  few dozen; the three-cause bug the guide records for `/kunden` is not worth inheriting for that.

---

## 10. Verification, before the PR is opened

```bash
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:e2e                    # with no test edited
pkill -f next-server && npm run build && npm run start -- --port 3100 &
curl -s http://127.0.0.1:3100/kunden/13 | grep -c "<a string you just added>"   # prove the build
playwright-cli open http://127.0.0.1:3100/kunden/13
playwright-cli snapshot             # read it
```

Numbers to take, before and after, at 1440×900 on the freshly seeded demo register:

| Claim                                                               | Before  | Target             |
| ------------------------------------------------------------------- | ------- | ------------------ |
| Page height, record 13 (six members, four hand-outs)                | 3 623px | ≤ 2 600            |
| Top of the first derived figure (`grown-ups`)                       | 1 526px | ≤ 400              |
| Top of `Bedarfsnachweis`                                            | 2 126px | ≤ 1 200            |
| Top of `Bemerkung`                                                  | 2 484px | ≤ 1 600            |
| Distance from `customer-status` to `block-reason-current`, record 7 | 2 591px | ≤ 200              |
| Household row: first input top vs. its two neighbours               | +20px   | 0, on all six rows |
| Household section height, six members                               | 950px   | ≤ 620              |
| Bordered boxes above the fold that are not form fields              | 4       | 1 card             |
| Content box left edge vs. the nav's                                 | +128px  | 0                  |
| Headings on an archived record naming the banner                    | 0       | 1                  |

The budget behind "≤ 400" for the first figure: nav 48 + padding 32 + `h1` 36 + identity line 24 +
gap 24 + card header 65 + card padding 16 ≈ 245, plus a block alert (~90) where there is one. If a
target comes out higher, **say so with the budget** rather than dropping it quietly —
`docs/ui_redesign_kunden_verwalten.md` §12.4 records what that mistake costs.

Then, by hand, because the suite does not cover them (§3.12):

- **Edit a name in `Person und Anschrift`, save, and confirm** the confirmation appears, the value
  sticks, and the household row for that person changed with it. This form has **no e2e at all**.
- **Submit it with an empty first name** and confirm the refusal renders where the confirmation would.
- **A record with no hand-outs** (`history-empty`) and one with several — check the table and the
  price-was-what-it-was hint.
- **A record with `consecutiveNoShows > 0`** (record 10 in the demo register) and one with zero — the
  figure must be absent, not zero.
- **An archived record** (record 3): the banner announces as a heading, every form is gone, the notes
  render as text, and the household table shows values without inputs.
- **A blocked record** (record 7): the reason at the top, verbatim, with its line breaks; unblock from
  the danger zone; confirm the alert disappears.
- **Both shared controls on `/ausgabe`** — look up record 7 and record 13, open each disclosure,
  archive nothing but check the disabled-until-a-reason rule holds.
- **Reissue a card** and check the card number changes in the header line.
- Snapshot: an `<h2>` per card, the household a `table` with column headers, every field a named
  `textbox`, every confirmation a `status` region, the block reason an `alert`.
- `playwright-cli console` — 0 errors, at all five widths.
- `playwright-cli show --annotate` to put it in front of FD before merging.

Driving these flows **writes to `data/fd.db`** — and several of them are irreversible. Use a throwaway
seed: `npm run db:reset && npm run db:demo` before and after.

---

## 11. Open questions

1. **The section order (§4.2g).** The current order is documented as deliberate. Do FD open a record
   more often to read it or to change it — and when they change it, is it more often the household or
   the address? The answer decides §4.2g, and it is the only question here that changes the concept
   rather than the styling.
2. **Does anybody read `Bisherige Ausgaben`?** It is 297px and four rows on a demo household; on a
   two-year-old record it will be fifty. If it is only ever consulted when something is disputed, it
   could become a disclosure and give the record back a screenful.
3. **Should the record show the _previous_ record for a re-registered household?** `previousCustomerId`
   is carried through registration as display metadata (US-11 FR-5) and nothing on this screen shows
   it. A returning household currently looks like a brand-new one.
4. **`Bezahlt: nein` in the history** — §4.4 recommends no chrome. Do FD scan the history for unpaid
   visits, or is that the counter's business only?
5. **Is `Kundenübersicht` load-bearing as a word?** §4.2b deletes it as a heading. If FD refer to the
   screen by that name out loud, it should stay somewhere — most likely as the browser tab title.

---

## 12. What was decided, and what was built

FD were asked the questions in §11 before any code was written. Their answers:

| Question                                      | Answer                                                          |
| --------------------------------------------- | --------------------------------------------------------------- |
| §11.1 / §8 ⚠️ The section order               | Reorder to the reading order — built as §4.2g describes         |
| §11.2 Does anybody read `Bisherige Ausgaben`? | Fold it away — built as a closed `<details>`                    |
| §11.3 Show the previous record?               | Out of scope: a feature, not a restyle. Still open              |
| §11.4 `Bezahlt: nein` chrome                  | Settled from §4.4's own recommendation: no chrome               |
| §11.5 Is `Kundenübersicht` load-bearing?      | Kept as the browser tab title and the not-found heading         |
| §8 ⚠️ `card-view-link` into the header        | Built — the guide's stated exception for a link naming a record |
| §8 ⚠️ The block reason under the header       | Built; the measurement settles it, 2 602px → 116px              |

The hand-out history can be closed by default where `/kunden/neu`'s archive search cannot, because
no spec reaches inside it (§3.12) — the same fact that made it the riskiest part of this pass makes
it the safest to fold.

### Numbers, before and after

| Claim                                                       | Before  | Target  | After |
| ----------------------------------------------------------- | ------- | ------- | ----- |
| Page height, record 13                                      | 3 623px | ≤ 2 600 | 2 907 |
| Top of the first derived figure (`grown-ups`)               | 1 537px | ≤ 400   | 255   |
| Top of `Bedarfsnachweis`                                    | 2 126px | ≤ 1 200 | 953   |
| Top of `Bemerkung`                                          | 2 484px | ≤ 1 600 | 1 330 |
| `customer-status` → `block-reason-current`, record 7        | 2 602px | ≤ 200   | 116   |
| Household row: first input vs. its neighbours, all six rows | +20px   | 0       | 0     |
| Bordered boxes above the fold that are not form fields      | 4       | 1 card  | 1     |
| Content box left edge vs. the nav's                         | +128px  | 0       | 0     |
| Headings on an archived record naming the banner            | 0       | 1       | 1     |
| Page height, record 3 (archived)                            | 1 640px | —       | 1 443 |

Four of the five depth targets are beaten. Page height lands at 2 907 against 2 600: nine card
headers at ~65px and nine card paddings are ~1 000px the flat sections never spent, and they are
what makes each of the eight forms' extent legible — §3.1's actual complaint. Folding
`Bisherige Ausgaben` bought 297px. Getting under 2 600 needs a second section folded, and which one
is a question for FD rather than a number to chase.

### Follow-up: the header realigned after the counter moved

§3.8 and §4.2b built this header by pointing at the counter, and the counter has since changed: it
states both numbers as 36px tiles, because there the customer number is called across the room to
fetch the next household and the card number is compared against the card being held out. This
record was left imitating a screen that no longer existed — the same two facts at 14px in a muted
line with colons, on the screen you arrive at _from_ the counter.

What changed, and what did not:

- `Kundennummer` and `Kartennummer` are now `Stat` tiles, **at 24px** — one step below the counter's
  36 and below this screen's own 30px `h1`. Deliberately not the counter's size: a reader here
  already knows which household they opened, so the identity is confirmation rather than the task.
  Same shape, different rank.
- **They sit in a `Card` of their own, and the `h1` stays outside it.** The identity was left bare
  under the heading at first, and FD's reaction to it was that it looked "lost" — every other block
  on the page has the thin ring around it and this one had nothing. That reaction is right and the
  reason is mechanical: `--background` and `--card` are the same white, so a `Card` is _only_ its
  ring, and a run of label/value pairs without one has nothing at all saying where it begins and
  ends. A heading does not need that boundary — it is its own — so the card starts below the `h1`
  rather than wrapping it, which also keeps this screen from becoming the only one whose heading
  sits inside a card (`docs/ui_conversion_guide.md`, "Page skeleton"). It is the counter's customer
  card and the printed card's header, one rank down.
- **No `CardTitle` on it.** §4.2b dissolved `Stammdaten` as a section on the argument that these
  facts read better with no heading over them, and that still holds. What came back is a boundary,
  not the section — and one container, not the four grey boxes that decision actually removed.
- The tiles use the household card's own `grid-cols-2 sm:grid-cols-4`, so `Kundennummer` and
  `Kartennummer` land in the same two columns as `Erwachsene` and `Kinder` below them — measured
  `208..431` and `475..698` in both cards. The page has one column rhythm from the identity down.
- **The registration date was tried as a third tile and rejected.** Being the longest string, it came
  out the widest and boldest thing in the row — the least-read fact drawing the eye first. It is a
  `Field` line beneath, which also makes the tile pair exactly the pair the counter states.
- `Field` **lost its tile chrome.** It had been `rounded-lg bg-muted/50 px-4 py-3` — a `Stat` tile's
  class list exactly — while reading inline at 14px. It is now the record's one inline idiom, and the
  two hand-rolled copies of it (the reminder tally, the no-show run) call it instead.
- The colon stays on the inline lines and is absent from the tiles, which is the rule rather than an
  inconsistency: a line break separates a stacked pair, a space does not separate an inline one.
- **`/ausgabe` was pulled onto this screen's tables**, not the other way round. Its local group
  palette was a solid `bg-red-600 text-white` copy of `accents.ts`'s tint, and its local status table
  badged `aktiv`. Both now use `GROUP_STYLES` and `STATUS_CHROME`, so a household's group and status
  look the same on the list, the record and the counter. §6 of this document was already right; the
  counter had simply never been brought to it.

Cost, measured at 1440×900 on a plain active record — `grown-ups`, §10's ≤ 400 target:

|                                                    | `grown-ups` |
| -------------------------------------------------- | ----------- |
| Before (one muted 14px line)                       | 255px       |
| Tiles, no card                                     | 339px       |
| Tiles, no card, no fill (the "lost" version)       | 315px       |
| **Tiles in their own card — built**                | **391px**   |
| The whole header in a card — measured and rejected | 371px       |

391 against 400 is inside the budget with 9px to spare, and it is stated here rather than the budget
quietly dropped. Wrapping the whole header was 20px cheaper and was rejected anyway: on this page a
card means "here is where a form ends" — all seven of the others bound an editable section with its
own save and its own audit entry — and the heading row bounds nothing, so the same chrome would call
the household's name a section rather than the subject the sections are about.

Worth recording that the intermediate step made it worse: taking the fill off the tiles was an
attempt to fix the mismatch by removing the signal rather than supplying what it pointed at, and it
left the block with neither body nor boundary. The fill says "I am inside a container"; the fix is
the container.

Five e2e assertions swept `getByRole("main")` for `Kundennummer: 7` and now read the
`customer-number` testid instead (`archive`, `reregistration` ×2, `registration`, `waiting-list`).
They assert that the right number reached the record after a redirect; that intent is intact and the
assertion is now stronger than a page-wide text sweep. This is the one place the pass's "with no test
edited" rule could not hold — the specs were the only thing holding an idiom no other screen used.

### Still open after this pass

- **§11.3, the previous record for a re-registered household.** `previousCustomerId` is carried
  through registration and nothing shows it; a returning household still looks brand new. That is a
  feature with a use case behind it, not a restyle.
- **A spec for the archive-search criteria and the apply feedback.** Both were fixed and both were
  hand-verified; neither could be given a test without touching the suite this work held still.
