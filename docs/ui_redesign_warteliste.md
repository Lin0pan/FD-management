# Redesigning "Warteliste" (`/warteliste`)

A UX analysis of the waiting-list screen as it stands today, and a concept for rebuilding it on the
shadcn/ui primitives — the third screen in the conversion `docs/ui_conversion_guide.md` describes,
after the `/ausgabe` pilot and `/kunden`.

**Status:** built. §§4–6 describe the screen as it now stands; §§1–3 are the analysis it came from,
kept as the record of what was wrong. Three departures, all recorded in the commits: §10's first-row
(≤360px) and page-height (≤1200px) targets came out at 431 and 1293, with the budget that shows why
— the banner is 146px and the order rule needs two lines as the list card's description; the anchor
of §4.2f was built, but **not** the matching fragment on `/kunden/neu`'s link, because
`waiting-list.spec.ts:177` waits for `**/warteliste` and that glob does not match a URL with a hash;
and §4.2's tinted notice inside the emerald banner carries its amber in the border, because a
translucent amber over emerald composites into olive. §11 q1, q2 and q4 are still open; q3 is
answered — the anchor is built and worth keeping.

Read `docs/ui_redesign_kunden_verwalten.md` alongside this: the colour budget it arrived at, the
"chrome marks the exception" rule and the argument for measuring the claim all carry over, and this
screen breaks the same rules in its own way.

---

## 1. How this was examined

Driven through `playwright-cli` against a production build (`npm run build && npm run start -- --port
3100`) on the demo register — 3 applicants, one free customer number, so the banner is on screen —
at 1920, 1440, 1280, 800 and 390 px wide. The accessibility snapshot was read alongside the
screenshots, per the conversion guide. Numbers below are measured off the live DOM, not estimated.

Console: **0 errors, 0 warnings.** Horizontal page overflow: **0 at all five widths.** Nothing here
is broken. The screen ranks its contents almost exactly backwards, which is a different problem.

---

## 2. What this screen is for

The waiting list only exists while the register is full: 240 numbers are all taken, somebody wants to
be taken on, and the answer has to be fair rather than fast. Four jobs, in the order they matter:

| #   | Job                                                                     | Frequency                               | What the screen must make fast              |
| --- | ----------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| A   | **A number came free — who gets it, and register them** (FR-4)          | Every archive, so a handful a year      | The banner, and the way from it to the form |
| B   | **Put somebody on the list** — usually arriving from `/kunden/neu`      | Whenever a full register turns one away | The add form, reachable without a hunt      |
| C   | **Answer "where do I stand?"** at the door, and "how long has it been?" | Ad hoc, at the counter                  | Name, position, waited-since                |
| D   | **Take somebody off the list** (FR-6)                                   | Rare — withdrawn, moved away            | Nothing; it must merely be findable         |

Two things follow that the current layout does not reflect.

**A is the feature.** PRD §6 says it outright: _"The 'a slot is free' banner is the feature's whole
value: without it, staff must remember to check the list."_ On screen it is the palest thing there.

**B arrives by link.** `de.customers.new.waitingListLink` — "Stattdessen auf die Warteliste setzen" —
sends a staff member here with a person standing in front of them, and the form they need is the last
thing on the page, below every applicant already on it.

**The order is the other feature.** `de.waitingList.orderRule` is not decoration: it is the fairness
contract, and it is the answer to the question staff actually get asked. PRD §6 forbids column
sorting for the same reason — _"a sortable list invites the exact unfairness the strict ordering
exists to prevent"_. Nothing in this concept may make the list re-orderable, and that rules out one
otherwise obvious idea (§4.4).

---

## 3. Findings — why it reads flat

### 3.1 The one thing that matters is painted like the one thing that does not

The free-slot banner is `border-foreground/30 bg-foreground/5` — a neutral grey panel. Its heading is
`text-xl`, the same size as each applicant's name below it. The position pill on every row is
`bg-foreground/10`: **the same grey family, one step darker**. So the screen's single call to action
and its most repeated piece of furniture are painted from the same tin, and the banner is the lighter
of the two.

Meanwhile `/kunden` already has a colour for exactly this state. `FREE_SLOT_ACCENT` in
`kunden/page.tsx:456` is `border-emerald-600/40 bg-emerald-600/15`, worn by the `waiting-list-badge`
when `data-free-slot="true"` (US-18.2). **The hub says "a slot is free" in emerald and the waiting
list says it in grey.** One meaning, two colours, and the quieter one is on the screen where the act
is performed.

