# Redesigning "Karten neu ausstellen" (`/karten-neuausstellung`)

A UX analysis of the cards-due-for-reissue screen as it stands today, and a concept for rebuilding it
on the shadcn/ui primitives — the fourth screen in the conversion `docs/ui_conversion_guide.md`
describes, after the `/ausgabe` pilot, `/kunden` and `/warteliste`.

**Status:** analysed, not built. Everything below §3 is a proposal.

The two screens analysed before this one turned up the rules this one is measured against: colour is
a budget (`docs/ui_redesign_kunden_verwalten.md` §3.2), a label and its value stay one node, and a
claim is worth making only with a number behind it. This screen breaks a different rule — it is the
only screen in the product whose **whole purpose is a comparison, and it does not let you compare**.

---

## 1. How this was examined

Driven through `playwright-cli` against a production build (`npm run build && npm run start -- --port
3100`) on the demo register, which seeds exactly the two cases the screen exists for: Louis Kneifel,
whose child turned 13 five days ago, and Liana Walton, who moved between RED and BLUE. Widths 1920,
1440, 1280, 800 and 390. The accessibility snapshot was read alongside the screenshots, per the
conversion guide. Numbers below are measured off the live DOM.

Console: **0 errors, 0 warnings.** Horizontal page overflow: **0 at all five widths.** The page even
fits a 900px viewport without scrolling on the demo. Nothing is broken; the screen simply does not do
the one thing it was built to do.

---

## 2. What this screen is for

`tasks/prd-us-13-age-13-reclassification.md` §6 states both halves of the brief, and they pull
against each other on purpose:

> _"The tone of the reissue list matters: it is a to-do list, not an alert queue. Anything that looks
> urgent will train staff to ignore it, or worse, to turn customers away."_
>
> _"Show both count sets side by side so staff can see at a glance what changed."_

So: three jobs, and a tone that constrains all three.

| #   | Job                                                               | What the screen must make fast              |
| --- | ----------------------------------------------------------------- | ------------------------------------------- |
| A   | **See which households hold a card that is out of date, and why** | The name, and the difference — at a glance  |
| B   | **Print a new card and record the reissue** (the one write)       | The action, and both card numbers before it |
| C   | **Go to the record** when the row raises a question               | The link                                    |

And the state this screen is in most weeks is **empty**: a household lands here on a 13th birthday, a
household edit or a group move, and none of those happen often. The empty state is not an edge case,
it is the normal case.

---

## 3. Findings

### 3.1 The comparison does not line up, so it is not a comparison

This is the finding the rest of the document follows from. The row prints three equal bordered boxes
of 253px each: counts on the card, counts today, and the reason. The value strings are
`de.customers.derived.countsValue(…)` — `"Erwachsene: 2, Kinder: 2"` — and at 253px they do not fit
on one line beside their label.

Measured on the Kneifel row, the two values that the whole screen exists to compare:

| Element                    | Text                       | Line boxes                                                  |
| -------------------------- | -------------------------- | ----------------------------------------------------------- |
| `cards-due-counts-on-card` | `Erwachsene: 2, Kinder: 2` | **one** line, at `x = 342, y = 436`                         |
| `cards-due-counts-today`   | `Erwachsene: 3, Kinder: 1` | **two** lines, at `x = 714, y = 412` and `x = 607, y = 436` |

The two strings break at different points, because their labels are different lengths. So "Erwachsene:
2" and "Erwachsene: 3" — the pair a reader has to diff — end up **24px apart vertically and 372px
apart horizontally**, on different lines of different boxes. The reader is doing string parsing, not
comparing.

Nothing marks _which_ number changed, either. Both figures are `font-medium tabular-nums` in both
boxes; the reader compares four numbers embedded in two German sentences and works out for themselves
that the 2 became a 3 and the other 2 became a 1.

### 3.2 For one of the three reasons, the screen shows nothing that changed

`StaleCardReason` has three values. On a `GROUP_CHANGE` row — Liana Walton on the demo — the two
count boxes read **`Erwachsene: 3, Kinder: 0`** and **`Erwachsene: 3, Kinder: 0`**. Identical. The
fact that actually changed is that the card was printed RED and the household is now BLUE, and that
is **nowhere on the screen**.

