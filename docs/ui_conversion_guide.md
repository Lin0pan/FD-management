# Converting a screen to shadcn/ui

How `src/app/` is being moved off hand-rolled Tailwind and onto the primitives in
`src/components/ui/`, one screen at a time. `/ausgabe` was the pilot — read
`src/app/ausgabe/page.tsx` and `counter-lookup.tsx` alongside this file; they are the worked example.

This is a **restyle, not a rewrite**. A conversion touches JSX structure and `className` only. If you
find yourself moving a use case, changing a type, or editing a test, you have left the job.

## The setup, in one breath

Tailwind **v4**, no config file — the theme is `@theme inline` in `src/app/globals.css`. shadcn style
**`radix-nova`**, base colour **zinc**, icons **lucide-react**, `cn` in `src/lib/utils.ts`. The
primitives are ordinary project source and ours to edit; re-running `shadcn add` for a component we
have touched would overwrite that. Installed: `alert badge button card checkbox dialog dropdown-menu
input label radio-group select table textarea`. Anything else needs `npx shadcn@latest add <name>`.

## Page skeleton

```tsx
<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 md:p-8">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <h1 className="text-3xl font-semibold tracking-tight">{de.…heading}</h1>
    {/* only where the screen has one — see the back-link rule below */}
  </div>
  <Card>…</Card>
</main>
```

- The page sits under the navigation bar from `layout.tsx`, which uses this same `max-w-6xl` container.
  A screen that picks a different width no longer lines up with the bar above it — reason enough to
  stay with `max-w-6xl` unless the content argues otherwise.
- `max-w-6xl` where the content is wide (tables, multi-column figures); `max-w-4xl` for a form.
- One `Card` per section, `gap-6` between them. `CardHeader` gets `CardTitle` (+ `CardDescription` for
  what was a hint paragraph); actions belonging to the section go in `CardAction`.
- **Wrap the real heading inside `CardTitle`** — `<CardTitle><h2>…</h2></CardTitle>`. `CardTitle` is a
  `div`; without this the screen loses its heading outline. See "Two traps" below — the pilot got this
  wrong in two of its cards and nothing failed.