### 3.2 The banner and row 1 say the same thing twice, and only one of them can act

The banner names Mayra Koszewski and offers "Jetzt registrieren". Directly below it, row 1 names
Mayra Koszewski and offers "Von der Warteliste nehmen". Nothing marks row 1 as the row it is about;
nothing marks the banner as being about row 1. A reader who scrolls past the banner — and at 900px
tall, two thirds of the list is below the fold — sees the head of the queue offering only the
destructive action.

### 3.3 A row is 214px tall and spends 36 of them on the rarest action on the screen

Measured at 1440×900: each `waiting-list-row` is **214px**, laid out as four stacked bands separated
by `gap-4`:

```
[Platz 1] [Name]                                          ← 28px
Angemeldet am: …    Wartet: …    Nachweis gültig bis: …   ← 24px, three columns
Erreichbarkeit: …                                         ← 24px
[▸ Von der Warteliste nehmen]                             ← 36px, full width, bordered
```

Three of those bands are 24–28px of text. The fourth is a **780px-wide bordered bar** — the only
boxed element inside the row, so it is the first thing the eye lands on — and it carries job D, the
one staff do least. The list therefore reads as a stack of remove buttons with names attached.

Consequences, measured: the first row starts at **y = 474** on a 900px viewport, so **two applicants
are visible before scrolling**; the whole page is 1858px on a three-applicant demo. A realistic
fifteen-applicant list would run to roughly **4 600px**, of which 540 are the fifteen remove bars.

### 3.4 The form staff are sent here to fill in is the last thing on the page

`AddApplicantForm` is nine fields plus a note field, always expanded, at the bottom: it starts at
**y = 1172** and is 686px of the page's 1858. It is right that it is always open — a disclosure would
add a click to job B and a place for it to hide — but it is wrong that arriving from
`/kunden/neu`'s link means scrolling the entire queue to reach it.

### 3.5 Two paragraphs of prose before anything happens

`intro` and `orderRule` are four lines, ~50 words, 96px plus a 24px gap, at the top of every visit.
The first defines who ends up on the list, which the person reading it already knows — they either
put someone here or came to serve someone from it. The second is load-bearing, but it is a caption
for the list, and it is sitting two blocks above it with a banner in between.

### 3.6 The heading outline says the applicants belong to the banner

From the snapshot:

```
h1  Warteliste
  h2  Ein Platz ist frei
    h3  Mayra Koszewski
    h3  Caspar Berner
    h3  Levke Gilde
  h2  Auf die Warteliste setzen
```

The list itself has **no heading**, so its three `h3`s are announced as subordinate to "Ein Platz ist
frei" — which is untrue of two of them, and misleading about the third. This is the trap the
conversion guide records under "Two traps", arriving from the other direction: not a heading deleted
by a primitive, but a heading never written.

The nine form fields are also nested `<label><span>…</span><input/></label>` with no `htmlFor`. They
are announced correctly today, purely because of the nesting — the fragility the guide's `/kunden`
findings call out, and `waiting-list.spec.ts` reaches every one of them by `#id`, so the ids are
already there and the binding costs nothing.

### 3.7 The page does not line up with the navigation bar

`<main>` is `max-w-4xl p-8`; the nav's own container is `max-w-6xl px-3 md:px-5`. Measured at 1440:
the nav container starts at **x = 144**, the page's content at **x = 304**. Every screen converted so
far (`/ausgabe`, `/kunden`) uses the shared `SHELL` constant — `max-w-6xl … p-6 md:p-8` — so the two
restyled screens line up under the bar and this one steps 160px in from it.

### 3.8 Amber means two unrelated things

- `waiting-list-expired-badge` is amber, and the code comment beside it is emphatic that this is
  **not** a verdict: the applicant keeps the place they waited for and is asked for a renewed notice.
- The confirmation inside the remove disclosure is the same amber, and there it _is_ a caution — you
  are about to take somebody off a queue they have been standing in for months.

Same paint, opposite intent, on the same screen. This is `/kunden`'s "red three times over" in
miniature, and it is worth fixing before it grows.

### 3.9 The disabled submit does not look disabled

