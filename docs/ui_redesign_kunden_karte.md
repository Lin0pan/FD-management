# Redesigning the digital card (`/kunden/[id]/karte`)

A UX analysis of the card view as it stands today, and a concept for rebuilding it on the shadcn/ui
primitives — one of the last three screens in the conversion `docs/ui_conversion_guide.md` describes.

**Status:** **not built.** The measurements in §3 are the "before".

This screen is unlike the five already converted in one respect that governs everything below: it is
not read, it is **copied**. A staff member sits at a desk with a blank physical card and writes six
values onto it by hand (US-02.4). Its type sizes are therefore not a style choice, and most of the
conversion's usual instincts — compact `radix-nova` defaults, dense tables, `text-sm` cards — are
wrong here. §4.5 says explicitly what must not change and why.

---

## 1. How this was examined

Driven through `playwright-cli` against a production build (`npm run build && npm run start --
--port 3100`) on the demo register, at 1440×900, 800×900 and 390×844. Two households, because the
screen has two shapes: **customer 19** holds her first card (`1k1`, no predecessor) and **customer
17** holds `17k2` after a loss, so the superseded list and the issue counts are populated. The
reissue disclosure was opened for real. The accessibility snapshot was read alongside the
screenshots, per the conversion guide. Numbers below are measured off the live DOM.

Console: **0 errors, 0 warnings.** Horizontal page overflow: **0 at all three widths.** Nothing on
this screen is broken. It is the screen with the narrowest job in the application and it spends its
emphasis on the wrong half of it.

---

## 2. What this screen is for

US-02.4, in its own words: _"see all card information on screen so I can transcribe it onto the
physical card or feed it into the printing system"_. FR-5 forbids producing a printable artefact —
FD's printing system is separate and stays separate. So this screen is the **source document for a
hand copy**, and its acceptance criterion is legibility across a desk.

FR-1 names exactly what has to be on it:

> card number, first name, last name, group, grown-up count and children count.

Six values. US-09 later added a second, smaller job to the same route: reissue a lost card, and read
how many cards this household has been through (US-09.2, §FR-4).

| #   | Job                                              | Frequency                              | What has to be fast                |
| --- | ------------------------------------------------ | -------------------------------------- | ---------------------------------- |
| A   | **Transcribe the six FR-1 values**               | Every registration and every reissue   | The six values, at copying size    |
| B   | **Confirm this is the card the household holds** | Whenever a card is questioned          | The number, and that it is current |
| C   | **Reissue after a loss** (US-09)                 | Rare                                   | One control, one confirmation      |
| D   | **Read the issue history** (US-09.2)             | Rare, and only when C is being weighed | Two counts, stated and no more     |

A is the screen. B is one glance at the same values A already needs. C and D are an appendix that
exists because there was nowhere better to put it.

**The current layout does not distinguish A from D anywhere.** That is the root cause behind most of
what follows.

---

## 3. Findings

### 3.1 Eight values are set at card scale; six of them go on the card

Measured type, in source order down the card:

| Element                     | Size     | Weight | On the physical card (FR-1)? |
| --------------------------- | -------- | ------ | ---------------------------- |
| `Kartennummer` label        | 14px     | 400    | —                            |
| **`17k2`**                  | **48px** | 700    | ✅                           |
| **`Rot`** (group pill)      | 18px     | 600    | ✅                           |
| **`Emely Schäfer`**         | **30px** | 400    | ✅ (two of the six)          |
| **`Erwachsene` `2`**        | **36px** | 600    | ✅                           |
| **`Kinder` `1`**            | **36px** | 600    | ✅                           |
| `Portionen` `5`             | **36px** | 600    | ❌                           |
| `Preis` `5,20 €`            | **36px** | 600    | ❌                           |
| `Standard-Portionen …` hint | 12px     | 400    | —                            |
| `Ausgestellt am` / `Grund`  | 14px     | 400    | ❌                           |

Two problems, and they compound:

