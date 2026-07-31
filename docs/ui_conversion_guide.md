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

## A sticky table header inside a scroll container does not stick

`/kunden` carries a `<thead className="sticky top-0">` and a comment explaining that at 240 rows the
columns are otherwise unreadable halfway down. **It has never worked**, and nothing said so: measured
at 1440×500 scrolled to y=841, the header's `getBoundingClientRect().top` is `-213` — it has left the
window with the rows.

Two causes, and a conversion has to fix both or neither is worth doing:

1. The table sits in `overflow-x-auto`. When one axis is not `visible` the other computes to `auto`,
   so that div is a **scroll container**, and `sticky` inside it sticks to _that_ container's
   scrollport — which is as tall as the whole table and never scrolls internally. The header
   therefore never engages while the page scrolls. **shadcn's `Table` wraps itself the same way**
   (`data-slot="table-container"`, `relative w-full overflow-x-auto`), so converting to the primitive
   preserves the bug rather than fixing it.
2. `top-0` is the wrong offset anyway. `<Nav>` is `sticky top-0 z-40` and `h-12`, so a header that did
   stick would park underneath it. Use `top-12`, an **opaque** `bg-background` (the nav is
   translucent, and rows read through it), and a `z-10` that sits above the rows and below the bar.

The check is one scroll in `playwright-cli`, and it is not optional on any screen with a long table:
scroll to the bottom of the list and confirm the header is still there and still opaque.

## Findings from the pilot

- **`radix-nova` is compact.** `Button`/`Input` default to `h-8`, `Card` is `text-sm`. Where a control
  is the screen's primary interaction, override it (`h-12 text-2xl` on the counter's number field) —
  the defaults are tuned for dense admin UI, not for reading standing up.
- `Card` uses `ring-1 ring-foreground/10`, **not** `border` + `shadow`. Don't add a border back.
- `variant="destructive"` is a **soft tint**, not solid red. Right for a confirm step; if you need a
  loud red, say so with a `className`.
- **`Label` and `Table` are `"use client"`.** Importing them into a server component creates a client
  boundary. In a server-rendered form with no interactivity, a plain `<label htmlFor>` styled
  `text-sm font-medium` is the better trade.
- `Alert` hardcodes `role="alert"`. Pass `role="status"` to override it for confirmations.
- **Three local components shadow shadcn names** and will collide on import: `Badge` and `Table` in
  `kunden/page.tsx`, `Card` in `kunden/[id]/karte/page.tsx`. Rename the local one as part of converting
  that screen.
- **Not every label/value grid wants a `Table`.** Prefer it for genuinely tabular data. For a handful
  of key/value pairs, lift the two or three figures that drive the decision into large tiles and put
  the rest in a two-column table with no header row — that is what turned the counter's eleven
  identical boxes into something readable.
- `Confirmation`/`Rejection` notice components are duplicated across five client components. Extract
  them into `src/components/` when the second screen needs them, not before.

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
- **Three widths**: ~1440, ~800, ~390. `document.documentElement.scrollWidth - clientWidth` must be
  `0` at each, and any `[data-slot=table-container]` must not scroll unless it has to.
- Ask whether **the thing that mattered before still dominates**. On the counter that is the banner and
  the verdict; a restyle that evens everything out has made the screen worse.
- Use **`playwright-cli show --annotate`** to put the live screen in front of the user for design
  feedback rather than guessing.

Note that driving real flows **writes to `data/fd.db`**. That is fine — it is dev data — but say so, and
`npm run db:demo -- --reset` puts the demo register back.

## Definition of done, per screen

`npm run lint && npm run typecheck && npm run test:coverage && npm run build`, then
`npm run test:e2e` — **with no test edited**. If a spec fails, the conversion broke a contract; fix the
code. Then the `playwright-cli` pass above: snapshot read, flows exercised, console clean, three widths
checked.

## Progress

- [x] `/ausgabe` — the counter (pilot)
- [x] Global chrome — the navigation bar in `src/app/nav.tsx`, worn by every screen from
      `src/app/layout.tsx`.
- [ ] `/` home
- [ ] `/kunden`, `/kunden/[id]`, `/kunden/[id]/karte`, `/kunden/neu` — `/kunden` is analysed and
      planned in `docs/ui_redesign_kunden_verwalten.md`; read it before starting, particularly §7,
      which lists the constraints `tests/e2e/customer-list.spec.ts` puts on the conversion (the three
      filters cannot become Radix `Select`s).
- [ ] `/warteliste`, `/warteliste/[entryId]/registrieren`
- [ ] `/karten-neuausstellung`
- [ ] `/einstellungen`
- [ ] `kunden/archive-controls.tsx` + `kunden/block-controls.tsx` — shared by the record **and** the
      counter, so converting them changes two screens; do it with `/kunden/[id]`.