`disabled:opacity-60` over `bg-foreground` renders as a mid-grey solid button (screenshot: the remove
form with an empty reason). It reads as an ordinary secondary button rather than as a control waiting
for something. shadcn's `Button` uses `disabled:opacity-50 disabled:pointer-events-none`, which is
only marginally better on a solid fill; the honest fix is a `variant` whose disabled state is legible
— see §5.

### 3.10 Nothing here is covered by an e2e test except the parts that are

Worth knowing before the restyle starts, because it decides where care is spent.
`tests/e2e/waiting-list.spec.ts` asserts `waiting-list-row`, `-applicant`, `-position`, `-days`,
`-free-slot`, `-free-slot-detail`, `-promote`, `-add-submit`, `-add-saved` and the nine field ids.
It asserts **nothing at all** about `waiting-list-order-rule`, `-empty`, `-expired-badge`,
`-free-slot-expired`, `-add-error` or any of the four `waiting-list-remove-*` testids.

So the remove flow, the expired-certificate badge and both notice paths have no automated proof that
a restyle left them working. They must be exercised by hand in `playwright-cli` (§10) — and the
expired states need seeding, because the demo register has no applicant whose certificate lapsed.

---

## 4. The concept

### 4.1 Principle

> **The list answers "who is next"; the banner answers "and can I act on it now".** Everything on the
> screen is either that question, the answer, or the two writes — and the write staff were sent here
> to perform is never below the fold.

### 4.2 Proposed structure

```
┌─ Nav (existing, sticky, h-12, max-w-6xl) ─────────────────────────────────────┐

  h1  Warteliste                              [ + Auf die Warteliste setzen ]   ← anchors to the form
  ┌─ Card: Ein Platz ist frei ────────────────── emerald accent ─────────────┐
  │  h2 Ein Platz ist frei                                                   │
  │  Kundennummer 3 ist frei. Am längsten wartet Mayra Koszewski.            │
  │  [ Jetzt registrieren ]                                                  │
  └──────────────────────────────────────────────────────────────────────────┘
  ┌─ Card: Wer wartet ───────────────────────────────────────────────────────┐
  │  h2 Wer wartet                                          3 Wartende       │
  │  Die Reihenfolge ist das Datum der Anmeldung …            ← CardDescription
  │  ──────────────────────────────────────────────────────────────────────  │
  │  Platz 1 · Mayra Koszewski                          Von der Liste nehmen │  ← ~104px
  │  Angemeldet 13.06.2026 · wartet 48 Tage · Nachweis bis 29.10.2026        │
  │  Erreichbarkeit: Meldet sich freitags selbst im Laden.                   │
  │  ──────────────────────────────────────────────────────────────────────  │
  │  Platz 2 · Caspar Berner                            Von der Liste nehmen │
  │  …                                                                       │
  └──────────────────────────────────────────────────────────────────────────┘
  ┌─ Card: Auf die Warteliste setzen  #warteliste-aufnehmen ─────────────────┐
  │  nine fields, lg:grid-cols-3                                             │
  └──────────────────────────────────────────────────────────────────────────┘
```

Six decisions carry it.

**(a) The page moves to the shared `SHELL`** — `max-w-6xl … p-6 md:p-8`, the same constant
`/ausgabe` and `/kunden` use. It lines up under the bar (§3.7), and the extra 256px is what lets a
row's facts sit on one line and the form use three columns instead of two.

**(b) The banner becomes the loudest thing on the screen, in emerald.** Same accent as the hub badge
it agrees with (`border-emerald-600/40 bg-emerald-600/15`), the heading as `CardTitle` with a real
`<h2>`, and "Jetzt registrieren" as a `Button` `default` — the primary write, and the only place on
the screen where a decision is taken. It keeps its wording exactly (`waiting-list-free-slot-detail`
is asserted with an exact `toHaveText`).

The banner is expensive — roughly 150px whenever a slot is free — and it should be. It is on screen
only when there is something to do, and PRD §6 is unambiguous about what it is worth.

**(c) Row 1 is marked as the row the banner is about.** A quiet `bg-muted/50` on the head row and
nothing else: no second "Jetzt registrieren" (two buttons doing one thing is how they come to
disagree), no arrow, no repetition of the number. The banner names them; the row confirms it is the
same person. When no slot is free there is no head row marking either — the applicant at position 1
is then just the applicant at position 1.