- **No back-link to a section** — the bar reaches all four from everywhere, so one would be a second,
  worse way home (US-17.4). A back-link that names a _record_ stays ("Zurück zur Kundenübersicht" from
  a customer's card), because the bar cannot say which customer you came from; it belongs in the header
  row, not stranded at the bottom.

## Mapping

| Was                                            | Becomes                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `<section>` + `<h2>` + free-floating content   | `Card` / `CardHeader` / `CardTitle` / `CardContent`              |
| `<button className="rounded bg-foreground …">` | `<Button>` (`default`)                                           |
| secondary / cancel button                      | `<Button variant="outline">` or `"secondary"`                    |
| a link that reads as an action                 | `<Button variant="ghost" asChild><Link>` — stays an `<a>`        |
| destructive button                             | `<Button variant="destructive">` (tinted, not solid red)         |
| `<input>` / `<textarea>`                       | `<Input>` / `<Textarea>`                                         |
| status or category pill                        | `<Badge>` — `secondary` / `destructive` / `outline`              |
| a real data table                              | `Table` / `TableHeader` / `TableRow` / `TableHead` / `TableCell` |
| confirmation or error paragraph                | `<Alert>` / `<AlertDescription>`                                 |
| `text-foreground/60,/70,/80`                   | `text-muted-foreground`                                          |
| `border-foreground/15,/20,/25`                 | `border-border` (or nothing — `Card` brings its own ring)        |
| `bg-foreground/5,/10`                          | `bg-muted` / `bg-muted/50`                                       |
| `bg-foreground text-background`                | `Button` `default`                                               |

## Non-negotiables

Break one of these and the Playwright suite is the only thing that will tell you — the unit suite
covers `src/domain` and `src/application` only, so `src/app/` changes are invisible to it.

1. **Every `data-testid` stays on the element whose text content it had.** Assertions are mostly
   `toHaveText`, which is exact: a testid must never come to contain its own label. The convention is
   the testid on the **value**, never the label.
2. **Carry `data-*` state attributes and load-bearing classes with the element they sit on** —
   `data-verdict` on the verdict banner, `whitespace-pre-line` where a hand-typed reason is shown
   verbatim (there is an e2e asserting the CSS itself).
3. **Native `<input type="checkbox">` stays native** wherever the action reads the value as _presence_
   in the `FormData` (`formData.get("x") !== null`). Radix's `Checkbox` is a `button[role=checkbox]`
   and submits nothing of its own. Pair it with `<Label htmlFor>` and style the input.
4. **`<details>`/`<summary>` disclosures stay.** They are clicked directly by testid, and they are a
   product decision, not a styling one: at the counter the queue is waiting, so nothing may have to be
   dismissed before the next customer is served. Do not reach for `Dialog`.
5. **A control that must be absent stays absent.** Several specs assert `toHaveCount(0)`, not
   `toBeDisabled()`.
6. **Keep `<main>`, keep the `<h1>`, keep ids** that JS or a spec reaches by (`id="counter-input"` is
   read by `document.getElementById`).
7. **`getByLabel` must keep working** — use `<Label htmlFor>` + `<Input id>`, and keep submit buttons'
   accessible names distinct (specs use `exact: true`).
8. **German strings only from `src/i18n/de.ts`.** A new card title means a new key there, not a literal.
9. **Literal palette colours stay literal where the colour _is_ the domain** — the RED/BLUE groups are
   the printed cards FD hands out, and the counter's green/amber/red is its traffic light. Neither is a
   semantic role a theme may re-map, and US-03 FR-7 requires the colour to be named in words as well as
   painted. Everything else uses tokens.
10. **The navigation bar holds exactly four links, and nothing else.** `navigation.spec.ts` asserts the
    four labels of `main-nav` as an exact list, so a wordmark, a search box or a settings icon _inside_
    the `<nav>` breaks it — put such a thing beside `<Nav />` in `layout.tsx`. The `nav-<section>`
    testids and `aria-current="page"` are the contract; the active section is marked three ways at once
    (rule, tint, weight) because colour alone is a distinction only some of the staff can make.

## Two traps the test suite cannot see

Both of these shipped in the pilot's first pass. Lint, typecheck, 899 unit tests and all 72 e2e specs
were green, and the screenshots looked right. They only surfaced in the accessibility tree — which is
the argument for the `playwright-cli` workflow below, not an aside.

The pattern behind both: **a shadcn primitive replaces a semantic element with a `div`.** Every time
you delete an element, ask what it was telling a screen reader, and put that back.

1. **A `Card` is not a section, and `CardTitle` is not a heading.** Converting
   `<section><h2>…</h2></section>` to `<Card><CardHeader><CardTitle>` silently deletes the heading. The
   pilot ended up with an entire screen whose only heading was the `<h1>`.
   **Check:** `querySelectorAll('h1,h2,h3')` must list every section title on the screen.
2. **A label and its value must stay in one node.** The old idiom was one paragraph —
   `<p><span>Portionen: </span><span>4</span></p>` — announced as a single fact. Splitting it into a
   styled `div` with two stacked `span`s leaves a screen reader reading "Portionen", then "4", with
   nothing joining them: the relationship is then carried by the visual layout alone. Keep the wrapper
   a `<p>`, or use a real `<table>` with `<th scope="row">` (which announces the row header with the
   cell, and is better than what it replaced).

## Colour is a budget; the word is not part of it

`/kunden` painted three tinted pills on every row — group, status, certificate — which is 45 marks on
a 15-row demo of which 8 were news. Red carried the group _and_ a block _and_ a lapsed certificate, so
a household could wear two unrelated red pills side by side and the eye had no signal left to spend.
**Colour applied to every row is not emphasis; it is texture.**

The rule that came out of it, and it applies to every screen with a status column:

> **Chrome marks the exception. The default state gets the word and nothing else.**

"aktiv" is 90% of the register and "gültig" is most of the rest; a pill on each says only "this row is
normal". Dropping those 22 pills lost nothing and left the 8 that matter as the only marks on screen.
Before adding a badge, count how many rows will wear it — if it is most of them, it is not a badge.

**The word never goes with the chrome.** US-03.4 requires it (a colour is a distinction only some of
the staff can make), and the specs assert it with an exact `toHaveText`. So the testid stays on a span
holding exactly the word, and the badge is wrapped _around_ that span rather than replacing it:

```tsx
const label = <span data-testid={testId}>{word}</span>;
return chrome === null ? label : <Badge variant={chrome.variant}>{label}</Badge>;
```

That is the general answer to "make this pill conditional without touching a spec" — see `StateWord`
in `src/app/kunden/page.tsx`. Keep the chrome in a `Record<State, Chrome | null>` beside it, so which
states are exceptions is one table to read rather than a condition to trace.

**A meaning gets one colour across the whole application, not one per screen.** "A slot is free" is
`border-emerald-600/40 bg-emerald-600/15` on the hub badge (`FREE_SLOT_ACCENT`, US-18.2) and plain
grey on `/warteliste`, where the act is actually performed — the same fact, painted twice, and the
paler one is where it matters. Before inventing a treatment for a state, grep for the state: if
another screen already says it, say it the same way. The converse holds too: two unrelated meanings
must not share a tint on one screen. `/warteliste` paints "the certificate lapsed" — explicitly _not_
a verdict — and "you are about to remove somebody from a queue" in the same amber.

## A comparison that wraps is not a comparison

`/karten-neuausstellung` exists to show two count sets side by side. Measured, its two values are
`Erwachsene: 2, Kinder: 2` on one line and `Erwachsene: 3, Kinder: 1` broken across two, because
their labels are different lengths and the box is 253px wide. The two figures a reader has to diff
end up 24px apart vertically and 372px apart horizontally. Nothing failed; the screen simply stopped
doing its job.

Whenever two values are on screen **to be compared**, they need a shared baseline, a shared
`x`-offset within their tile, `tabular-nums`, and enough width that neither wraps — the pilot's
`Stat` shape (label above value, wrapped in one `<p>`) gives all four. And check it with
`element.getClientRects()`, which prints one entry per line box: a screenshot shows two boxes that
look fine and says nothing about where the numbers inside them landed.

The recipe that fixed it, in one line each: `whitespace-nowrap` on the value so it cannot break, and
a `min-w-` floor on the tile wide enough for the longest German string it will ever hold. Both are
needed — the floor alone lets a longer string wrap, and `nowrap` alone lets the two tiles end up
different widths, which moves the second value's `x` and undoes the comparison just as thoroughly.
With `min-w-56` the two cards-due tiles are both 225px at every width from 1920 down to 800, and the
values sit 16px inside each; below that they stack, which is the right way to give up.

## A sticky table header inside a scroll container does not stick

`/kunden` carries a `<thead className="sticky top-0">` and a comment explaining that at 240 rows the
columns are otherwise unreadable halfway down. **It has never worked**, and nothing said so: measured
at 1440×500 scrolled to y=841, the header's `getBoundingClientRect().top` is `-213` — it has left the
window with the rows.

**Three** causes, and a conversion has to fix all of them or none is worth fixing:

1. The table sits in `overflow-x-auto`. When one axis is not `visible` the other computes to `auto`,
   so that div is a **scroll container**, and `sticky` inside it sticks to _that_ container's
   scrollport — which is as tall as the whole table and never scrolls internally. The header
   therefore never engages while the page scrolls. **shadcn's `Table` wraps itself the same way**
   (`data-slot="table-container"`, `relative w-full overflow-x-auto`), so converting to the primitive
   preserves the bug rather than fixing it.
2. **`Card` ships `overflow-hidden`.** Putting the table in a `Card` — which is what the conversion
   does — adds a second scrollport above the first, so fixing only the table container changes
   nothing. Override it on that one card (`<Card className="overflow-visible">`); `cn` is `twMerge`,
   so the later class wins.
3. `top-0` is the wrong offset anyway. `<Nav>` is `sticky top-0 z-40` and `h-12`, so a header that did
   stick would park underneath it. Use `top-12`, an **opaque** background (`bg-card` inside a card —
   the nav is translucent, and rows read through it), and a `z-10` that sits above the rows and below
   the bar.

Two things that look like fixes and are not:

- **`overflow-x-auto overflow-y-visible` is not a valid pair.** The computed value of the second is
  `auto` again, so the div is still a scroll container. What works is turning the container's
  overflow off at the widths where the table actually fits: `overflow-x-auto xl:overflow-x-visible`,
  which is why the `Table` primitive takes a `containerClassName`. Below that width the table scrolls
  sideways and the header gives up sticking, which is the right way round.
- **Picking that breakpoint by eye.** `/kunden` was first written `lg:` and pushed the whole _page_
  sideways by 26px at 1024, because ten columns need about 1000px and an `lg` content box has 928.
  Measure `documentElement.scrollWidth - clientWidth` at the breakpoint before believing it.

The check is one scroll in `playwright-cli`, and it is not optional on any screen with a long table:
scroll to the bottom of the list and confirm the header is still there and still opaque.

## Findings from the pilot

- **`radix-nova` is compact.** `Button`/`Input` default to `h-8`, `Card` is `text-sm`. Where a control
  is the screen's primary interaction, override it (`h-12 text-2xl` on the counter's number field) —
  the defaults are tuned for dense admin UI, not for reading standing up.