**Portions and price are not card data.** They are counter data — what a household may collect and
what they pay on the day — and the counter has them, at the counter's own scale, on `/ausgabe`. The
customer record has the same four figures too, as `Stat` tiles at 30px. Here they are given
**exactly the weight of the two counts that get written onto the card**, which means half of the
biggest thing on the screen is not part of the job the screen exists for. On a 2×2 grid the reader
cannot even tell which pair is which: all four are `36px/600 tabular-nums`, laid out identically.

**The household's name is smaller than a single digit.** `Emely Schäfer` is 30px; `1` is 36px. Two
of the six FR-1 values are in that name, and it is set below every count on the card.

### 3.2 Every label/value pair on the card is announced as two unrelated facts

Straight from the snapshot — this is the conversion guide's trap 2, six times on one screen:

```yaml
- generic:
    - generic: Kartennummer
    - generic: 1k1
- generic: Rot
- paragraph: Sally Möldner
- generic:
    - generic:
        - generic: Erwachsene (ab 13 Jahren)
        - generic: "4"
    - generic:
        - generic: Kinder (unter 13 Jahren)
        - generic: "0"
    - generic:
        - generic: Portionen
        - generic: "8"
    - generic:
        - generic: Preis
        - generic: 8,40 €
```

`Count` in `karte/page.tsx:41` is `<div><span>label</span><span>value</span></div>`, so a screen
reader hears "Erwachsene ab 13 Jahren", then "4", with nothing joining them. Six pairs, twelve
fragments, and the relationship carried by the visual layout alone — on the one screen in the
application whose entire purpose is that somebody reads a value off a label correctly.

The **`<dl>` at the bottom of the card is the only correctly paired data on it**: `term
"Ausgestellt am:"` / `definition "13.05.2026"` announces properly. The small print is accessible and
the six figures are not.

`card-group` is worse than the rest: the snapshot shows a bare `generic: Rot` with no label of any
kind. Sighted staff get a solid red pill; a screen reader gets the word "Rot" floating after the
card number, with nothing saying it is the group. US-03.4 requires the colour to be named in words,
and it is — but the word has no subject.

### 3.3 The printed snapshot is on the view model and is not rendered

`CardView.card` is an `IssuedCard`, which carries `countsAtIssue` and `groupAtIssue` — the counts
and the group **as they were printed on the piece of card in the customer's pocket**. CLAUDE.md
argues for those two fields at length; they are one of exactly two exceptions to "derive, don't
store", and the argument for them is this:

> It is read only to answer _what the card in the customer's pocket claims_, so the two can be
> compared and a reissue proposed (US-13.2).

**`grep -rn "countsAtIssue\|groupAtIssue" src/app/` returns nothing.** Zero of the two fields are
rendered anywhere in `src/app/`, including on the screen that shows one card.

The comparison exists — `cards-due-for-reissue.ts:79` does it, and `/karten-neuausstellung` prints
both sets side by side as `countsOnCard` / `countsToday`. So the divergence is discoverable, on a
list, for households the system already flagged. On the card view of a single household there is no
sign of it: a card whose printed counts went stale three months ago renders **identically** to one
issued this morning. The screen shows `composition(members, today)` at 36px and says so only in a
12px line 322px lower down (§3.4).

This is the one finding here that is not about weight or spacing. It is the screen not doing a job
the data model was deliberately shaped to let it do.

### 3.4 The card is 460px of a 1192px page, and two paragraphs are stranded in the rest

Measured at 1440×900 on customer 17:

| Block                                             | y       | Height  |
| ------------------------------------------------- | ------- | ------- |
| `h1 Kundenkarte`                                  | 80      | 36      |
| **`[data-testid=customer-card]`**                 | **148** | **460** |
| `<p>` "Dies ist die aktuell gültige Karte…"       | 640     | 48      |
| `<section>` Ersetzte Kartennummern                | 720     | 60      |
| `<p>` "Erwachsene und Kinder werden … berechnet." | 812     | 16      |
| `<section>` Ausgestellte Karten                   | 860     | 140     |
| `<section>` Kartenverlust                         | 1032    | 72      |
| `<a>` Zurück zur Kundenübersicht                  | 1136    | 24      |

**61% of the page is appendix.** More to the point, two paragraphs belong to nothing:

