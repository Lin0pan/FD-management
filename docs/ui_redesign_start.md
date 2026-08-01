# Redesigning "Start" (`/`)

A UX analysis of the Start dashboard as it stands today, and a concept for rebuilding it on the
shadcn/ui primitives — the last of the three screens still on the pre-shadcn idiom in
`docs/ui_conversion_guide.md`.

**Status:** **§8 step 1 built; then largely undone by FD — read §13 first.** The measurements in §3
are the "before" and §12 is the "after", but FD, having seen it built, asked for the opposite of what
§4 concluded: no tint, no banner, and the distribution line at the size of the date. §13 records what
the screen says today. Everything above it is the record of how it got there, and its typography
recommendations are superseded.

This is the smallest screen in the application and the only one that is **glanced at rather than
operated**. US-17.3 removed seven link rows from it and left four elements. Everything below is
about those four, and the concept is correspondingly short: there is nothing here to declutter, only
something to make bigger.

---

## 1. How this was examined

Driven through `playwright-cli` against a production build (`npm run build && npm run start --
--port 3100`) on the demo register, at 1440×900, 800×900 and 390×844. Both states were driven: the
normal screen on a day between distributions, and the `NoSettingsInForce` state — reached by pinning
the clock to 2020-01-01 through `FD_FIXED_NOW_FILE`, the seam `src/infrastructure/clock.ts` carries
for exactly this. The accessibility snapshot was read alongside the screenshots, and the group word's
own box was measured with a `Range`, because `getBoundingClientRect` on a block element says nothing
about where the words inside it landed. Numbers below are measured off the live DOM.

Console: **0 errors, 0 warnings.** Horizontal page overflow: **0 at all three widths.** Nothing on
this screen is broken. It answers its question in 24px type on a page that has 494 empty pixels
underneath it.

---

## 2. What this screen is for

US-17.3, and the page's own header comment: staff open the app twenty times a day, and what they
want to know is **what day it is, when the next Ausgabe is, and which group collects.** The seven
link rows that used to be here moved into the navigation bar; the free-slot banner and the cards-due
badge moved to `/kunden` (US-17.2, FR-11). What is left is deliberately a screen to be read, not a
to-do list.

| #   | Job                                           | Frequency           | What has to be legible    |
| --- | --------------------------------------------- | ------------------- | ------------------------- |
| A   | **Which group collects at the next Ausgabe?** | Every time it opens | One word: `Rot` or `Blau` |
| B   | **When is the next Ausgabe?**                 | Every time it opens | One date                  |
| C   | **What day is it today?**                     | Incidental          | One date                  |
| D   | **Get somewhere when nothing is configured**  | Once, ever          | One link                  |

**A is the screen.** B is its qualifier — a colour with no date attached is useless, and a date with
no colour is worse, which is why FR-8a insists the colour named is always the one collecting at the
named distribution. C is on the screen because it makes B checkable, not because anyone needs to be
told the date.

Two things about the reading conditions, and they are the whole argument of this document:

- **This screen is read from further away than any other.** FD works from one shared machine in a
  hall. Nobody sits down to read the dashboard; somebody walking past looks at it. Every other
  screen in the application is operated by a person at the keyboard.
- **Its answer is a single word.** Not a table, not a list, not a form. One of two words, plus a
  date.

A screen with one job, one word and a distant reader should be the easiest layout decision in the
application. It is currently laid out like a document.

---

## 3. Findings

### 3.1 The answer occupies 1.1% of the panel painted to deliver it

Measured at 1440×900. The distribution panel is 704×142px — **99 968px² of red**. The word `Rot`
inside it, measured with a `Range` over the text node, is **38×29px — 1 099px², 1.1% of the panel.**

The panel is entirely coloured to say one thing, and the word that says it is the seventh of eleven
words in a 65-character sentence, set in exactly the same 24px/500 as `Nächste`, `Ausgabe`,
`Donnerstag`, `6.`, `August` and `2026`. There is no typographic distinction of any kind between the
answer and its scaffolding.

This is not an argument for dropping the sentence — US-17.3 requires the colour "as **text plus**
colour, never colour alone", and FR-9 repeats it for the whole PRD. It is an argument that the word
needs a register of its own **as well as** the sentence, which §4 gets to.