- `Card` uses `ring-1 ring-foreground/10`, **not** `border` + `shadow`. Don't add a border back.
- `variant="destructive"` is a **soft tint**, not solid red. Right for a confirm step; if you need a
  loud red, say so with a `className`.
- **`Label` is `"use client"`.** Importing it into a server component creates a client boundary. In a
  server-rendered form with no interactivity, a plain `<label htmlFor>` styled `text-sm font-medium`
  is the better trade. `Table` shipped the same way and **the directive has been removed** — nothing
  in it is client-only, and `/kunden` would otherwise have pushed 240 rows across the boundary for
  nothing. Deleting a `"use client"` only widens where a component may be used, so it is the right
  answer wherever a primitive turns out to have no interactivity; deleting it from one that _does_ is
  a build error, not a silent bug.
- `Alert` hardcodes `role="alert"`. Pass `role="status"` to override it for confirmations.
- **Local components that shadow shadcn names** collide on import; rename or delete the local one as
  part of converting that screen. `Badge` and `Table` in `kunden/page.tsx` are gone; `Card` in
  `kunden/[id]/karte/page.tsx` is still there.
- **Not every label/value grid wants a `Table`.** Prefer it for genuinely tabular data. For a handful
  of key/value pairs, lift the two or three figures that drive the decision into large tiles and put
  the rest in a two-column table with no header row — that is what turned the counter's eleven
  identical boxes into something readable.