**(d) The row flattens from four bands to three lines.**

| Line | Content                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------- |
| 1    | `Platz 1` · **Name** · `Nachweis abgelaufen` badge if it applies · remove control, right-aligned  |
| 2    | `Angemeldet am: 13.06.2026` · `Wartet: 48 Tage` · `Nachweis gültig bis: 29.10.2026`, muted labels |
| 3    | `Erreichbarkeit: …` — omitted entirely when empty, as today                                       |

Each label/value pair stays **one `<p>` with the label and the value inside it** — the guide's second
trap, and the reason the current `Detail` component is right and must survive the flattening. They
are laid out with `flex flex-wrap gap-x-6` rather than a three-column grid, so a short list of facts
does not print three ragged columns.

The remove control moves to the right of line 1 and stops being a full-width bar. It stays a
`<details>`/`<summary>` — guide rule 4, and the same argument as at the counter: nothing may have to
be dismissed before the rest of the list can be read. What changes is its weight: a `text-sm
text-muted-foreground` summary that reads as a link, not a 780px slab. Opened, it keeps its
confirmation, its required reason and its disabled submit.

Budget: line 1 at 28px, line 2 at 24, line 3 at 24, `gap-2` twice, `py-4` — **≈ 104px**, half of
today's 214.

**(e) The prose is re-attached to what it explains.** `orderRule` becomes the list card's
`CardDescription`, immediately above the rows it governs, and keeps its `waiting-list-order-rule`
testid. `intro` is cut. This is a content change (§8) — but note that of the two paragraphs, the one
that survives is the one no test asserts and the one that goes is the one nothing needs.

**(f) The form keeps its place at the bottom and gains a way to it.** A `Button` beside the `h1`
(`asChild` around `<a href="#warteliste-aufnehmen">`) jumps to the form card, and the card carries
that id. Job B then costs one click from anywhere on the page instead of a scroll past the queue;
job A and job C keep the top of the screen. The deep link from `/kunden/neu` should point at
`/warteliste#warteliste-aufnehmen` for the same reason — a one-line change on the other screen, and
the only part of this concept that reaches outside `/warteliste`.

Considered and rejected: a two-column layout at `lg` with the list left and the form right. It puts
both jobs on one screen and it is the tempting answer, but it doubles the number of layouts to verify
for a screen that is visited a handful of times a month, and below `lg` it collapses back to exactly
what we have. Boring wins; revisit if FD ever say the scroll bothers them.

### 4.3 The empty state is the normal state

For most of the register's life nobody is waiting, and `waiting-list-empty` renders as a bare
paragraph under two paragraphs of prose — it reads like a page that failed to load its list. It
becomes an `Alert role="status"` inside the list card, so that "Zurzeit steht niemand auf der
Warteliste" is visibly **an answer**. The add form stays exactly where it is: an empty list is the
state in which somebody is most likely to be added.

### 4.4 What is deliberately _not_ changed

- **The list is not a `Table`.** It is tempting — three facts per row is tabular — but PRD §6 forbids
  sorting, and column headings are what invite it. The `<ul>`/`<li>` structure also carries a form
  per row, which a table row handles by growing a second `<tr colspan>`. Rows stay list items.
- **The order, and the absence of any way to change it.** No drag handles, no "nach oben", no
  sort. (FR-7.)
- **The position number.** It is the fairness statement made visible, and `Platz 1` is asserted as
  exact text.
- **The expired badge never becomes a verdict.** It states a fact beside an applicant who keeps their
  place (FR-5). It may change colour (§6); it may not acquire an icon that reads as a warning, and it
  may never move a row.
- **`force-dynamic`.** Both halves of the screen go out of date at midnight without anything being
  written.
- **The add form stays expanded**, and the certificate rule stays behind `addToWaitingList`.

### 4.5 The screen behind the button: `/warteliste/[entryId]/registrieren`

Converted in the same pass, because a restyled banner leading to an unrestyled screen is worse than
neither. But it is mostly **not ours to convert**:

- `PromotionScreen` renders `RegistrationForm` from `@/app/kunden/neu` — that component belongs to
  the `/kunden/neu` conversion and must be left alone here, or the two passes will fight.
- What _is_ this screen's own: the `Frame` (`h1`, shell, the stranded back link), `promotion-intro`,
  the `promotion-expired-warning` step, and the two failure paragraphs
  (`promotion-no-free-number`, the no-settings message).