### 3.2 The sentence wraps, and the date and the group end up on different lines

Measured with a `Range` over the paragraph's text node at 1440×900 — two line boxes:

| Line | Content                                         | Width |
| ---- | ----------------------------------------------- | ----- |
| 1    | `Nächste Ausgabe: Donnerstag, 6. August 2026 –` | 651px |
| 2    | `Gruppe Rot holt ab.`                           | 130px |

So job B's answer is at the end of line 1 and job A's answer is on line 2. The panel is 704px wide,
the sentence needs 781px, and it breaks 77px short. A longer weekday plus a longer month —
`Donnerstag, 26. September 2026` — is worse. At 800px the same sentence fits on one line, because
the panel is the same 704px there and the string happens to be shorter; the break is a property of
this particular date, which means it appears and disappears through the year without anybody
changing anything.

The conversion guide's rule from `/karten-neuausstellung` is the relevant one: two values on screen
**to be read together** need enough width that neither wraps. Here they are one sentence rather than
two tiles, but the failure is the same — the two facts the reader came for are 32px apart
vertically and 500px apart horizontally.

### 3.3 The largest type on the screen is the application's own name

Measured type, top to bottom:

| Element                               | Size     | Weight | Job |
| ------------------------------------- | -------- | ------ | --- |
| `h1` `Füllhorn Delbrück – Verwaltung` | **30px** | 600    | —   |
| welcome paragraph                     | 16px     | 400    | —   |
| `today-date`                          | 20px     | 400    | C   |
| panel `h2` `AUSGABE`                  | 14px     | 600    | —   |
| **distribution sentence**             | **24px** | 500    | A+B |

The biggest thing on the screen is the name of the software, on the screen of the software, under a
navigation bar that already says `Start` in an active state. It is also the `<title>`, so it is
printed twice in the browser chrome and once more at 30px. The two jobs the screen exists for are
answered at 24px, six pixels below it.

`today-date` at 20px is within 4px of the distribution line, which puts the fact everyone already
knows at almost the weight of the fact they came for.

### 3.4 55% of the viewport is empty, and the content is packed into the top

Measured at 1440×900: the last content pixel is at **y=406**. The page does not scroll —
`scrollHeight` is exactly 900. So **494px of a 900px viewport, 55%, is empty**, and everything is
crowded into the top 45% at reading sizes.

This is the finding that follows from §2's reading conditions and makes §3.1 and §3.3 matter. On a
screen with room to spare and one word to say, spending the room on white space below the fold and
the emphasis on the application's name is the wrong way round.

### 3.5 The distribution panel has no accessible name, and its heading duplicates a nav label

From the snapshot:

```yaml
- main:
    - heading "Füllhorn Delbrück – Verwaltung" [level=1]
    - paragraph: Willkommen. Diese Seite sagt, welcher Tag heute ist und wann die nächste Ausgabe ist.
    - paragraph: Heute ist Samstag, 1. August 2026.
    - generic:
        - heading "Ausgabe" [level=2]
        - paragraph: "Nächste Ausgabe: Donnerstag, 6. August 2026 – Gruppe Rot holt ab."
```

The panel is a `<section>` with no accessible name, so it is a `generic` — a `<section>` only becomes
a `region` when it is named. The structure is fine otherwise (one `h1`, one `h2`), which puts this
screen ahead of `/kunden` before its conversion.

Smaller, and a judgement call: the `h2` is `Ausgabe`, which is also the second item in the navigation
bar — where it means the serving counter at `/ausgabe`, a different thing entirely. One word, two
meanings, 200px apart on the same screen.

### 3.6 The welcome line explains the screen to people who open it twenty times a day

> "Willkommen. Diese Seite sagt, welcher Tag heute ist und wann die nächste Ausgabe ist."

Fourteen words, 48px of vertical space, telling a daily user what the two lines below them are. It is
the same class of tax as the `/kunden` intro paragraph, and the same argument applies: it was right
when the screen was new, and it is now permanent furniture on the screen opened most often. The
difference is that here it is 48px of a 406px screen — **12% of everything on the page** — sitting
between the `h1` and the answer.

FR-7 requires "a welcome line and today's date". So this is not free to delete; see §4.3 and §8.