- `Confirmation`/`Rejection` notice components are duplicated across five client components. Extract
  them into `src/components/` when the second screen needs them, not before.

## Findings from `/karten-neuausstellung`

- **A `<summary>` can be made to read as a button without ceasing to be one.** Rule 4 keeps the
  disclosure, but closed it must not look like a collapsed section spanning the row. Wrap
  `buttonVariants({ variant: "outline" })` around it with `cn` and add three things the variant does
  not bring: `w-fit` (a `<summary>` is a block and would otherwise span its container), `list-none`
  and `[&::-webkit-details-marker]:hidden` for the triangle. `inline-flex` from the variant already
  overrides `display: list-item`, and clicking still toggles — which is what the specs do.
- **`Dialog` is not an option for a disclosure a spec reads inside a row.** It portals its content to
  `document.body`, so `row.getByTestId(…)` stops resolving even though the text is on screen. That is
  a second, mechanical reason for rule 4 on top of the product one.
- **`reuseExistingServer: !CI` in `playwright.config.ts` is the `next start` trap again, wearing a
  suit.** A server left running on 3000 or 3001 from an earlier `npm run test:e2e` is reused by the
  next run, which then tests the build that server booted with. It cost a green suite that should
  have been red here, and the symptom is a new `data-testid` reported as "element(s) not found" while
  `curl` shows it in the HTML. Rebuild **and** `pkill -f next-server` before believing an e2e run
  that follows a UI change.
- **`CardHeader className="border-b"` is the supported way to rule off a header** — `Card` carries a
  `[.border-b]:pb-(--card-spacing)` selector that adds the padding to match.
- **A card header costs about 65px, and it is usually worth more than the target it breaks.** The
  concept asked for the first row at ≤260px; a real `<h2>` for the list plus the alert the product
  requires put it at 323. Say that with the arithmetic rather than dropping either — the number the
  restyle actually moved was the row height, 258px to 167.5px.

## Repeated field rows want a table, and a label that names the row will wrap