- The back link moves into the `h1` row. The guide's rule is that a link naming a _record_ stays —
  "Zurück zur Warteliste" names the list this applicant came from, which the four-item nav bar cannot
  express — but it belongs beside the heading, not stranded at the bottom of the page.
- The expired warning becomes an `Alert` with the amber the certificate keeps (§6), a real `<h2>`
  inside it, and its continue control a `Button`. It stays a **step and not a `Dialog`**: nothing is
  dismissed, the applicant is never refused, and FD have not decided how such a case is settled
  (PRD §9).

---

## 5. Mapping to shadcn/ui

Everything needed is already installed. No `shadcn add` required.

| Element today                                                                   | Becomes                                                                                  |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `<main className="max-w-4xl … p-8">`                                            | the shared `SHELL` string — `max-w-6xl … p-6 md:p-8`                                     |
| `FreeSlotBanner` `<section>`                                                    | `Card` + `CardHeader`/`CardContent`, `<h2>` inside `CardTitle`, emerald accent           |
| `waiting-list-promote` `<Link className="bg-foreground …">`                     | `<Button asChild><Link>` — stays an `<a>`                                                |
| `waiting-list-banner-link` (`showListLink`, `/kunden/neu`)                      | `<Button variant="ghost" asChild><Link>`                                                 |
| the `<ul>` of rows                                                              | `Card` + `CardHeader` (`<h2>` + count) + `CardContent` holding the same `<ul>`           |
| `<li className="rounded-xl border …">`                                          | `<li className="border-b last:border-0 py-4">` — one card, not fifteen                   |
| position pill `<span className="rounded-full bg-foreground/10">`                | `<Badge variant="secondary">` keeping the exact text `Platz 1`                           |
| `waiting-list-expired-badge`                                                    | `<Badge>` with the amber kept as a `className` (§6)                                      |
| `Detail` (`<p><span>label</span><span>value</span></p>`)                        | **unchanged** — it is already the shape the guide's trap 2 asks for                      |
| `RemoveApplicantControls` `<details>`                                           | stays `<details>`; `<summary>` styled `text-sm text-muted-foreground`                    |
| its confirmation `<p>`                                                          | `<Alert>` (`role="alert"` is right here — it precedes a destructive act)                 |
| its `<textarea>` + nested label                                                 | `<Textarea>` + `<label htmlFor>`; keep `required` and the disabled-until-typed rule      |
| its submit                                                                      | `<Button variant="destructive">`                                                         |
| `AddApplicantForm` `<section>`                                                  | `Card`, `<h2>` inside `CardTitle`, `hint` as `CardDescription`                           |
| its nine `<input>`s + nested labels                                             | `<Input>` + `<label htmlFor>` + the existing `id`s; grid `sm:grid-cols-2 lg:grid-cols-3` |
| `waiting-list-add-error`                                                        | `<Alert variant="destructive" role="status">`                                            |
| `waiting-list-add-saved`                                                        | `<Alert role="status">` (`Alert` hardcodes `role="alert"` — override it)                 |
| `waiting-list-add-submit`                                                       | `<Button type="submit">`                                                                 |
| `waiting-list-empty` `<p>`                                                      | `<Alert role="status"><AlertDescription>` inside the list card                           |
| `border-foreground/15,/20,/30`, `bg-foreground/5,/10`, `text-foreground/70,/80` | `border-border`, `bg-muted/50`, `text-muted-foreground`                                  |

**`FreeSlotBanner` is shared with `/kunden/neu`** (`kunden/neu/page.tsx:76`, with `showListLink`).
Converting it restyles two screens at once, exactly as the guide records for `archive-controls` and
`block-controls`. That is fine — the banner should look the same in both places — but the
`/kunden/neu` render must be checked in the same pass, and it is the reason the banner cannot simply
be inlined into this page.

**Do not reach for:** `Dialog` (guide rule 4, and §4.5), `Select`, a `DataTable`, or any client-side
list state. The screen is server-rendered and dynamic, and the only interactivity it has is the two
forms it already has.

---

## 6. Colour, after