- The one at y=640 states that this is the valid card and earlier ones are not. It is the sentence
  that does job B, and it sits _outside_ the card it is about, in muted 16px body text.
- The one at y=812 — "Erwachsene und Kinder werden bei jedem Aufruf aus den Geburtsdaten berechnet"
  — explains the counts, which are at y=338–490. It is **322px below what it explains, with an
  entire section ("Ersetzte Kartennummern") in between.** It is also 12px and muted, so it reads as
  a footnote to the section above it rather than to the card.

There are now **two hints about the counts on one screen**: this one, and
`de.customers.derived.standardValues` ("Standard-Portionen und -Preis; am Ausgabetisch nicht
anpassbar") inside the card at y=514. They say different things, they are both 12px, and neither is
next to the numbers it qualifies.

### 3.5 The card has no accessible name and no heading; all three headings are on the appendix

```
h1  Kundenkarte
h2  Ersetzte Kartennummern
h2  Ausgestellte Karten
h2  Kartenverlust
```

The `<section data-testid="customer-card">` has no name, so it is a `generic` in the tree. The three
things that _do_ get an `<h2>` are the three least-used things on the page. A screen-reader user
navigating by heading gets the appendix and nothing else.

### 3.6 The shell is 240px narrower than the bar above it, and 240px inset from it

Measured at 1440: `<main>` is `x=336, w=672` (`max-w-2xl`); the nav's list is `x=144, w=1152`. The
card's left edge is at x=416, **272px right of "Start" in the bar**. This is the defect
`src/app/shell.ts` was extracted to fix, recorded there as a 128px step on two other screens — here
it is 240px, the largest in the application.

At 800px the card keeps its 608px width and simply sits in a wider gutter; the layout never uses the
space.

### 3.7 The back-link is a 608px-wide block below the fold

`main > a` is `x=416, y=1136, w=608, h=24` — a full-bleed underlined link at the very bottom of a
1192px page, 236px below a 900px viewport. The conversion guide is explicit about this exact case:

> A back-link that names a _record_ stays ("Zurück zur Kundenübersicht" from a customer's card),
> because the bar cannot say which customer you came from; it belongs in the header row, **not
> stranded at the bottom**.

It is also the only way back to the household from here, and it is the last thing on the page.

### 3.8 There are two card numbers on a transcription screen, and only prose distinguishes them

On customer 17 the page shows `17k2` at 48px in the card and `17k1` at 16px in ordinary body text
under "Ersetzte Kartennummern" — `17k1 — ausgestellt am 13.04.2026, Grund: Erstausstellung`. The
superseded number carries no strike-through, no muted treatment of the number itself, and no word on
its own line saying it is void. What distinguishes them is the 48px/16px step and the paragraph at
y=640, 116px above.

For a screen someone scans for "the card number", two card numbers differing in one character is the
error the layout should be hardest against.

### 3.9 The group is 18px, at the far edge of the card, 479px from the number it belongs to

`card-group` measures 61×44px at x=929; `card-number` is at x=450. They are the two things printed
largest on the physical card, and on screen they are at opposite ends of a 608px header with 479px
between them. The pill is `bg-red-600 text-white` at `text-lg` (18px) — smaller than every count on
the card, and smaller than the household's name.

This is also the application's **third** treatment of the group colour: solid fill here, the tinted
`GROUP_STYLES` on `/kunden` and `/kunden/[id]`, and a tinted panel on `/`. `src/app/accents.ts` says
a meaning gets one colour across the whole application and asks that a state be looked up there
before a treatment is invented. Solid-on-the-card is defensible — see §6 — but it is currently
undocumented, which is how the third one appeared.

---

## 4. The concept

### 4.1 Principle

> **The card is the screen. Everything else is an appendix, and it should look like one.** Within the
> card, the six FR-1 values get card scale and nothing else does.

Two consequences, and they are the whole redesign:

1. **Portions and price come off the card** and join the issue facts underneath it. They are not
   printed on a physical card and they are on two other screens already.
2. **The card gains the one thing it is missing**: what is actually printed on the piece of card in
   the customer's hand, shown when it differs from what is true today (§3.3).

### 4.2 Proposed structure

```
┌─ Nav (existing, sticky, h-12) ───────────────────────────────────────────────┐

  h1  Kundenkarte                              [ ← Zurück zu Emely Schäfer ]    ← header row
                                                                                  (§3.7)
  ┌─ Card: die Karte ────────────────────────────────────────────────────────┐
  │                                                                          │
  │   Kartennummer                                          ┌──────────┐     │
  │   17k2                                    48px          │   Rot    │ 30px│
  │                                                         └──────────┘     │
  │   Emely Schäfer                           36px                           │
  │                                                                          │
  │   Erwachsene (ab 13 Jahren)      Kinder (unter 13 Jahren)                │
  │   2                              1        40px                           │
  │                                                                          │
  │   ⚠ Auf der Karte steht: 1 Erwachsene, 2 Kinder.  [nur bei Abweichung]   │
  │      Karte neu ausstellen ▸                                              │
  │                                                                          │
  │   Diese Karte ist gültig. Frühere Karten sind ungültig.        ← moved in │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌─ Card: Kartenverlauf ────────────────────────────────────────────────────┐
  │  h2 Kartenverlauf                                                        │
  │  Ausgestellt am   17.06.2026    Grund   Verlust                          │
  │  Karten insgesamt 2             davon nach Verlust  1                    │
  │  ─────────────────────────────────────────────────────────────           │
  │  Ersetzt      17k1   13.04.2026   Erstausstellung                        │
  │  Die Zahlen dienen nur der Information. …                                │
  │  ▸ Karte neu ausstellen (Verlust)                                        │
  └──────────────────────────────────────────────────────────────────────────┘

  Portionen 5 · Preis 5,20 € · Standardwerte, am Ausgabetisch nicht anpassbar.
```

Five decisions carry this:

**(a) The header row takes the back-link.** `Zurück zur Kundenübersicht` moves from y=1136 to the
`h1` row, per the guide's page skeleton. Naming the household in it (`Zurück zu Emely Schäfer`)
would be better still, but it is a dictionary change — see §8.

**(b) The card holds six values and one sentence.** Number, group, name, two counts, and the
validity statement that is currently stranded at y=640. Nothing else. The counts go up from 36px to
40px because two tiles have the room that four did not, and the name goes from 30px to 36px because
it is one of the six.

**(c) Portions and price move below the fold of the card, into one muted line.** They keep their
`data-testid`s and their exact text — **no spec asserts either of them on this route** (§7.3), so
this is free. They stay on the page because the card view is sometimes the last screen open before a
household walks to the counter; they stop competing with the values being copied.

**(d) The printed snapshot appears when, and only when, it differs.** `view.card.countsAtIssue` and
`view.card.groupAtIssue` are already on the view model. When either differs from today's derivation,
the card shows a notice inside itself naming what the physical card claims and offering the reissue.
When they agree — which is the overwhelming majority — nothing renders, per the guide's colour
budget: chrome marks the exception.

This is not a new comparison. It is `/karten-neuausstellung`'s comparison, on the screen for one
household, and it should be painted the same amber that screen already uses for a card due — a
meaning gets one colour (`accents.ts`).

> ⚠️ **This is the one part of the concept that is not a restyle.** It renders two fields the page
> does not currently read, and it needs a dictionary entry. §8 puts it in its own commit. It is also
> the part most worth building: it is the only finding here that changes what staff can know.

**(e) The appendix becomes one card with a heading, not three sections and two loose paragraphs.**
Issue facts, issue counts, superseded numbers and the reissue control are one subject —
"Kartenverlauf" — and they are all read together or not at all. The two orphan hints (§3.4) merge:
one sentence about the counts, placed under the counts.

### 4.3 The counts, and the two hints

Today: four 36px figures in a 2×2 grid, a 12px hint inside the card, a second 12px hint 322px below
it. Proposed:

| Value                                              | Where                         | Size |
| -------------------------------------------------- | ----------------------------- | ---- |
| Erwachsene, Kinder                                 | Card, two tiles side by side  | 40px |
| _"…aus den Geburtsdaten berechnet"_                | Directly under those tiles    | 12px |
| Portionen, Preis                                   | Muted line under the appendix | 16px |
| _"Standardwerte, am Ausgabetisch nicht anpassbar"_ | Same line                     | 12px |

Each hint now sits under what it qualifies. Both keep their dictionary keys; neither is reworded in
the restyle.

Use the shared `Stat` from `src/app/stat.tsx` for the two count tiles, with `valueClassName` raising
the value to `text-4xl` — it already solves trap 2 by keeping label and value in one `<p>`, which is
§3.2's whole problem, and its `tabular-nums` is what a transcribed digit needs. Pass `min-w-` and
`whitespace-nowrap`: `Erwachsene (ab 13 Jahren)` and `Kinder (unter 13 Jahren)` are different
lengths, and the guide's `/karten-neuausstellung` finding is that two tiles compared side by side
drift apart without both.

### 4.4 The superseded list becomes a table

Three facts per entry — number, date, reason — currently concatenated into one German sentence per
`<li>`: `17k1 — ausgestellt am 13.04.2026, Grund: Erstausstellung`. With one entry that reads fine;
after three losses it is three sentences to parse for three dates. Three columns, a `<th
scope="row">` on the number, and the reason becomes scannable.

`superseded-card` is asserted with an exact `toHaveText` against the whole sentence
(`reissue.spec.ts:227`), so **the testid stays on an element holding exactly that string** — which a
table row does, if the testid goes on the `<tr>` and the sentence is not re-punctuated. See §7.2:
this is the one place in the concept where the table is worth a second look before committing.

### 4.5 What must not change, and why

This screen has more of these than any other in the conversion, and they are the reason it was left
until last.

- **The 48px card number.** US-02.4's "legible across a desk" is this number. `radix-nova` is a
  compact idiom and the guide's own finding is to override it where a control is the screen's
  primary interaction — here it is the screen's primary _output_, and the same argument applies with
  more force.
- **`tabular-nums` on the number and the counts.** A transcribed digit is compared column by column.
- **No print stylesheet, no PDF, no barcode, no QR.** FR-5 and §5 Non-Goals. Nothing in a conversion
  should look like an opportunity to add a print button.
- **The counts stay derived live.** `export const dynamic = "force-dynamic"` and
  `composition(members, today)`. The snapshot fields in §4.2d are shown _beside_ the derivation,
  never instead of it — CLAUDE.md: "Never read as the household's counts."
- **The group keeps its literal red/blue and its German word.** Guide rule 9; US-03 FR-7.
- **The reissue stays a `<details>`.** Guide rule 4. `Dialog` also portals to `document.body`, which
  breaks `reissue-open` / `reissue-confirm` being read inside their container.
- **The reissue confirmation keeps naming both numbers.** `de.customers.reissue.confirm(current,
next)` is what lets staff check they are replacing the card in front of them (US-09.3).
- **Nothing counts, compares or warns about the loss tally.** US-09 §FR-4/§FR-5 are explicit: the
  screen states `cards-issued` and `reissues-for-loss` and stops. No threshold, no colour that
  changes at three, no sentence that appears at five. A restyle that gives `reissues-for-loss` a red
  badge has broken a product decision, not improved a screen.
- **The archived case keeps offering no reissue button.** `view.status === "ARCHIVED"` renders
  nothing; guide rule 5 — a control that must be absent stays absent.

---

## 5. Mapping to shadcn/ui

Everything needed is **already installed**. No new component is required.

| Element today                                                    | Becomes                                                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `<main className="mx-auto … max-w-2xl … p-8">`                   | `<main className={SHELL}>` from `src/app/shell.ts` (§3.6)                                                |
| local `Card` in `karte/page.tsx:60`                              | **rename or delete** — it shadows `@/components/ui/card`; the guide names this file                      |
| `<section data-testid="customer-card" className="rounded-xl …">` | `<Card data-testid="customer-card">` + `CardHeader`/`CardContent`, with a real `<h2>` inside `CardTitle` |
| `<header>` with number and group                                 | `CardHeader` + `CardTitle` (number) + `CardAction` (group badge)                                         |
| `card-group` `<span className="rounded-full bg-red-600 …">`      | `<Badge className={CARD_GROUP_STYLES[group]}>` — a new entry in `accents.ts`, see §6                     |
| local `Count` (`div` + two `span`s)                              | **delete** — `Stat` from `src/app/stat.tsx` (fixes trap 2, §3.2)                                         |
| the `<dl>` of issue facts                                        | keep the `<dl>`; it is the only correct markup on the card. Restyle only.                                |
| `Superseded` `<ul>`/`<li>`                                       | `Table` / `TableRow` / `TableHead` / `TableCell`, `<th scope="row">` on the number (§4.4)                |
| `Issued` `<section>` + `<h2>` + two `Count`s                     | folded into the `Kartenverlauf` `Card`; the two counts stay `Stat`s at default size                      |
| `<p>` "Dies ist die aktuell gültige Karte…"                      | `<Alert role="status">` **inside** the card (§4.2b)                                                      |
| `NotFound` `<main>` + `<p>`                                      | `SHELL` + `<Alert variant="destructive">`, and a link back to `/kunden`                                  |
| back-link `<a className="underline …">`                          | `<Button variant="ghost" asChild><Link>` in the header row                                               |
| `text-foreground/60,/70,/80`                                     | `text-muted-foreground`                                                                                  |
| `border-2 border-foreground/20 shadow-sm`                        | nothing — `Card` brings `ring-1 ring-foreground/10`. Don't add a border back.                            |

**Do not reach for:** `Dialog` (§4.5), `Accordion` (rule 4 — the `<details>` is clicked by testid),
`Separator` (a `border-t` does it), or `Tabs` to hide the appendix (job D is rare, not secret, and a
tab is a control to learn on a screen that currently needs none).

**`ReissueControls` is already converted** — `Button`, `Alert`, `buttonVariants` on the `<summary>`.
It moves into the new card unchanged; nothing in this pass touches it.

---

## 6. Colour, after

| Meaning                       | Treatment                                           | Why                                                  |
| ----------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| The group, **on the card**    | solid `red-600` / `blue-700`, white text + the word | This is the artefact. See below.                     |
| The group, everywhere else    | `GROUP_STYLES` tint + the word                      | Unchanged (`accents.ts`)                             |
| Printed counts differ (§4.2d) | the amber `/karten-neuausstellung` already uses     | Same fact, same colour, one meaning one colour       |
| This card is valid            | no colour — a plain `Alert`                         | It is the default state of every card ever viewed    |
| Superseded numbers            | `text-muted-foreground` on the number               | Not an alarm; the heading already says what they are |
| Loss tally                    | **no colour at any value**                          | US-09 §FR-4: the screen states it and judges nothing |

**The solid group fill is a deliberate exception and should be written down as one.** `accents.ts`
holds `GROUP_STYLES` as a tint because a hub row wearing a solid red block would drown the row. Here
the card _is_ a mock-up of the physical object, and the physical object is a solid colour. That is a
real distinction, but it is currently made by a `GROUP_STYLES` constant local to `karte/page.tsx`
that no one reading `accents.ts` would find. Move it there, next to the tint, with the sentence that
says which is used where — otherwise the fourth treatment is one screen away.

Red appears on this screen in exactly one role: the group. It never means "wrong", "expired" or
"blocked" here.

---

## 7. Constraints the implementation must not break

Beyond the ten in `docs/ui_conversion_guide.md`. All derive from `tests/e2e/card.spec.ts`,
`tests/e2e/reissue.spec.ts` and `tests/e2e/archive.spec.ts`, which must pass **with no test edited**.

1. **`card-number`, `card-name` and `card-group` keep their exact text.** `toHaveText` against
   `` `${proposedNumber}k1` ``, `` `${firstName} ${lastName}` `` and `de.customers.groups.BLUE`. The
   badge wraps the span; it does not replace it — guide §"the word never goes with the chrome".
2. **`superseded-card` keeps its exact sentence** — `reissue.spec.ts:227` asserts
   `de.customers.cardView.supersededEntry(...)` with `toHaveText`, and `:310` asserts
   `toHaveCount(3)`. A table row whose cells concatenate to a different string, or with a differently
   punctuated separator, turns that red. **Verify the concatenation in `playwright-cli` before
   committing §4.4**; if it cannot be made to match, the list stays and only its styling changes.
3. **`portions` and `price` are asserted on `/kunden/[id]`, not here.** Both `age-13.spec.ts` and
   `customer-record.spec.ts` call their `expectDerived` helper only after `page.goto("/kunden/${id}")`
   — this route is never one of them. §4.2c is therefore spec-free. Keep the testids anyway: they
   cost nothing and the next spec may want them.
4. **`grown-ups` and `children` are asserted here** (`card.spec.ts`), exact, value only.
5. **`cards-issued` and `reissues-for-loss` keep their exact numbers** and stay two separate
   elements — `reissue.spec.ts:236` and `:300` read both. Merging them into one "2 (1 nach Verlust)"
   string breaks two assertions and a product decision (US-09.2).
6. **`customer-card` stays on the element that wraps the card.**
7. **`reissue-open` stays a real `<summary>` that a click toggles**, `reissue-confirm` keeps
   `de.customers.reissue.confirm(current, next)` exactly, `reissue-submit` stays enabled, and
   `reissue-error` renders only on failure.
8. **`getByRole("main")` must still contain `de.customers.cardView.current` and
   `de.customers.cardView.supersededNone`.** Two sweeps in `card.spec.ts` and one in
   `reissue.spec.ts:224`. Moving the "current card" sentence into an `<Alert>` inside the card is
   fine — it is still inside `<main>`. **Deleting or rewording it is not**, and neither is the
   `Feld: Wert` separator trap the record hit (guide, "Findings from the two customer screens").
9. **`card-view-link` on `/kunden/[id]` keeps pointing here** — `card.spec.ts` and `reissue.spec.ts`
   both arrive by clicking it, and `waitForURL(/\/kunden\/\d+\/karte$/)` will not match a URL that
   grows a fragment (guide, `/warteliste` findings).
10. **An archived household is offered no reissue control** — `toHaveCount(0)` semantics; guide rule 5.
11. **Every new German string goes in `src/i18n/de.ts`**, including the divergence notice in §4.2d.
12. **`export const dynamic = "force-dynamic"` stays.** The counts are derived per request; a cached
    card is a card with numbers a birthday has passed.

---

## 8. Restyle vs. content change

| Change                                                                      | Restyle? | Notes                                                         |
| --------------------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| `SHELL`, `Card`, `Badge`, `Stat`, tokens, deleting the local `Card`/`Count` | ✅       | Pure conversion                                               |
| Real `<h2>`s inside every `CardTitle`                                       | ✅       | Fixes §3.5; guide trap 1                                      |
| Back-link into the header row                                               | ✅       | Structure; US-17.4 already blesses the link itself            |
| Moving the validity sentence inside the card                                | ✅       | Structure; the string is untouched (§7.8)                     |
| Portions and price out of the count grid                                    | ✅       | `className` and placement; no spec on this route (§7.3)       |
| Counts 36→40px, name 30→36px, group pill 18→30px                            | ✅       | `className` only                                              |
| Merging the three appendix sections into one card                           | ✅       | Structure                                                     |
| Superseded list → `Table`                                                   | ⚠️       | Only if the concatenation matches §7.2 exactly. Verify first. |
| Moving `GROUP_STYLES` (solid) into `accents.ts`                             | ⚠️       | A move, not a change — but it touches a shared module         |
| **Rendering `countsAtIssue` / `groupAtIssue` when they differ**             | ❌       | New data on screen, new dictionary key — own commit           |
| **Naming the household in the back-link**                                   | ❌       | Dictionary change                                             |
| **Merging the two count hints into one sentence**                           | ❌       | Content — own commit                                          |

Suggested sequence: **(1)** conversion, e2e green untouched → **(2)** the printed-snapshot notice,
which is the finding worth the most and wants its own argument → **(3)** the two copy changes, if
still wanted after seeing (1).

---

## 9. Responsive

- **≥ 1280px** — the target. `SHELL`'s `max-w-6xl` gives the card room it does not need, so it should
  take a `max-w-3xl` of its own inside the shell rather than stretching to 1152px: a 48px number on a
  1152px line has its label at one end and its value at the other. The **shell** aligns with the bar;
  the **card** stays card-shaped. This is the same distinction `/kunden/neu` drew between the card
  width and the field grid inside it.
- **~800px** — measured today: card 608px, counts still 2×2, `<dl>` 2×266px, no overflow. Unchanged
  by this concept.
- **390px** — measured today: card 326×680, the count grid collapses to one column, page 1656px tall,
  **0 overflow**. Two tiles instead of four shortens this materially. Not a working width — FD works
  from one shared desktop — so the target is only that it stays reachable, which it does.
- **No print stylesheet at any width.** FR-5.

---

## 10. Verification, before the PR is opened

```bash
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:e2e                     # with no test edited
pkill -f next-server && npm run build && npm run start -- --port 3100 &
curl -s http://127.0.0.1:3100/kunden/17/karte | grep -c "<a string you just added>"   # ≥ 1
playwright-cli open http://127.0.0.1:3100/kunden/17/karte
playwright-cli snapshot              # read it
```

- **Snapshot:** each of the six FR-1 values announced as **one** fact, not two — the §3.2 pattern
  must be gone. `heading` for the card and for `Kartenverlauf`. The group named, not a bare "Rot".
- **Both shapes.** Customer 19 (first card, empty superseded list) and customer 17 (`17k2`, one
  superseded, loss count 1). The first-card path is the one that renders `supersededNone`.
- **Open the reissue disclosure with a real click** on `reissue-open` and read `reissue-confirm` —
  never `evaluate(d => d.open = true)`.
- **Drive an actual reissue** on the demo register and confirm the number advances, the superseded
  table grows a row and `cards-issued` moves. Then `npm run db:demo -- --reset`.
- **An archived household**: confirm the reissue section is absent, not disabled.
- Measure, at 1440×900: `[data-testid=customer-card]` height (460 today), page `scrollHeight` (1192),
  and the distance from the count tiles to the hint that explains them (**322px today**).
- Three widths: `scrollWidth - clientWidth === 0` at 1440, 800, 390.
- `playwright-cli console` — 0 errors.
- `playwright-cli show --annotate` in front of FD before merging. **This screen more than any
  other**: whether 40px is enough to copy from across a desk is not a question this document can
  answer, and it is the only question that matters.

Driving these flows writes to `data/fd.db`; `npm run db:demo -- --reset` restores the demo register.

---

## 11. Open questions

1. **Is the printed-vs-today comparison (§4.2d) wanted here at all, or is `/karten-neuausstellung`
   the right and only home for it?** The argument for here: staff open this screen with the physical
   card in their hand, which is the one moment the comparison can actually be acted on. The argument
   against: the cards-due list is a worked queue, and a second place to notice the same thing is a
   second place to forget to look. Ask FD.
2. **Do Portionen and Preis belong on this screen at all?** §4.2c demotes them. Deleting them is the
   next step and would leave the card holding exactly FR-1 — but the counter is not always to hand,
   and someone may be using this screen to answer "what does this household pay". Worth one question.
3. **Should the superseded numbers be struck through?** §3.8 says two card numbers on one page is a
   transcription hazard. A `line-through` on the number is the cheapest possible answer and it costs
   nothing; it would also need the exact-text assertion in §7.2 checked, since `toHaveText` ignores
   styling but the testid placement matters.
4. **How often is a card actually reissued?** If the answer is "twice a year", job C is over-served
   by a permanent section and could be a single `<summary>` at the foot of the appendix. If it is
   "most weeks", the appendix should be a card at the same level as the card itself.
5. **`Zurück zu <Name>` or `Zurück zur Kundenübersicht`?** The bar cannot say which household, which
   is why the link survives US-17.4 at all — so naming the household is the point of it. One
   dictionary key.