Both customer screens lay a household out as a list of rows, each a `sm:grid-cols-4` grid of three
inputs, and each labelled `Haushaltsmitglied N — Vorname`, `Nachname`, `Geburtsdatum`. Measured on
`/kunden/[id]` at 1440: in a 199px column the first label needs **two lines to the others' one**
(40px against 20), so **the first input in every row starts 20px below its two neighbours** — six
rows, six ragged baselines, and the three fields that are one person's data stop looking like one
row. `/kunden/neu` has the same defect in its single row.

The label is long because it carries the row's identity, which a per-field label is the wrong place
for. When the same fields repeat per row with identical meanings, that is **tabular data and wants a
`Table`**: the identity becomes a narrow first column, the field names become column headings once
instead of `N × 3` times, and anything jammed into a label to save space (`Geburtsdatum (39 Jahre)`)
gets a column of its own, which is what stops the headings differing per row.

What must not be lost in the move: **every input keeps a real accessible name**. Put the string the
visible label used to carry — `Haushaltsmitglied 2 — Vorname` — on the input as `aria-label`, so the
snapshot still names each `textbox` uniquely and nothing a screen reader hears changes. A column
heading names a column, not a cell.

## A form action clears every uncontrolled field it owns

`/kunden/neu`'s archive search takes three criteria and reports matches through `useActionState`.
Measured: after a search for `Nachname = Mohr`, all three inputs read `""` while the results say
"1 archivierter Haushalt gefunden". React resets a form once its action resolves, and an
`<input defaultValue="">` comes back empty — so the screen shows an answer with the question deleted,
and narrowing the search means retyping it.

Nothing fails, nothing warns, and it is invisible in a screenshot taken before the submit. The same
mechanism, from the other side, is why `group-control.tsx` renders its radios `defaultChecked` and
says so in a four-sentence comment: there, the reset is what restores the truth. **Whenever a form
submits through an action, decide deliberately for each field whether the post-action reset is
wanted** — and check it in `playwright-cli` by reading `input.value` after the submit, not by
looking at the page.

## Field width is a promise

Every field on `/kunden/neu` is 408px, because all four sections use one `sm:grid-cols-2`. `PLZ` is
408px for five digits, and so is `Hausnummer`. A field's width is the most reliable hint a form has
about what it wants, and a form where every field is the same width makes the same promise about all
of them.

Give a form a 12-column grid and spend it: 2 columns for a postcode or a house number, 4 for a name,
6 for a street, 12 for a note. It is `className` only, and on a long form it is the cheapest
legibility there is. Cards take the shell's full width; the field grid inside them does not — a
1152px text input is worse than a 400px one.

## Findings from `/warteliste`

- **A plain string exported from a `"use client"` module and read by a server component is not a
  string.** It arrives as a client-reference proxy, and interpolating it into an attribute writes
  `#function(){throw Error("Attempted to call ADD_FORM_ANCHOR() from the server…")}` into the DOM.
  Nothing throws, the page renders, lint and the whole suite stay green — the link simply has a
  nonsense `href`. It was visible **only** in the accessibility snapshot, which is the third time
  that has been the case on this conversion. A constant shared across the boundary belongs in a
  module with no directive, exactly like the `*-state.ts` files a `"use server"` module forces.
- **A translucent tint inside a tinted card composites into a third colour.** `bg-amber-500/10` for
  a lapsed certificate over the banner's `bg-emerald-600/15` is olive, which is neither meaning. Let
  the inner notice keep the card's opaque fill and carry its colour in the border instead.
- **`Card` brings `ring-1`, not `border`.** To give one card a coloured edge —
  `<Card className="ring-0 border border-emerald-600/40 …">`: the ring has to be turned off or the
  card wears two outlines a pixel apart.
- **A `<details>` as a flex item in the row's first line is fine.** Closed it sizes to its summary
  and sits where `ms-auto` puts it; opened, the form grows downward and wraps onto its own line when
  it no longer fits. No `absolute` positioning and no second layout needed.
- **A `waitForURL("**/warteliste")` does not match a URL carrying a fragment.** Adding
  `#warteliste-aufnehmen` to a link a spec follows turns a passing test red for a reason that has
  nothing to do with what the spec is about. Worth knowing before promising a deep link.

## Findings from `/kunden`