| Meaning             | Treatment                                         | Why                                                   |
| ------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| A slot is free      | `border-emerald-600/40 bg-emerald-600/15` + words | The hub already says it that way (US-18.2)            |
| Position `Platz n`  | `Badge variant="secondary"`, neutral              | Every row wears it — texture, not signal              |
| Head of the list    | `bg-muted/50` on the row, no border, no tint      | A pointer from the banner, not a state                |
| Nachweis abgelaufen | amber tint + the words                            | A fact to act on before fetching the applicant (FR-5) |
| Remove confirmation | `Alert variant="destructive"` — red, not amber    | It is a caution, and amber is spoken for (§3.8)       |
| Remove submit       | `Button variant="destructive"` (a soft tint)      | Destructive, guarded, and rare                        |
| Everything else     | tokens                                            | —                                                     |

Amber then means exactly one thing on this screen — "a certificate has lapsed" — which is also what
it means on `/kunden` and at the counter. Emerald means exactly one thing across the application: a
slot is free. Neither ever appears without its word (US-03.4).

---

## 7. Constraints the implementation must not break

Beyond the ten in `docs/ui_conversion_guide.md`. All of these come from
`tests/e2e/waiting-list.spec.ts` and `tests/e2e/reregistration.spec.ts`, which must pass **with no
test edited**.

1. **`waiting-list-position` holds exactly `Platz 1`** — the word and the number in one element,
   asserted with an exact `toHaveText`. A `Badge` may wrap it; nothing may split it.
2. **`waiting-list-applicant` holds exactly `Vorname Nachname`**, and `waiting-list-days` exactly
   `de.waitingList.waitedValue(n)` — including the "seit heute" case.
3. **`waiting-list-free-slot` must be absent, not hidden, when no slot is free** —
   `toHaveCount(0)` is asserted three times. `waiting-list-free-slot-detail` keeps its exact
   sentence.
4. **`waiting-list-promote` stays a link to `/warteliste/<id>/registrieren`.** One of them, on the
   banner. A second copy on the row would make `getByTestId` strict-mode-ambiguous.
5. **The nine field `id`s stay**: `#firstName`, `#lastName`, `#birthDate`, `#street`, `#houseNumber`,
   `#zip`, `#city`, `#certificateType`, `#certificateValidUntil` — `waiting-list.spec.ts` fills them
   by CSS id, not by label. Adding `htmlFor` is free; renaming an id is not.
6. **`waiting-list-add-saved` keeps its exact text** `de.waitingList.add.saved(applicant)`, and the
   form must still clear itself — the `key={state.savedCount}` remount is load-bearing and is not a
   styling detail.
7. **`waiting-list-row` keeps `data-position`**, and the rows keep their DOM order: `rows.nth(0)` is
   position 1.
8. **`promotion-intro`, `promotion-expired-warning`, `promotion-expired-detail`,
   `promotion-expired-continue`** keep their testids and their step-not-dialog behaviour; `#lastName`
   and `#certificateType` on that screen are asserted by value, so `RegistrationForm` is not to be
   touched (§4.5).
9. **Every new German string goes in `src/i18n/de.ts`** — the list card's title and its count are new
   keys.
10. **Give every card's `CardTitle` a real `<h2>`, and the list one it never had** (§3.6). Applicant
    names then drop to `<h3>` under it, which is where they already are.

---

## 8. Restyle vs. content change

| Change                                                         | Restyle? | Notes                                               |
| -------------------------------------------------------------- | -------- | --------------------------------------------------- |
| Shell width, cards, tokens, shadcn primitives                  | ✅       | Pure conversion                                     |
| Emerald banner, `Button` for the promote link                  | ✅       | `className` and element only                        |
| Flattening the row to three lines; remove control to the right | ✅       | Structure; every testid keeps its own text          |
| Head-of-list `bg-muted/50`                                     | ✅       | `className`, driven by a value the page already has |
| `htmlFor` on the nine fields                                   | ✅       | Ids already exist                                   |
| Empty state as `Alert`                                         | ✅       | Element swap                                        |
| Red instead of amber on the remove confirmation                | ✅       | `className`                                         |
| **A card title and count for the list**                        | ❌       | New dictionary keys — own commit                    |
| **Deleting `intro`; `orderRule` as `CardDescription`**         | ❌       | Content — own commit                                |
| **`#warteliste-aufnehmen` anchor + button beside the `h1`**    | ⚠️       | New key and a new id; harmless, but not a restyle   |
| **`/kunden/neu`'s link gaining the fragment**                  | ❌       | Touches another screen — own commit, own argument   |