### 3.7 The empty state's only control is the smallest thing on the page, and it leads to a dead end

Driven with the clock pinned before the seeded settings version. The panel loses its colour, gains
prose, and gains the only clickable element on the entire dashboard:

```yaml
- generic:
    - heading "Ausgabe" [level=2]
    - paragraph: Der Ausgaberhythmus ist noch nicht hinterlegt. Sobald Ausgabetag und Wochenfarbe …
    - link "Einstellungen": /url: /einstellungen
```

Measured: the link is **101×24px at 16px**, underlined text. The screen's own comment says "Nothing
on it needs clicking", which is true of the configured state and false of this one — and the one
moment the dashboard _is_ an action screen, the action is styled as a footnote.

Worse, it leads nowhere. `/einstellungen` in the same state renders **0 forms, 0 inputs, 0 links, 0
buttons** — see `docs/ui_redesign_einstellungen.md` §3.9. The dashboard keeps US-17.3's promise
("with a link to `/einstellungen`") and the destination does not keep it back. Fixing that is the
settings screen's job; noting it is this one's, because this is where staff are sent from.

### 3.8 The shell is 192px inside the bar above it

Measured at 1440: `<main>` is `x=336, w=768` (`max-w-3xl`); the nav's list is `x=144, w=1152`. The
`h1` starts at x=368 — **204px right of `Start` in the bar directly above it**, which is visible in
any screenshot as a page that does not line up with its own navigation. `src/app/shell.ts` exists to
end this; three screens now use it and this is one of the three that do not.

At 390px the nav wraps to two rows (100px tall) and the panel starts at y=404, which pushes the
answer to the middle of the viewport on the narrowest screen. Not a working width, but worth knowing.

---

## 4. The concept

### 4.1 Principle

> **One question, one answer, one size.** The screen has 494 spare pixels and a single word to say.
> Spend the room on the word.

Nothing here is a decluttering exercise — there is nothing to remove but one paragraph. The whole
change is a redistribution of emphasis, and it is almost entirely `className`.

### 4.2 Proposed structure

```
┌─ Nav (existing, sticky, h-12) ───────────────────────────────────────────────┐

  h1  Füllhorn Delbrück – Verwaltung                       24px, muted  ← was 30px, black
  Heute ist Samstag, 1. August 2026.                       20px         ← unchanged

  ┌─ Card: Ausgabe ──────────────────────────────────────── red tint ───┐
  │  AUSGABE                                                       14px │
  │                                                                     │
  │  Nächste Ausgabe: Donnerstag, 6. August 2026 –                      │
  │  Gruppe Rot holt ab.                                    40px        │
  │                                                                     │
  └─────────────────────────────────────────────────────────────────────┘
```

Four decisions, and only the first is not a one-line change.

**(a) The distribution panel becomes the largest thing on the screen.** The sentence goes from 24px
to 40px and the `h1` goes from 30px to 24px `text-muted-foreground`. The application's name stays —
it is the `h1` and the heading outline needs it, and `home.spec.ts` asserts its exact text — it just
stops being the loudest voice in a room where it has nothing to say. The panel keeps its full
`max-w-6xl` width once the shell changes (§4.2d), which at 1440 gives the sentence 1 088px against
the 781px it needs: **the wrap in §3.2 disappears at every width down to ~830px**, and below that it
breaks after the dash, which is the right place.

> **Measured on the built screen, and it does not.** The 781px is the 24px measurement, and §9's own
> warning against assuming it scales was the right one: at 40px the sentence needs ~1 300px against
> a panel of 1 088, so it wraps at **every** width the shell allows. What the size bought is the
> break _place_, not its absence — the line now divides after the dash (931px / 371px), each of the
> two facts whole, where at 24px it divided between `Rot` and `holt ab.` That is the §9 fallback,
> and it is what shipped. See §12.

**(b) The group word is emphasised inside the sentence, not extracted from it.** This is the one
place the redesign is constrained rather than free, and it is worth stating plainly (§7.1):
`home.spec.ts` reads `getByTestId("next-distribution").locator("p")` and asserts
`toHaveText(de.home.distribution.next(date, colour))` — **exact, against one `<p>`**. So the sentence
cannot be split into parts, and no second `<p>` may appear inside the panel. What _is_ free is
`<strong>` or a `font-semibold` span around the colour word inside the same paragraph:
`toHaveText` reads text content and does not care about inline markup. At 40px with the word set
semibold, §3.1's 1.1% becomes something a reader finds without reading.