- **`Card` ships `overflow-hidden`.** It is there to round images, and it clips anything meant to
  escape the card — a sticky header above all (see above), but equally a popover or a hanging focus
  ring. `<Card className="overflow-visible">` on the one card that needs it; `cn` is `twMerge`, so the
  later class wins.
- **`TableRow`'s `hover:bg-muted/50` applies to the header row too**, which makes the column headings
  light up under the cursor as if they were a record. Put `hover:bg-transparent` on the `TableRow`
  inside `TableHeader`.
- **`Badge` is `h-5 text-xs`** — right for a dense table, small beside a `text-3xl` figure. It is a
  `span`, so it nests happily inside a `<Button asChild><Link>`, which is how a count travels _inside_
  the link it counts rather than beside it.
- **A native `<select>` that has to stay native still gets the tokens.** Keep the recipe in one const
  (`FILTER_SELECT` in `kunden/page.tsx`) so a row of them cannot drift apart:
  `h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none
focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30`.
  Give every control in a filter row the same height — three heights in one row reads as a ragged
  baseline, and it is the first thing that makes a form look unfinished.
- **A nested `<label><span>…</span><control/></label>` works only by nesting.** It survives until
  somebody moves the control. Converting a form is the moment to make it `<label htmlFor>` + `id`;
  the accessibility snapshot then names the `textbox` and the `combobox`es, which is what `getByLabel`
  needs anyway.
- **Merging two columns leaves two dead dictionary keys.** Delete them in the same commit — an unused
  key reads as a column somebody removed by accident.
- **A column heading is a width.** `whitespace-nowrap` on `TableHead` gives every column a hard floor
  equal to its German label, so "Nachweis gültig bis" cost 217px to show a ten-character date and the
  name column paid for it. But German compounds do not shorten gracefully: prefer cutting the heading
  to a shorter _true_ phrase ("Nachweis bis") over an abbreviation nobody says out loud, and where the
  column's real problem is repetition rather than width, fix the cell instead — thirteen noughts down
  a column of fifteen became a muted dash, and the two real tallies became the only thing visible.

## Findings from the two customer screens

- **A `<summary>` that wraps a `CardHeader` must not be `w-fit`.** The danger-zone recipe above adds
  `w-fit` because a `<summary>` is a block and would otherwise span its container — but when the
  summary _is_ the card's header, shrinking it to its minimum content width wraps the
  `CardDescription` into a column. Measured on the archive-search card: **348px tall for two lines
  of text**, and the card came out at 454px where the flat panel it replaced was 270. Without
  `w-fit` it is 160. `w-fit` for a control, full width for a header.
- **A disclosure a spec fills or checks cannot be closed by default _until the spec opens it_.**
  `locator.fill()` and `locator.check()` require visibility, and an element inside a closed
  `<details>` has none, so the action retries and times out. Grep the specs for the ids before
  promising a fold: that is what the fold costs, and the price is paid in spec edits, not in
  `className`. The archive search on `/kunden/neu` shipped as `<details open>` for this reason and is
  **now closed** (US-19) — `tests/e2e/reregistration.spec.ts` is the only spec that fills it, and its
  `searchArchive` helper clicks `getByTestId("archive-search-open")`, then waits for
  `#archiveLastName` to be visible, before typing. Two rules make that edit honest: give the
  `<summary>` a testid of its own and click it **for real**, never `evaluate(d => d.open = true)` — a
  fold that silently stopped opening has to turn the suite red — and check whether the panel sits
  under a `key`, because a `<details>` keeps `open` through any re-render and only a remount closes
  it, so one click per page load is enough (on `/kunden/neu` the `key` is on the registration form,
  not the panel). The group choice beside it followed in **US-20**, and it cost three spec files
  rather than one — `archive.spec.ts`, `card.spec.ts` and `reregistration.spec.ts` all `check()` a
  radio by CSS id, and each now clicks `getByTestId("group-choice-open")` first. **Both disclosures
  on `/kunden/neu` are now closed by default**, neither state is persisted, and both are opened in
  the specs by a real click on a summary that carries its own testid. `customer-record.spec.ts` was
  deliberately left alone: its `group-RED` is a different control on `/kunden/[id]`, which stays
  unfolded because there the choice is why the card was opened. The hand-out history, which no spec
  reaches, was closed from the start.