Suggested sequence: **(1)** conversion — shell, cards, banner, row, form, e2e green untouched →
**(2)** the copy: list heading and count, `intro` cut, `orderRule` moved → **(3)** the anchor and the
deep link, if (1) and (2) leave job B still feeling buried.

---

## 9. Responsive

- **≥ 1280px** — the target. Row facts on one line, form in three columns.
- **~1024px** — form drops to two columns; row facts may wrap to two lines. Fine.
- **~800px** — this is where today's three-column detail grid already looks ragged; the
  `flex flex-wrap` version degrades better. The remove summary drops under the name rather than
  beside it.
- **390px** — today the first row starts at y = 694 and a row is 302px tall. Target is only: no
  page-level horizontal overflow (already true), and the banner plus the first applicant visible
  without scrolling. As on `/kunden`, a phone-specific layout is not worth building for a shared
  desktop machine.
- Verify **every breakpoint the concept introduces** — the `lg:grid-cols-3` on the form above all.
  `documentElement.scrollWidth - clientWidth` must be `0` at each, per the guide's `/kunden` lesson
  that a 1024px overflow can hide between the standard widths.

---

## 10. Verification, before the PR is opened

```bash
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:e2e                    # with no test edited
pkill -f next-server && npm run build && npm run start -- --port 3100 &
curl -s http://127.0.0.1:3100/warteliste | grep -c "<a string you just added>"   # prove the build
playwright-cli open http://127.0.0.1:3100/warteliste
playwright-cli snapshot             # read it
```

Numbers to take, before and after, at 1440×900 on the demo register:

| Claim                                  | Before | Target                               |
| -------------------------------------- | ------ | ------------------------------------ |
| Top of the first `waiting-list-row`    | 474px  | ≤ 360 with the banner, ≤ 220 without |
| Row height                             | 214px  | ≈ 104px                              |
| Applicants visible without scrolling   | 2      | ≥ 4 with the banner on screen        |
| Page scroll height (3 applicants)      | 1858px | ≤ 1200px                             |
| Content box left edge vs. the nav's    | +160px | 0                                    |
| Headings between the `h1` and the rows | 1      | 2, and the rows below the list's     |

The budget behind "≤ 360": padding 32 + `h1` row 36 + gap 24 + banner ≈ 150 + gap 24 + list card
header ≈ 76. If it comes out higher, say so with the budget rather than quietly dropping the target —
that is the mistake `docs/ui_redesign_kunden_verwalten.md` §12.4 records.

Then, by hand, because the suite does not cover them (§3.10):

- **Open a remove disclosure**, confirm the submit is genuinely disabled until a reason is typed,
  type one, submit, and confirm the applicant is gone and the positions renumbered.
- **Seed an applicant whose certificate has lapsed** and check the row badge, the banner's
  `waiting-list-free-slot-expired` paragraph, and the promotion screen's expired step.
- **Follow `/kunden/neu`'s waiting-list link** and check where it lands.
- **Check the banner on `/kunden/neu`** — the same component, a second screen (§5).
- **Submit the add form twice in a row** and confirm it clears itself both times.
- Snapshot: an `<h2>` per card, every field a named `textbox`, the notices `status` regions.
- `playwright-cli console` — 0 errors, at all five widths.
- `playwright-cli show --annotate` to put it in front of FD before merging.

Driving these flows **writes to `data/fd.db`**; `npm run db:demo -- --reset` puts the demo register
back.

---

## 11. Open questions

1. **Erreichbarkeit** — a free-text contact note is shown on every row. Is it read at a glance, or
   only when somebody is about to be rung up? If the latter it could move inside the row's detail
   line and stop costing a band of its own.
2. **Does the list need an address?** A row identifies an applicant by name alone. With ~240
   households and a queue of a dozen, two "Müller"s are not unlikely. The entry holds the address;
   the row does not show it.
3. **The anchor (§4.2f)** — is a jump-to-form button the right answer to job B, or would FD rather
   the form sat above the list? The answer depends on how often somebody opens this screen to add
   versus to look, which we do not know yet.
4. **A count in the list heading** — "3 Wartende" mirrors the hub badge. Useful, or does it invite
   reading the queue as a backlog to be worked down? The hub already states it either way (US-18.1).