Whether the word wants more than weight — a second line, a larger size — is a question for FD in
front of the live screen (§11.1), not one to settle here. The constraint above is what bounds the
options.

**(c) The welcome line goes, or shrinks to a clause.** FR-7 requires it, so this is not a free
deletion — but "Willkommen." on its own satisfies FR-7's letter, and the twelve words explaining what
the page does satisfy nothing. A content change; §8.

**(d) `SHELL`, so the page lines up with its own bar.** One import.

### 4.3 The empty state

The same treatment, one step further: this is the only state in which the dashboard has an action,
so the action should look like one. `<Button asChild><Link href="/einstellungen">` instead of an
underlined 101×24px text link — it stays an `<a>`, keeps its accessible name, and keeps the `href`
the spec asserts (§7.3).

The panel keeps its neutral border rather than borrowing a group colour, which is right: there is no
group to name, and painting the "we don't know" state red or blue would be the only false statement
the screen could make.

Everything else about this state stays. In particular the **date line still renders** — it is the
half of the screen that does not depend on FD having configured anything, and US-17.3 requires
exactly that.

### 4.4 What must not change, and why

- **The date only. No clock time.** FR-7, and US-17.3 spells out the consequence: the page stays a
  plain server component with no client boundary, no ticking state and no timer. A conversion that
  reaches for a client component here has broken the screen's defining property. Nothing in §4
  requires one.
- **`nextDistribution.colour`, never `view.colour`.** US-17.3 calls this "the likely bug here". On
  the days after a distribution the two disagree, and the third `home.spec.ts` case pins a Saturday
  precisely to catch it. A restyle must not reorganise the panel in a way that makes the wrong field
  the convenient one.
- **Exactly one colour on screen at a time**, and it is always the colour of the distribution being
  named.
- **Two distinct dictionary strings for today and for a coming day** — `isToday` and `next`. US-17.3:
  "the urgency is carried by the text rather than by styling the panel differently". So the
  distribution-day panel must **not** get a louder treatment than the other six days. This is worth
  restating because §4.2a makes the panel large, and the temptation to make it larger still on the
  day itself is exactly what the PRD forbids.
- **The line shows on every day**, however far off, never muted on the quiet ones.
- **The colour is named in words**, always. FR-9, US-03.4.
- **No free-slot banner, no cards-due badge.** FR-11, and `home.spec.ts` asserts both
  `toHaveCount(0)`. They live on the hub. Guide rule 5: a control that must be absent stays absent.
- **`getWeekColour` is the page's only read.** US-17.3 removed `proposeRegistration`, `listWaiting`
  and `countCardsDueForReissue` from this screen deliberately; the page performs no date arithmetic
  of its own.
- **`export const dynamic = "force-dynamic"` stays.** The date and the next distribution both turn
  over at midnight with nothing written.
- **The navigation bar is not touched.** Guide rule 10 — four links, nothing else, and anything
  beside it goes in `layout.tsx`, not in the `<nav>`.

---

## 5. Mapping to shadcn/ui

The smallest mapping table in the conversion. Everything needed is **already installed**.

| Element today                                                               | Becomes                                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `<main className="… max-w-3xl … gap-6 p-8">`                                | `<main className={SHELL}>` (§3.8)                                                         |
| `<section data-testid="next-distribution" className="rounded-xl border …">` | `<Card data-testid="next-distribution" className={GROUP_PANEL[colour]}>`                  |
| the panel's `<h2 className="text-sm uppercase …">`                          | `CardHeader` + `CardTitle` wrapping the real `<h2>` — the `<h2>` **stays** (guide trap 1) |
| the panel's `<p className="text-2xl">`                                      | one `<p>` in `CardContent` at `text-4xl` — **exactly one `<p>`** (§7.1)                   |
| `NotConfigured` `<section>`                                                 | `Card` with a neutral ring, same `<h2>`                                                   |
| `<Link className="underline underline-offset-4">`                           | `<Button asChild><Link>` — stays an `<a>` (§4.3)                                          |
| `GROUP_STYLES` local to `page.tsx`                                          | the shared `GROUP_STYLES` from `src/app/accents.ts` — see §6                              |
| `text-foreground/60`, `/70`, `border-foreground/20`                         | `text-muted-foreground`, `border-border`                                                  |