- **A fold only shortens a card if the folded control is what sets its height.** A card whose content
  is a `flex flex-wrap` row is as tall as its tallest child, so collapsing a shorter sibling changes
  nothing: US-20 folded the group column on `/kunden/neu` from 120px to 56px and the `Zuordnung` card
  stayed at 220px, because a `Stat` tile in the same row is 81px and the card's own padding and
  footer are the rest. `card.getBoundingClientRect().height` cannot tell you that — walk the header,
  the content, the row and each of its children in one `eval` and compare, _before_ writing a height
  budget into a PRD. Measuring the "before" of something already committed is cheap:
  `git checkout HEAD~1 -- <files>`, build, measure, `git checkout HEAD -- <files>`.
- **A restyle that tidies `Feld: Wert` into `Feld Wert` breaks the sweeps.** Four specs assert
  `getByRole("main")` `toContainText("Kundennummer: 1")`. The record's new identity line dropped the
  colon for a cleaner line and turned all four red — a failure that names no testid and points at
  `<main>`, so it reads like a missing element rather than a changed separator. The label and the
  separator are part of the contract wherever a sweep is how a value is asserted.
- **`useId` beats the field name for a form's `htmlFor`.** The record carries two forms that both
  hold a `firstName`; ids taken from the name would collide and point every label at whichever
  rendered first. Where a spec reaches a field by CSS id — `/kunden/neu` does, sixteen times — the
  id is load-bearing and stays; where it reaches by testid, generate it.

## Always drive the screen with `playwright-cli`

**Use the `playwright-cli` skill for every piece of UI work on this project** — building it and
reviewing it. Not optional, and not a substitute for the e2e suite: the suite proves the contracts still
hold, `playwright-cli` is how you find out whether the screen is any good. Run `playwright-cli --help`
for the current command set.

A screenshot only tells you what a sighted person sees in one state. The accessibility snapshot tells
you what the markup _means_, and both of the traps above were invisible until it was read.

```bash
npm run build && npm run start -- --port 3100   # a built app, not `next dev`
playwright-cli open http://127.0.0.1:3100/<route>
playwright-cli snapshot                          # read this, not just the screenshot
playwright-cli fill e18 "6" --submit             # exercise the real flow
playwright-cli console                           # must be 0 errors
playwright-cli close
```

> ⚠️ **`next start` serves the build it booted with.** Rebuilding does not reach a running server, and
> a server left over from an earlier session will happily answer on the port and show you the old
> screen. **Kill it and restart after every `npm run build`**, and prove which build you are looking
> at before you measure anything:
>
> ```bash
> pkill -f next-server && npm run build && npm run start -- --port 3100 &
> curl -s http://127.0.0.1:3100/<route> | grep -c "<a string you just added>"   # must be ≥ 1
> ```
>
> This is not hypothetical: the first `/kunden` measurement of this session was taken off a stale
> server and was wrong by 150px. A measurement you cannot trace to a build is not a measurement.

What to actually check, beyond "it looks right":

- **Read the snapshot.** Every section title a `heading`, every field a named `textbox`, every pill a
  `Badge` with the right text, every notice a `status` or `alert` region. `generic` where you expected
  a heading is the bug from "Two traps".
- **Exercise the writes, don't just render them.** The pilot's reminder, serve, correct and remove
  flows all behaved — but only clicking them proved that the `role="status"` override lands, the
  `getElementById` refocus still works, and the two-step `<details>` guard genuinely blocks a single
  click (the click on the closed disclosure _retries and fails_, which is the property).
- **`playwright-cli console`** — zero errors. Warnings from browser-native inputs on hand-crafted URLs
  are fine.
- **Three widths, plus every breakpoint you introduced**: ~1440, ~800, ~390, and both sides of any
  `md:`/`lg:`/`xl:` the screen now depends on. `document.documentElement.scrollWidth - clientWidth`
  must be `0` at each, and any `[data-slot=table-container]` must not scroll unless it has to. The
  1024 overflow on `/kunden` existed only _at_ the breakpoint and was invisible at all three of the
  standard widths.