It is not missing from the data. `CardDueForReissue` carries `groupOnCard` and `groupToday`
(`src/application/customers/cards-due-for-reissue.ts:47-49`); the page simply never renders them. So
the screen's most prominent device shows two identical values while the datum it should be showing
sits unused in the read model, and the only trace of the change is the words "Gruppe gewechselt" in a
third box.

RED and BLUE are also the one place in this product where colour _is_ the datum (conversion guide
rule 9) — the printed cards FD hand out. A screen about a card being wrong ought to be able to say
which colour it was.

### 3.3 The reason is styled as a peer of the raw data

"Unterschied: 13. Geburtstag" sits in a third box, same border, same width, same weight as the two
count sets. But it is not a third data point — it is the **summary** of the other two, and it is what
job A actually scans for. Ranked as an equal, it reads as one more thing to parse.

### 3.4 Seventy words of prose take 144px before the first row

Between the `h1` and the first row there are 216px, and 144 of them are two paragraphs:

- `intro` explains _why_ households land here — 13th birthday, household change, group change. Every
  row then states its own reason in its own box, so the paragraph is a legend for a column that
  already speaks German.
- `notUrgent` is a product requirement (US-13.4, FR-5) and the tone of the screen. It must stay, and
  it must stay above the list. `age-13.spec.ts:294` asserts its exact text.

So one of the two paragraphs is doing a job nothing else does, and the other is doing a job every row
already does. They are styled identically.

### 3.5 The row's action hierarchy is upside-down

Each row ends like this:

```
[▸ Karte neu ausstellen]        ← 780px wide, bordered, full-width bar
Kundenakte öffnen               ← underlined text link, alone on the last line
```

The write — the point of the screen — is a `<summary>` that reads as a collapsed accordion; the
navigation away is the last thing in the row, permanently underlined, hanging below the disclosure
with nothing tying it to anything. Opened, the disclosure grows to 382px and reveals a solid black
256×48 button, which is the only strong control on the page and is two clicks from the surface.

Keeping the disclosure is right — guide rule 4, and a reissue cannot be taken back, so both card
numbers must be read before anything is written. What is wrong is that closed, it looks like a
section and not like an action.

### 3.6 The page does not line up with the navigation bar

`<main>` is `max-w-4xl p-8`; the nav's container is `max-w-6xl px-3 md:px-5`. Measured at 1440: the
nav container starts at **x = 144**, the page's content at **x = 304**. `/ausgabe` and `/kunden` both
use the shared `SHELL` — `max-w-6xl … p-6 md:p-8` — and line up. This screen steps 160px in from the
bar above it, and those 160px are exactly what §3.1's two boxes need in order to stop wrapping.

### 3.7 The heading outline has no list

```
h1  Karten neu ausstellen
  h2  Louis Kneifel
  h2  Liana Walton
```

Each row is an `h2` whose text is a person's name, with nothing above them saying what the collection
is. It is not wrong so much as unhelpful: a screen-reader user hears two names and has to infer the
relationship from the `h1`. Note also that `/warteliste` makes its rows `h3` — two sibling screens
built the same week, two different answers.

### 3.8 The empty state is a bare paragraph, and it is the state you will see most often

`cards-due-empty` renders as `<p className="max-w-prose">` under two paragraphs of prose. Most weeks
that is the entire screen: three paragraphs of grey text, one of which is the answer. Nothing
distinguishes the answer from the explanation.

---

## 4. The concept

### 4.1 Principle

> **Show the difference, not the two things that differ.** A row's job is to make one changed fact
> obvious in a second; everything else on the row is there to confirm it, and nothing on the screen
> may suggest that any of it is urgent.

### 4.2 Proposed structure

