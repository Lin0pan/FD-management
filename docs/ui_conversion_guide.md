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
    <Button variant="ghost" asChild>
      <Link href="/"><ArrowLeft />{de.customers.card.backToHome}</Link>
    </Button>
  </div>
  <Card>…</Card>
</main>
```

- `max-w-6xl` where the content is wide (tables, multi-column figures); `max-w-4xl` for a form.
- One `Card` per section, `gap-6` between them. `CardHeader` gets `CardTitle` (+ `CardDescription` for
  what was a hint paragraph); actions belonging to the section go in `CardAction`.
- **Wrap the real heading inside `CardTitle`** — `<CardTitle><h2>…</h2></CardTitle>`. `CardTitle` is a
  `div`; without this the screen loses its heading outline.
- The back-link belongs in the header row, not stranded at the bottom.

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

## Definition of done, per screen

`npm run lint && npm run typecheck && npm run test:coverage && npm run build`, then
`npm run test:e2e` — **with no test edited**. If a spec fails, the conversion broke a contract; fix the
code. Then look at the real screen at ~1280px and ~800px: no horizontal page scroll, and the thing
that mattered before still dominates.

## Progress

- [x] `/ausgabe` — the counter (pilot)
- [ ] `/` home
- [ ] `/kunden`, `/kunden/[id]`, `/kunden/[id]/karte`, `/kunden/neu`
- [ ] `/warteliste`, `/warteliste/[entryId]/registrieren`
- [ ] `/karten-neuausstellung`
- [ ] `/einstellungen`
- [ ] `kunden/archive-controls.tsx` + `kunden/block-controls.tsx` — shared by the record **and** the
      counter, so converting them changes two screens; do it with `/kunden/[id]`.
- [ ] Global chrome in `src/app/layout.tsx`. There is none today: `body` is `flex flex-col` and every
      page is `flex-1`, so a nav shell can be added without fighting them.