- **Measure the claim, before and after.** If the reason for the restyle is "the table starts too far
  down" or "the search box is too small", that is a number: take it on the old build, take it again on
  the new one, and put both in the commit message. It is the only way to tell an improvement from a
  rearrangement — and if the target turns out not to be reachable, say so with the budget that shows
  why rather than quietly dropping it.
- Ask whether **the thing that mattered before still dominates**. On the counter that is the banner and
  the verdict; a restyle that evens everything out has made the screen worse.
- Use **`playwright-cli show --annotate`** to put the live screen in front of the user for design
  feedback rather than guessing.

Note that driving real flows **writes to `data/fd.db`**. That is fine — it is dev data — but say so, and
`npm run db:demo -- --reset` puts the demo register back.

## Definition of done, per screen

`npm run lint && npm run typecheck && npm run test:coverage && npm run build`, then
`npm run test:e2e` — **with no test edited**. If a spec fails, the conversion broke a contract; fix the
code. Then the `playwright-cli` pass above, against a server you restarted after the build: snapshot
read, flows exercised, console clean, widths checked, and the before/after number for whatever the
restyle claimed to fix.

**Split the commits by what they change.** A conversion touches JSX structure and `className`, and its
proof is the e2e suite passing untouched. Changing what the screen _says_ — a paragraph cut, a heading
reworded, a value printed differently — is a second commit, so that the first one's green run means
what it says. Anything that needs a spec edited is a third, and wants its own argument.

**Add what you learned here.** A conversion that turns up a trap, a primitive that behaves unexpectedly
or a rule worth reusing is only worth its cost once; this file is where it stops being worth it a
second time.

## Progress

- [x] `/ausgabe` — the counter (pilot)
- [x] Global chrome — the navigation bar in `src/app/nav.tsx`, worn by every screen from
      `src/app/layout.tsx`.
- [ ] `/` home — concept written, `docs/ui_redesign_start.md`. Read §7.1 first: `home.spec.ts` reads
      the distribution panel as `locator("p")` with an exact `toHaveText`, so a second `<p>` inside
      it — a `Stat`, a hint — is a strict-mode violation on three assertions.
- [x] `/kunden` — the hub itself, per `docs/ui_redesign_kunden_verwalten.md`. Read §7 before touching
      it: it lists the constraints `tests/e2e/customer-list.spec.ts` puts on the screen (the three
      filters cannot become Radix `Select`s, and every `customer-row-*` testid is asserted exactly).
- [x] `/kunden/neu`, per `docs/ui_redesign_kunden_neu.md`. The form starts at 630px instead of 752,
      a match row is 56px instead of 280, and the search keeps its criteria. `SHELL` and `Stat` were
      extracted in this pass (`src/app/shell.ts`, `src/app/stat.tsx`).
- [x] `/kunden/[id]`, per `docs/ui_redesign_kunden_record.md`. 2 907px instead of 3 623, the four
      derived figures at 255px instead of 1 537, and the block reason 116px below the status it
      explains instead of 2 602. It carried `kunden/archive-controls.tsx` and
      `kunden/block-controls.tsx` with it, in a commit of their own first.
- [ ] `/kunden/[id]/karte` — concept written, `docs/ui_redesign_kunden_karte.md`. Read §4.5 before
      touching it: the type sizes are US-02.4's "legible across a desk", not a style choice.
- [x] `/warteliste`, `/warteliste/[entryId]/registrieren`, per `docs/ui_redesign_warteliste.md`. The
      banner wears the hub's emerald, the row is 117px instead of 214, and the promotion screen's
      frame and expired step are converted. `RegistrationForm` inside it is **not** — it belongs to
      the `/kunden/neu` pass, so that screen still shows a seam.
- [x] `/karten-neuausstellung`, per `docs/ui_redesign_karten_neuausstellung.md`. The two count sets
      now line up on one baseline, and a `GROUP_CHANGE` row prints the colour that changed.
- [ ] `/einstellungen` — concept written, `docs/ui_redesign_einstellungen.md`. Read §3.1 first: a
      rejected save silently discards every edit, valid ones included, and no screenshot shows it.
- [x] `kunden/archive-controls.tsx` + `kunden/block-controls.tsx` — shared by the record **and** the
      counter. Done first, in a commit of their own; the summaries are now 209×32px at `10px`
      against the `Card`'s 14, on both screens.