```
┌─ Nav (existing, sticky, h-12, max-w-6xl) ─────────────────────────────────────┐

  h1  Karten neu ausstellen
  ┌─ Alert (role=status, neutral) ───────────────────────────────────────────┐
  │  Das hat keine Eile. …                              ← notUrgent, verbatim │
  └──────────────────────────────────────────────────────────────────────────┘
  ┌─ Card: Karten ───────────────────────────────────────────────────────────┐
  │  h2 Karten                                                    2 Karten   │
  │  ──────────────────────────────────────────────────────────────────────  │
  │  h3 Louis Kneifel      Nr. 15 · Karte 15k1        [13. Geburtstag]       │
  │     ┌ Auf der Karte gedruckt ┐      ┌ Haushalt heute ────┐               │
  │     │ Erwachsene: 2, Kinder: 2│  →  │ Erwachsene: 3, Kinder: 1│          │
  │     └────────────────────────┘      └────────────────────┘               │
  │     [ Karte neu ausstellen ▸ ]                    Kundenakte öffnen      │
  │  ──────────────────────────────────────────────────────────────────────  │
  │  h3 Liana Walton       Nr. 16 · Karte 16k1        [Gruppe gewechselt]    │
  │     ┌ Auf der Karte gedruckt ┐      ┌ Haushalt heute ────┐               │
  │     │ Erwachsene: 3, Kinder: 0│  →  │ Erwachsene: 3, Kinder: 0│          │
  │     │ Gruppe: Rot             │  →  │ Gruppe: Blau        │              │
  │     └────────────────────────┘      └────────────────────┘               │
  └──────────────────────────────────────────────────────────────────────────┘
```

Five decisions carry it.

**(a) The page moves to the shared `SHELL`** — `max-w-6xl … p-6 md:p-8`. It lines up under the bar
(§3.6), and the extra 256px is what buys the fix in (b).