> ⚠️ **`Card` brings `ring-1`, not `border`.** To give the panel a coloured edge, turn the ring off:
> `<Card className="ring-0 border …">`, or the card wears two outlines a pixel apart. The
> `/warteliste` conversion hit this and it is recorded in the guide.

> ⚠️ **Do not put a `Stat` in this panel.** `src/app/stat.tsx` renders a `<p>`, and a second `<p>`
> inside `next-distribution` turns `home.spec.ts`'s `locator("p")` into a strict-mode violation on
> three assertions (§7.1). `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `Alert` and
> `AlertDescription` are all `div`s and are all safe — `Stat` is the one primitive in this codebase
> that is not.

**Do not reach for:** a client component of any kind (§4.4), `Alert` for the distribution panel (it
is not a notice and `Alert` hardcodes `role="alert"`), or a countdown, a calendar widget or a
"nächste 4 Ausgaben" list. FD distributes weekly; the next one is never more than six days out, and
the screen exists to answer one question.

---

## 6. Colour, after

| Meaning                          | Treatment                          | Why                                            |
| -------------------------------- | ---------------------------------- | ---------------------------------------------- |
| The group collecting next        | `GROUP_STYLES` tint + **the word** | It is the printed card (guide rule 9, US-03.4) |
| The rhythm is not configured yet | no colour, neutral border          | There is no group to name (§4.3)               |
| Everything else on the screen    | tokens                             | —                                              |

**The panel's tint should come from `accents.ts`, not from a copy in `page.tsx`.** The two are
currently identical strings — `border-red-600/40 bg-red-600/10` and `border-blue-700/40
bg-blue-700/10` — declared twice, once here and once as the shared `GROUP_STYLES`. That is exactly
the drift `accents.ts` was written to prevent:

> a meaning gets **one** colour across the whole application: two copies of a tint are how two
> screens come to paint the same fact two different shades.

They agree today. Deleting the local copy is a one-line change and it costs nothing.

Note the deliberate asymmetry with the card view: `/kunden/[id]/karte` paints the group as a **solid**
fill because it is a mock-up of the physical object. This screen names the group of a _distribution_,
not of a household, so it takes the tint like `/kunden` and `/kunden/[id]` do. See
`docs/ui_redesign_kunden_karte.md` §6 for the argument, which ends in the same place: write down
which is used where.

---

## 7. Constraints the implementation must not break

All derive from `tests/e2e/home.spec.ts`, which must pass **with no test edited**. It is the
strictest small spec in the suite.

1. **`getByTestId("next-distribution").locator("p")` must resolve to exactly one `<p>`, holding
   exactly the sentence.** Three assertions use it with `toHaveText`, and the spec's own comment
   explains why it is exact rather than `toContainText`: half of what it proves is a _negative_ — on
   a distribution day the line must say today and must not name a coming date. So:
   - **No second `<p>` anywhere inside the panel**, including a `CardDescription` (safe — a `div`),
     a `Stat` (**not** safe — a `<p>`), or a hint paragraph.
   - **The sentence is not split.** Inline `<strong>`/`<span>` around the colour word is fine;
     `de.home.distribution.next(date, colour)` must remain one string in one element.
2. **`today-date` keeps its exact text**, `de.home.today(germanLongDate(date))`, and keeps rendering
   in the `NoSettingsInForce` state.
3. **`distribution-not-configured` keeps its testid, contains
   `de.home.distribution.notConfigured`, and contains a `link` named `de.home.settingsLink` with
   `href="/einstellungen"`.** `Button asChild><Link>` satisfies all three; a `<button>` with an
   `onClick` router push does not, and would also break §4.4's no-client-component rule.
4. **The two panels are mutually exclusive** — each state asserts the other's testid
   `toHaveCount(0)`.
5. **`waiting-list-free-slot` and `cards-due-badge` must not exist here** — `toHaveCount(0)`, FR-11.
6. **`getByRole("heading", { level: 1 })` `toHaveText(de.home.heading)`.** The `h1` may be restyled;
   its text and its level may not change.
7. **No clock time anywhere**, and no client component. FR-7, US-17.3.
8. **Every new German string goes in `src/i18n/de.ts`.** If §4.2c shortens the welcome line, it edits
   `de.home.welcome` rather than adding a key beside it.
9. **`de.home.settingsLink` is shared** with `/ausgabe` and `/kunden` (`ausgabe/page.tsx:265`,
   `kunden/page.tsx:523`). Rewording it changes three screens.

---

## 8. Restyle vs. content change

| Change                                                   | Restyle? | Notes                                                           |
| -------------------------------------------------------- | -------- | --------------------------------------------------------------- |
| `SHELL`, `Card`, `Button`, tokens                        | ✅       | Pure conversion                                                 |
| Keeping the `<h2>` inside `CardTitle`                    | ✅       | Guide trap 1 — the screen has one today and must keep it        |
| Distribution sentence 24px → 40px                        | ✅       | `className`                                                     |
| `h1` 30px → 24px muted                                   | ✅       | `className`; text and level untouched (§7.6)                    |
| `<strong>` around the colour word                        | ✅       | Inline markup inside the same `<p>`; `toHaveText` is unaffected |
| The empty state's link → `Button asChild`                | ✅       | Stays an `<a>`, same name, same href                            |
| Deleting the local `GROUP_STYLES` for `accents.ts`       | ✅       | Two identical strings become one                                |
| **Cutting the welcome line to "Willkommen."**            | ❌       | Dictionary — own commit, and FR-7 must still be met             |
| **Renaming the panel's `h2` away from "Ausgabe"** (§3.5) | ❌       | Dictionary — and probably not worth doing at all                |

Suggested sequence: **(1)** the conversion, e2e green untouched → **(2)** the welcome line, if FD
agrees it can go.

This is the shortest split in the conversion. Step 1 is one file and perhaps forty lines.

---

## 9. Responsive

- **≥ 1280px** — the target. With `SHELL`, the panel is 1 088px wide at 1440 and the sentence
  (781px at 40px would be ~1 300px — **measure it**, do not assume the 24px measurement scales) may
  or may not still fit on one line. If it does not, the break after the dash is the correct one and
  `text-balance` on the paragraph is the cheapest way to get it. §10 makes this a required check
  rather than a hope: the whole of §4.2a rests on it.
- **~800px** — measured today: main 768px, panel 704px, sentence on one line, page 900px, **0
  overflow**. At 40px it will wrap; two lines at 40px is still better than two lines at 24px.
- **390px** — measured today: nav wraps to 100px, panel at y=404, 326px wide, **0 overflow**. Not a
  working width. The only target is that no horizontal overflow appears, which is already true and
  a font-size change cannot break — but check it, because a `whitespace-nowrap` reflex applied to
  the sentence would.
- **No breakpoint of its own.** The screen has four elements; introducing an `md:` here would be a
  rule to maintain for no reader.

---

## 10. Verification, before the PR is opened

```bash
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:e2e                     # with no test edited
pkill -f next-server && npm run build && npm run start -- --port 3100 &
curl -s http://127.0.0.1:3100/ | grep -c "<a string you just added>"   # ≥ 1
playwright-cli open http://127.0.0.1:3100/
playwright-cli snapshot              # read it
```

- **Snapshot:** `heading level=1`, `heading level=2` for the panel, and **exactly one `paragraph`
  inside `next-distribution`**. That last one is not a nicety — it is §7.1, and it is the single
  thing most likely to turn this spec red.
- **Measure the line boxes, not the paragraph.**
  `const r = document.createRange(); r.selectNodeContents(p); [...r.getClientRects()]` prints one
  entry per line box. Today: two boxes, 651px and 130px. Confirm what it is at 40px, at 1920, 1440
  and 800.
- **Measure the group word the same way**, with a `Range` over just those three characters. Today:
  38×29px, 1.1% of the panel. Whatever the after number is, put both in the commit message.
- **All three clock states**, by writing `data/dev-now.txt` with `FD_FIXED_NOW_FILE` set:
  `2026-01-08` (a distribution day — must say _today_ and must not name a coming date),
  `2026-01-10` (the Saturday after — must say **Blau**, the §4.4 trap), and `2025-12-31` (nothing in
  force — the empty panel). Delete the file to hand the wall clock back.
- **Confirm the empty-state link still works and still lands on `/einstellungen`** — and note in the
  PR that the destination is a dead end until that screen's §4.2f is built.
- Three widths: `scrollWidth - clientWidth === 0` at 1440, 800, 390.
- `playwright-cli console` — 0 errors.
- **`playwright-cli show --annotate`, and stand back from the monitor.** This is the one screen whose
  acceptance test is "can you read it from the door", and it is not a test a snapshot can run.

This screen only reads, so driving it writes nothing to `data/fd.db`.

---

## 11. Open questions

1. **How big does the group word actually need to be?** §4.2a takes the sentence to 40px, which is a
   defensible guess and nothing more. The real answer is a person at the far end of the hall.
   `playwright-cli show --annotate` at two or three sizes, in front of FD, settles it in five
   minutes and cannot be settled any other way.
2. **Does the colour want to be the panel, or the panel plus something else?** Today the tint is
   `bg-red-600/10` at 704×142. A stronger fill would be more visible from a distance and less
   pleasant up close, and the same colour is a 10% tint everywhere else in the application — so
   deviating here means the dashboard paints the group differently from the hub and the record. It
   might be worth it on this screen alone. It is a question for FD, not a decision for a conversion.
3. **Is today's date earning its 20px?** Job C is genuinely incidental — the machine's clock is in
   the corner of the screen, and FR-7 requires the line, not its prominence. Demoting it to 16px
   muted would give the panel more contrast for free. Cheap to try, easy to revert.
4. **Should the panel name the _current_ week's colour as well?** Deliberately not, today: US-17.3
   requires "exactly one colour on screen at a time", and the second colour is the bug the spec's
   third case exists to catch. Worth re-asking only if staff turn out to want it — and the answer
   would then be a PRD amendment, not a design change.
5. **Does anything else belong on this screen?** 494 spare pixels is an invitation, and US-17.3
   deliberately declined it once already by moving the free-slot banner and the cards-due badge to
   the hub. The empty space is the design, and the next person to read this file should have to
   argue past this sentence to fill it.

---

## 12. What step 1 measured

Driven the way §1 was — a production build on port 3100, `FD_FIXED_NOW_FILE` pinned, both states,
1440 / 800 / 390. `home.spec.ts` passes with no test edited; console 0 errors; horizontal overflow 0
at all three widths in both states.

| Measure                              | Before                       | After                |
| ------------------------------------ | ---------------------------- | -------------------- |
| `<main>` (§3.8)                      | `x=336, w=768`               | `x=144, w=1152`      |
| Distribution sentence                | 24px                         | **40px**             |
| `h1`                                 | 30px, `foreground`           | 24px, muted          |
| The group's word, `Rot` (§3.1)       | 37.9×29 = 1 099px²           | 65×49 = **3 184px²** |
| …as a share of the panel             | 1.1%                         | 1.72%                |
| The sentence's two line boxes (§3.2) | 651 / 130px                  | 931 / 371px          |
| …and where they divide               | between `Rot` and `holt ab.` | after the dash       |
| The empty state's control (§3.7)     | 101×24px text link           | 112×36px `Button`    |

Three things the numbers say that the concept did not:

1. **One line is out of reach at 40px** — §4.2a, corrected in place above. The wrap stays; the
   division moves to the right place.
2. **The break place has a width floor.** After the dash needs 931px of panel for a short date and
   **1 030px for the longest realistic one** (`Donnerstag, 24. September 2026`), against 1 056px
   available. So it holds at 1440 and 1920 and gives out at about 1 030px of panel — roughly a
   1 130px window. Below that the date itself splits: at 800px it reads `Donnerstag, 6.` /
   `August 2026 – Gruppe Rot holt ab.`, where the old 24px kept the date and the colour together on
   line 1. §9 names ≥1280 as the target and that is where the screen is good; **if FD's machine
   turns out to be narrower, the cheap remedy is a fluid size** (`clamp(1.5rem, 3.2vw, 2.5rem)`
   restores the after-the-dash break down to 768px), and the size is §11.1's open question anyway.
3. **The empty state's prose is `text-base`, against the `Card`'s own 14px.** In that state the
   paragraph is the screen, and the card default is tuned for dense tables read from a chair.

`/einstellungen` in the `NoSettingsInForce` state still renders 0 forms, 0 inputs, 0 buttons and 0
links — §3.7's dead end is unchanged, and remains that screen's §4.2f to fix.

---

## 13. What FD decided (August 2026)

§8 left two content changes open — the welcome line (step 2) and the panel's `AUSGABE` heading
(§3.5, "probably not worth doing at all") — because both were dictionary edits and neither was ours
to make. FD asked for the screen in one sentence: a greeting as the header, **no** further welcoming
text, the date, and then either "Heute ist Ausgabetag" or "Die nächste Ausgabe findet … statt" in the
colour of the group. That answers both open questions at once, and one more the concept never asked.

Shown the result, FD then asked for the distribution line to be **smaller, out of the banner and
untinted**, with the group as "just a small note `(Rot)`" rather than the clause
`– Gruppe Rot holt ab.` That is the second column below, and it undoes most of step 1's typography.

| Element               | After step 1                                 | Now                                                     |
| --------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `h1`                  | 24px muted, "Füllhorn Delbrück – Verwaltung" | 30px full strength, "Willkommen im Delbrücker Füllhorn" |
| Welcome paragraph     | one sentence explaining the screen           | **gone** — `de.home.welcome` deleted                    |
| Panel heading         | `AUSGABE` eyebrow + `<h2>`                   | **gone** — `de.home.distribution.heading` deleted       |
| Distribution sentence | `Nächste Ausgabe: … – Gruppe Rot holt ab.`   | `Die nächste Ausgabe findet am … statt (Rot).`          |
| …and on the day       | `Heute ist Ausgabe – …`                      | `Heute ist Ausgabetag (Blau).`                          |
| Its size              | 40px (§12)                                   | 20px, matching the date line                            |
| Its container         | tinted `Card`, red or blue                   | **none** — a paragraph on the page                      |
| The group's word      | `<strong>` inside the tinted panel           | a plain `(Rot)` at the end of the sentence              |

Four notes on the reasoning, since the concept argued the other way on three of them:

1. **The `h1` carries the welcome, so the paragraph had nothing left to say.** §4.2c proposed
   shortening it to "Willkommen."; with the heading itself now saying that, even one word would be
   the same greeting twice. FR-7 is met by the two lines below it, which are the facts the deleted
   sentence merely announced.
2. **The panel heading went with it.** §3.5 called `AUSGABE` a label above a sentence that already
   names the Ausgabe, and kept it only because guide trap 1 wants a section title to stay a real
   heading. The trap is about _demoting_ a heading to a `div`; deleting the section title of the one
   card on a screen the `h1` already announces is a different act. The accessibility snapshot now
   reads `heading` → `paragraph` → `paragraph`, which is the whole screen.
3. **§3 is answered, not accepted.** The whole concept argued from §3.1 — the answer occupying 1.1%
   of a panel painted to deliver it — towards _more_ emphasis: 40px type, a tinted card, the colour
   word set apart. FD, who reads this screen in the actual hall, wanted less of all three. That is
   the finding §3 could not produce, because the reading distance in §2 was inferred and this was
   not. The screen is now four short lines with no chrome at all, and §3.4's 494 empty pixels are a
   deliberate feature rather than a symptom.
4. **US-03.4 is still satisfied, and more plainly than before.** The rule is that the group may
   never be carried by colour alone. With the tint gone, `(Rot)` is the _only_ thing naming the
   group — the requirement's preferred direction. §6's colour budget for this screen is now zero;
   `accents.ts`'s `GROUP_STYLES` is unchanged and still worn by the seven screens that name a
   household's group. §11.1 (how big the group's word wants to be) is **closed**: as small as the
   sentence.

The e2e contract in §7 held: `home.spec.ts` and `navigation.spec.ts` pass unedited, because every
assertion in them reads its expected text from `de.home.*` rather than repeating it. The one thing
that would have broken — §7.6, "the `h1`'s text may not change" — was a constraint on us, not on FD,
and it changed by their instruction.