**(b) The two count sets become one before/after pair, on one baseline, without wrapping.** The
shape is the pilot's `Stat` from `ausgabe/counter-lookup.tsx`: a small muted label above a large
value, wrapped in a `<p>` so label and value stay one announced fact (the guide's second trap). Two
of them, side by side, with a `→` between; `whitespace-nowrap` on the value and a column wide enough
for the longest German counts string, so the two values sit at the same `y` and the same `x`-offset.
That is the entire fix for §3.1, and it is a `className` change plus a wrapper.

The value strings themselves cannot change: `age-13.spec.ts` and `customer-record.spec.ts` assert
`cards-due-counts-on-card` and `-today` with an exact `toHaveText` against
`de.customers.derived.countsValue(…)`. So "Erwachsene: 2, Kinder: 2" stays, and the layout does the
work. Do not be tempted into `2 Erw. · 2 Kinder`.

**(c) The reason moves up beside the name, as a `Badge variant="secondary"`.** It is the row's
summary and the thing job A scans (§3.3). Neutral grey, no icon, no red — a to-do list, not an alert
queue. Its `cards-due-reason` testid moves with it, still holding exactly the reason's word.

**(d) The group pair is shown when the group is what changed.** `groupOnCard` / `groupToday` are
already in the read model (§3.2). Rendered as a second line inside the same two tiles — "Gruppe: Rot"
→ "Gruppe: Blau" — with the literal RED/BLUE tint on the words, because there the colour _is_ the
printed card (guide rule 9).

Two constraints on how: the count tiles must **still be rendered even when the counts are equal**,
because `customer-record.spec.ts:368-374` asserts both count testids on a `GROUP_CHANGE` row; and
this is a content change, not a restyle (§8) — it prints a fact the screen has never printed and
needs two new dictionary keys. Show the unchanged pair muted rather than hiding it: what the reader
needs is "these are the same, that is different", and a hidden row cannot say that.

**(e) The row's action becomes an action.** The `<details>` stays — it is guide rule 4 and it guards
an irreversible write — but the closed `<summary>` is styled as a button-shaped control
(`Button`-like, `variant="outline"`, self-start) rather than a full-width bar, with "Kundenakte
öffnen" beside it as a `Button variant="ghost" asChild`. Both then sit on one line at the foot of the
row, in the order write-then-navigate, and the row stops ending on a stranded underline.

Opened, the confirmation keeps its exact wording — `stale-reissue-confirm` is asserted — and the
submit becomes a `Button` `default`. The wording already distinguishes the two ("Karte neu
ausstellen" to open, "Neue Karte jetzt ausstellen" to commit), which is worth keeping deliberately:
`getByRole("button", { name })` in this project uses `exact: true`.

### 4.3 The empty state is the normal state

`cards-due-empty` becomes an `Alert role="status"` inside the list card — the answer, visibly an
answer, and not a third grey paragraph (§3.8). Worth spending a moment on: for most of the year this
is the whole screen.

### 4.4 One list, one card — not a card per household

Rows become `<li className="border-b last:border-0 py-4">` inside a single `Card`, the same move the
`/warteliste` concept makes. Two nested rounded boxes (a card inside a card) is what makes both
screens read as a pile of panels; one card with divided rows reads as a list, which is what it is.

### 4.5 What is deliberately _not_ changed

- **The tone.** No count of "overdue" anything, no red, no amber, no icon that means "attention", no
  row ordered ahead of another because it has waited longer. `notUrgent` stays above the list,
  verbatim, and it is asserted verbatim.
- **`notUrgent` above the rows, not below them.** The comment in `page.tsx` is right: whoever opens
  this screen has to read that nothing here is urgent _before_ the first row, not after working
  through it.
- **The order** — the repository's, by customer number, handed on untouched. No sorting control.
- **The disclosure**, and both card numbers being named before the write.
- **`force-dynamic`** — the list changes at midnight without anything being written.
- **The reissue action lives here as well as on the record.** Same act, same dictionary
  (`customers.reissue`), deliberately (US-09).

---

## 5. Mapping to shadcn/ui

Everything needed is already installed. No `shadcn add` required.

| Element today                                        | Becomes                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `<main className="max-w-4xl … p-8">`                 | the shared `SHELL` string — `max-w-6xl … p-6 md:p-8`                      |
| `intro` `<p>`                                        | cut, or one line of `CardDescription` (§8)                                |
| `cards-due-not-urgent` `<p>`                         | `<Alert role="status">` — neutral, above the card, exact text kept        |
| the `<ul>` of rows                                   | `Card` + `CardHeader` (`<h2>` + count) + `CardContent` holding the `<ul>` |
| `<li className="rounded-xl border …">`               | `<li className="border-b last:border-0 py-4">`                            |
| the row's `<h2>` name                                | `<h3>`, under the list card's `<h2>` (§3.7)                               |
| `Counts` (`<p>` + label span + value span)           | the pilot's `Stat` shape — same `<p>` wrapper, `bg-muted/50 rounded-lg`   |
| the reason `<p>`                                     | `<Badge variant="secondary">` beside the name, testid on the word         |
| `stale-reissue-open` `<summary>`                     | stays a `<summary>`, styled as an outline button                          |
| `stale-reissue-submit`                               | `<Button type="submit">`                                                  |
| `stale-reissue-error`                                | `<Alert variant="destructive" role="status">`                             |
| `cards-due-customer-link`                            | `<Button variant="ghost" asChild><Link>` — stays an `<a>`                 |
| `cards-due-empty` `<p>`                              | `<Alert role="status"><AlertDescription>`                                 |
| `border-foreground/15,/20`, `text-foreground/70,/80` | `border-border`, `text-muted-foreground`                                  |

`Alert` hardcodes `role="alert"`; pass `role="status"` where the message is a statement rather than a
problem — the `notUrgent` banner above all, which must not be announced as an alert on a screen whose
entire point is that nothing here is urgent.

**Do not reach for:** a `Table`. It is the obvious idea for a comparison and it is wrong here: each
row carries a `<details>` form that a table can only express as a second `<tr colspan>`, the list is
0–10 rows long, and the comparison that matters is _within_ a household, not down a column.

---

## 6. Colour, after

| Meaning                          | Treatment                                           | Why                                       |
| -------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| The reason a card is out of date | `Badge variant="secondary"`, neutral                | A to-do list, not an alert queue (PRD §6) |
| Gruppe Rot / Blau on a card      | literal `red-600` / `blue-700` + the word           | It **is** the printed card (guide rule 9) |
| "Auf der Karte" / "heute" tiles  | `bg-muted/50`, identical                            | Neither side is the good one              |
| The reissue action               | `Button variant="outline"` closed, `default` inside | An action, guarded, not an alarm          |
| A rejected reissue               | `Alert variant="destructive"`                       | The only failure the screen has           |
| Everything else                  | tokens                                              | —                                         |

No red, no amber anywhere on the screen except a rejection. That is the point: this list must never
train staff to read a stale card as a problem, because the next step from there is turning somebody
away at the counter — which FR-5 forbids and which this screen's own prose exists to prevent.

---

## 7. Constraints the implementation must not break

Beyond the ten in `docs/ui_conversion_guide.md`. These come from `tests/e2e/age-13.spec.ts` and
`tests/e2e/customer-record.spec.ts`, which must pass **with no test edited**.

1. **`cards-due-row` keeps `data-customer-number` on the `<li>`.** Both specs address a household's
   row by that attribute and then look inside it.
2. **`cards-due-counts-on-card` and `cards-due-counts-today` keep the exact string**
   `de.customers.derived.countsValue(grownUps, children)`, and both are present on **every** row —
   including a `GROUP_CHANGE` row where they are equal (`customer-record.spec.ts:368-374`).
3. **`cards-due-reason` holds exactly `de.cardsDue.reasons[reason]`.** A `Badge` may wrap it; nothing
   may prefix it. Wrap the word in the badge, as `StateWord` does on `/kunden`.
4. **`cards-due-card-number` holds exactly the card number** (`15k1`), and
   `cards-due-customer-number` exactly the customer number.
5. **`cards-due-not-urgent` keeps its exact text** — asserted with `toHaveText`, so the paragraph may
   move and be restyled but not be reworded, split or truncated.
6. **`stale-reissue-open` is clicked directly**, then `stale-reissue-confirm` is asserted with the
   exact `de.customers.reissue.confirm(card, nextCard)` string, then `stale-reissue-submit` is
   clicked. The disclosure must therefore stay a real `<details>`/`<summary>` that a click opens.
7. **`stale-reissue-error` must be absent, not hidden, when nothing failed** — `toHaveCount(0)`.
8. **`cards-due-badge` on `/kunden` is a different element on a different screen** and is not this
   screen's to change; if a count is added here it is a new testid, not that one.
9. **Every new German string goes in `src/i18n/de.ts`** — the list card's title, its count, and the
   two group labels if §4.2d is built.
10. **Give the list card's `CardTitle` a real `<h2>` and demote the row names to `<h3>`** (§3.7).

---

## 8. Restyle vs. content change

| Change                                                   | Restyle? | Notes                                              |
| -------------------------------------------------------- | -------- | -------------------------------------------------- |
| Shell width, one card, tokens, shadcn primitives         | ✅       | Pure conversion                                    |
| The two count sets as aligned, non-wrapping `Stat` tiles | ✅       | Layout only — the strings are untouched            |
| Reason as a `Badge` beside the name                      | ✅       | Structure; the testid keeps exactly its word       |
| Action and record link on one line, as buttons           | ✅       | Structure                                          |
| Row names `h2` → `h3` under a new list `h2`              | ⚠️       | Structure, but the new `h2` needs a dictionary key |
| Empty state as `Alert`                                   | ✅       | Element swap                                       |
| **Rendering `groupOnCard` → `groupToday`**               | ❌       | New facts on screen, new keys — own commit (§4.2d) |
| **A card title and a count for the list**                | ❌       | New dictionary keys — own commit                   |
| **Deleting or shortening `intro`**                       | ❌       | Content — own commit                               |

Suggested sequence: **(1)** the conversion — shell, one card, aligned tiles, badge, action row; e2e
green untouched → **(2)** the copy: list heading and count, `intro` cut → **(3)** the group pair,
which is the one change that puts a new fact on the screen and deserves its own argument and its own
e2e assertion.

Note the asymmetry with §3.1: the biggest single improvement available here — making the comparison
comparable — is **entirely a restyle**. It needs no dictionary key, no new data and no spec edit. It
should land in commit (1).

---

## 9. Responsive

- **≥ 1280px** — the target. Both tiles and the arrow on one line, values unwrapped, action row on
  one line.
- **~1024px** — the tiles still fit side by side in a `max-w-6xl` card; verify, because side-by-side
  is the whole point and a wrap at 1024 would undo it.
- **~800px** — the tiles stack. Acceptable, but check that the pair still reads as a pair: stacked,
  the arrow becomes a downward relationship and the labels carry it.
- **390px** — everything stacks. Target is only no page-level horizontal overflow, as on the other
  screens.
- `documentElement.scrollWidth - clientWidth` must be `0` at every width **and at each breakpoint the
  concept introduces** — `/kunden` shipped an overflow that existed only _at_ 1024 and was invisible
  at all three standard widths.

---

## 10. Verification, before the PR is opened

```bash
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:e2e                    # with no test edited
pkill -f next-server && npm run build && npm run start -- --port 3100 &
curl -s http://127.0.0.1:3100/karten-neuausstellung | grep -c "<a string you just added>"
playwright-cli open http://127.0.0.1:3100/karten-neuausstellung
playwright-cli snapshot             # read it
```

Numbers to take, before and after, at 1440×900 on the demo register:

| Claim                                            | Before         | Target                       |
| ------------------------------------------------ | -------------- | ---------------------------- |
| Line boxes of `cards-due-counts-today`           | **2**          | **1**                        |
| `y` of `-counts-on-card` vs `-counts-today`      | 436 vs 412/436 | identical                    |
| `x` of the two values                            | 342 vs 607/714 | equal offset within the tile |
| Top of the first `cards-due-row`                 | 332px          | ≤ 260px                      |
| Row height, closed                               | 258px          | ≤ 200px                      |
| Content box left edge vs. the nav's              | +160px         | 0                            |
| Facts shown on a `GROUP_CHANGE` row that changed | **0**          | 1 (after step 3)             |

The first three are the substance of the restyle; take them with
`element.getClientRects()`, not by eye. A screenshot will not tell you that two values are on
different lines — this document's central finding was invisible until the rects were printed.

Then, by hand:

- **Open a disclosure, read the confirmation, and actually reissue a card.** Confirm the row
  disappears (the counts now match), the customer's record shows `15k2`, and the `/kunden` badge
  drops by one. Then `npm run db:demo -- --reset`.
- **Look at the empty state** — after reissuing both demo rows, the screen is the state FD will see
  most weeks. Judge it on its own.
- **Look at the `GROUP_CHANGE` row specifically.** If it still shows two identical tiles after
  step 3, the change did not land.
- Snapshot: an `<h2>` for the card, `<h3>` per row, the reason a `Badge`, the `notUrgent` paragraph a
  `status` region and not an `alert`.
- `playwright-cli console` — 0 errors, at all five widths.
- `playwright-cli show --annotate` to put it in front of FD before merging — the tone is the one
  thing in this concept that only FD can judge.

Driving the reissue flow **writes to `data/fd.db`**; `npm run db:demo -- --reset` restores the demo
register.

---

## 11. Open questions

1. **Should the row say what the reissue will change?** Today it shows the two states and the reason.
   A staff member's actual next act is to print a card with the new numbers on it — `nextCardNumber`
   is on the read model and appears only inside the disclosure. Is "die neue Karte wird 15k2" worth
   showing on the closed row?
2. **A count in the list heading.** "2 Karten" mirrors the hub badge and confirms the list is
   complete. Or does any number on this screen read as a backlog, against the tone PRD §6 sets? The
   hub already states it, in neutral grey, and nobody has complained.
3. **Does the reason need to be more specific?** "13. Geburtstag" does not say _whose_. With a
   six-person household that is a real question, and the record answers it in one click — but the row
   could say the name.
4. **Is the household's group worth showing on every row**, not only when it is what changed? It is
   the most consequential thing printed on the card, and this is the screen about the card being
   wrong.
