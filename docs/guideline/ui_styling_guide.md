# UI styling guide

The rules for every screen in `src/app/`. Read this before building or changing one. It is the whole
standard — there is no second UI document.

## 1. The stack

Tailwind **v4, no config file** — the theme is the `@theme inline` block in `src/app/globals.css`.
shadcn style `radix-nova`, base colour **zinc**, primitives **Radix** (`radix-ui`), icons
**lucide-react**, `cn` (= `twMerge(clsx(…))`) in `src/lib/utils.ts`, font **Inter** self-hosted via
`next/font`.

- Installed primitives: `alert badge button card checkbox dialog dropdown-menu input label
radio-group select table textarea`. Anything else: `npx shadcn@latest add <name>`.
- `src/components/ui/` is ordinary project source and ours to edit. **Never re-run `shadcn add` over
  a component we have touched** — it overwrites the edit.
- A re-theme is a change to the token block in `globals.css` and nothing else. `--destructive` is the
  only chromatic token; everything else is neutral zinc (see §5).
- `radix-nova` is compact: `Button` and `Input` are `h-8`, `Card` is `text-sm`. Override where a
  control is the screen's primary interaction; the defaults are tuned for dense admin UI, not for
  reading standing up.
- `.dark` tokens exist and nothing toggles them. Do not build a theme switcher without being asked.
- **Do not add**: a form library (`react-hook-form` fights `useActionState`), a toast library (an
  answer renders beside its own button, §7), a date picker, or a chart library. A day is a **typed**
  `TT.MM.JJJJ` text field — `DateInput` in §11, not `<input type="date">` and not a calendar
  ([ADR-013](../architecture/adr/013-type-calendar-days-as-tt-mm-jjjj-instead-of-using-the-native-date-input.md)).

## 2. Page skeleton

```tsx
<main className={SHELL}>
  <div className="flex flex-wrap items-center justify-between gap-3">
    <h1 className="text-3xl font-semibold tracking-tight">{de.….heading}</h1>
  </div>
  <Card>…</Card>
</main>
```

- `SHELL` from `src/app/shell.ts`. Do not write a width per screen: `Nav` uses the same `max-w-6xl`
  container, and a screen that picks another width stops lining up with the bar above it.
- The heading row stays **outside** any card. One `Card` per section, `gap-6` between.
- `CardHeader` takes `CardTitle` (+ `CardDescription` where a hint paragraph would have gone);
  section-level controls go in `CardAction`. Rule off a header with
  `<CardHeader className="border-b">` — `Card` adds the matching padding.
- **`<CardTitle><h2>…</h2></CardTitle>`.** `CardTitle` is a `div`; without the `h2` the screen loses
  its heading outline and nothing fails (§9).
- Reach for `CardTitle` when the block is a _part_ of the page; leave it off when the block is what
  the page is _about_. A boundary is not a section.
- **No back-link to a section** — the nav reaches all four from everywhere. A back-link that names a
  _record_ stays, in the header row, never stranded under the last card.
- The nav holds exactly four links and nothing else. Anything else global goes beside `<Nav />` in
  `layout.tsx`.

## 3. Layout and density

- **Field grid is twelve columns, and spend them.** 2 for a postcode or house number, 4 for a name,
  6 for a street, 12 for a note. A form where every field is the same width makes the same promise
  about all of them.

  ```tsx
  const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12"; // on the wrapper
  const FIELD_ROWS = "grid grid-rows-subgrid row-span-2 gap-1.5"; // on each field
  ```

  `grid-rows-subgrid` is what keeps the controls on one baseline when a German label wraps. Never a
  `min-h-` guess and never `mt-auto`. The field then has exactly two children — a hint under the
  control wraps both in one element.

- A card takes the shell's full width; the field grid inside it does not.
- **One control height per row.** Three heights in a filter row reads as a ragged baseline and is the
  first thing that makes a form look unfinished.
- `max-w-prose` on every sentence. `whitespace-pre-line` wherever a hand-typed reason or note is
  shown verbatim.
- **`Table` for genuinely tabular data** — and for repeated field rows, where the row's identity
  becomes a narrow first column instead of being jammed into every label. For a handful of key/value
  pairs use a two-column table with no header row, and lift the figures that drive the decision out
  as `Stat` tiles (§4).
- `<TableRow className="hover:bg-transparent">` on the row inside `TableHeader`, or the column
  headings light up like a record.
- A column heading is a width: `whitespace-nowrap` gives every column a floor equal to its German
  label. Cut the heading to a shorter _true_ phrase rather than an abbreviation nobody says aloud.
- **Sticky table header needs all four**, or none of them is worth doing:

  ```tsx
  <Card className="overflow-visible">                                  {/* Card ships overflow-hidden */}
    <Table containerClassName="overflow-x-auto xl:overflow-x-visible"> {/* not overflow-y-visible */}
      <TableHeader className="z-10 bg-card xl:sticky xl:top-12">      {/* same xl: as the overflow */}
  ```

  Pick the breakpoint by measuring `documentElement.scrollWidth - clientWidth` at it, not by eye.

- **A sticky offset is measured from the scrollport, so `top-N` and the scrollport have to agree.**
  Sticky shifts a box in _either_ direction: `top: 48px` against a scrollport already at 0 is not
  satisfied by staying put, so the header is pushed 48px **down** — opaque, over the first row.

  | The scrollport is…                                               | The header must be…                        |
  | ---------------------------------------------------------------- | ------------------------------------------ |
  | the **window** (container `overflow-x-visible`)                  | `sticky top-12` — clear the nav            |
  | the **container** (`overflow-x-auto`, `max-h-… overflow-y-auto`) | `sticky top-0` — there is nothing to clear |

  A container whose overflow switches at a breakpoint switches which of those two rows applies, so
  the stickiness carries the **same breakpoint** as the overflow. `/kunden` shipped `sticky top-12`
  against an `xl:`-switched container and hid the first row of the register at every window under
  1280px, for weeks: the row was in the DOM, the result count counted it and the group balance
  counted it, so DF reported a customer missing from the list and every spec stayed green.

- **Anything painted over rows is a `bg-*` and a `z-` away from hiding one.** Whenever you add a
  sticky, fixed or floating element, hit-test what is beneath it at its resting position —
  `document.elementFromPoint` at the centre of the first row, at both sides of every breakpoint
  involved. `toBeVisible()` cannot see this and neither can a screenshot you did not think to take at
  that width; `tests/e2e/layout.ts` is the assertion, and it belongs in the spec of any screen that
  grows one of these.

- **Empty state is an `<Alert role="status">`** inside the card the list would have filled, naming
  the filters in force. "Not configured yet" is a gentler state of its own that points at
  `/einstellungen`; it is not an error screen.
- Bound a long list with `max-h-` + `overflow-y-auto` rather than letting the page grow.

## 4. Emphasis

- **The biggest type belongs to the value that leaves the screen.** Ask of every value: is it read
  aloud, typed into something else, or checked against a piece of paper? Those get the size, the
  `tabular-nums` and the short line — not whatever a database would call the record's title.
- **`Stat` (`src/app/stat.tsx`) is the promotion.** A tile is a figure that drives a decision;
  everything else is a line. Never hand-roll its chrome for something that is not one — two
  components that look identical and read differently teach a rule and then break it.
- Put a promoted pair in the grid that is already there rather than in a parallel `flex` row, so one
  column rhythm runs down the page.
- Where two values exist **to be compared**, they need a shared baseline, the same offset inside
  their tile, `tabular-nums`, and `whitespace-nowrap` plus a `min-w-` floor so neither wraps and both
  tiles stay the same width. Both, not either.
- `tabular-nums` on every number that is read, compared or called out.
- **Stacked pairs take no colon; inline pairs do.** A line break is a separator, a space is not.
- Sizing may differ by task from screen to screen. The _shape_ may not: label above value,
  `tabular-nums`, one spelling of the label everywhere.
- A filled tile is a claim about its container. If it looks orphaned, supply the container; do not
  strip the fill.
- When you find the third hand-rolled copy of a label/value shape, that is the component.

## 5. Colour

- **Theme tokens by default.** `text-muted-foreground`, `border-border`, `bg-muted` / `bg-muted/50`,
  `bg-primary`. Never `text-foreground/70`, `border-foreground/20`, `bg-foreground/5`.
- **`src/app/accents.ts` is the list of permitted literal colours**, each reserved for one meaning:

  | Export                    | Meaning                                      |
  | ------------------------- | -------------------------------------------- |
  | `GROUP_STYLES`            | the RED / BLUE printed card                  |
  | `FREE_SLOT_ACCENT`        | a customer number is free, somebody waits    |
  | `CONFIRMATION_ACCENT`     | a write went through                         |
  | `REFUSAL_ACCENT`          | a write was refused, nothing is broken       |
  | `PAYMENT_STANDING_STYLES` | a hand-out was paid short, exactly or over   |
  | `BALANCE_STYLES`          | a household owes, has paid ahead, or neither |

  **Before painting a state, look for it there.** If it is not listed, the question is what the state
  means, not which green — and the answer is a new named export in that file, never a tint in a
  screen.

- **Two literals are deliberately outside it**, because each is one screen's own and answers to that
  screen's job: the counter's traffic light (`ausgabe/counter-lookup.tsx`) and the two
  full-strength submit buttons that follow it (`serve-controls.tsx`, `certificate-controls.tsx`).
- **A meaning gets one colour application-wide**, and two unrelated meanings must not share a tint on
  one screen. `BALANCE_STYLES` and `PAYMENT_STANDING_STYLES` share red-500 and blue-500 on purpose
  and are the worked example of the rule rather than a breach of it: a hand-out paid short and a
  household carrying a debt are one meaning — money is owed — read at two altitudes. `BALANCE_STYLES`
  is a **fill without a border**, because every `Stat` tile is borderless and outlining one of five on
  a row would make it a different kind of object; a settled balance is `null` and keeps `bg-muted/50`,
  since colour there means _something is standing_. A second _weight_ of a meaning is still that meaning and belongs in `accents.ts` beside
  the first, not in a screen. Two are currently hand-written and must not be copied further: the
  solid group fill (`bg-red-600` / `bg-blue-700`, against `GROUP_STYLES`' tint) exists in
  `ausgabe/page.tsx` and `kunden/[id]/karte/page.tsx`, and "the certificate has lapsed" is written as
  amber in `kunden/page.tsx`, `warteliste/page.tsx` and `warteliste/free-slot-banner.tsx`.
  `grep -rn "bg-red-\|bg-blue-\|bg-green-\|bg-amber-\|bg-emerald-" src/app` finds every copy.
- **Chrome marks the exception; the default state gets the word and nothing else.** Before adding a
  badge, count how many rows will wear it — if it is most of them, it is not a badge, it is texture.
  Keep which states are exceptions in a `Record<State, Chrome | null>` beside the component, the way
  `STATUS_CHROME` in `kunden/state-word.tsx` does.
  **One column is deliberately excepted**, and it is the only one: the payment standing in the
  record's hand-out history (US-29.8) marks every row, „genau“ included, although most payments are
  exact. The column is a column of _judgments_ rather than of states, and a row carrying an amount
  with no mark beside it reads as one nobody has judged yet — which is exactly the question the
  column exists to answer. Do not take it as licence for a second such column.
- **The word never goes without the chrome** (US-03.4). Wrap the `Badge` _around_ the span holding
  exactly the word; do not let the badge replace it.
- Never nest a translucent tint inside a tinted container — the two composite into a third colour
  that means neither. Let the inner element keep the opaque fill and carry its colour in the border.
- To give one `Card` a coloured edge: `<Card className="ring-0 border border-…">`. `Card` brings
  `ring-1`, not a border, so the ring has to go or the card wears two outlines.
- `Badge` `variant="outline"` when layering an accent on it; `default` paints the text white.

## 6. Controls

> **A border means the control does something to the data. Borderless means it only takes you
> somewhere.**

| Variant       | Spent on                                                                          |
| ------------- | --------------------------------------------------------------------------------- |
| `default`     | the primary write on the screen                                                   |
| `outline`     | a secondary write, a cancel, a `<summary>` that opens a write                     |
| `secondary`   | a write of equal weight beside another                                            |
| `ghost`       | a link that only navigates — `<Button variant="ghost" asChild><Link>`             |
| `destructive` | a confirm step. It is a **soft tint**; say so with a `className` if you need loud |
| `link`        | inline within prose                                                               |

- **A link that opens the screen's write is bordered**, because it _is_ the write, one click earlier:
  „Neuen Kunden aufnehmen" and „Jetzt registrieren" are `default`, „Auf die Warteliste setzen" is
  `outline`. `ghost` is for a link that goes somewhere and does nothing — the hub links, „Filter
  zurücksetzen", „Zur Kundenübersicht".
- The one true exception: a link that is the sole way out of a dead end keeps `outline` although it
  only navigates, because it is the offered next step. Nothing else navigates with a border.
- Give a ghost link room — `justify-between` across the row, or the `CardAction` slot. Eight pixels
  from a bordered button it reads as that button's caption, not as a second thing you can do.
- **One name per destination.** A screen is called what it calls itself, everywhere it is linked.
- **Native `<input type="checkbox">` and `<input type="radio">` stay native** wherever the action
  reads the value as presence in `FormData`. Radix's `Checkbox` is a `button[role=checkbox]` and
  submits nothing. Style the input: `size-4 accent-primary`.
- **Native `<select>` stays native**, styled from `selectClass(height)` in `src/app/select.ts` — one
  recipe so a row of them cannot drift. Radix `Select` submits nothing inside a `<form>` and is not
  reachable by `selectOption`.
- **Disclosures are `<details>`/`<summary>`, never `Dialog`.** At the counter the queue is waiting, so
  nothing may have to be dismissed before the next customer is served. `Dialog` also portals to
  `document.body`, so a spec reading inside a row stops resolving.

  ```tsx
  <summary className={cn(buttonVariants({ variant: "outline" }), SUMMARY)}>
  // SUMMARY = "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden"
  ```

  **`w-fit` for a control, full width for a header** — a `<summary>` wrapping a `CardHeader` must not
  shrink to its content.

- A `<details>` keeps `open` through any re-render, including a soft navigation to the same route.
  Put a `key` on the card so it remounts closed.
- **A control that resets a form navigates the document** — a plain `<a href>` inside the ghost
  `Button`, never a `Link`. Same family of bug as the one above: a soft navigation to the same route
  reconciles the DOM that is already there, and React writes `defaultValue`/`defaultChecked` on mount
  only, so every field the staff member has touched keeps its value against the new default. „Filter
  zurücksetzen" cleared the table and left all four filter controls reading the filters it had just
  dropped. Submitting a `method="get"` form is a document navigation already, which is why the apply
  path never showed it.
- **State seeded from a server prop does not follow it.** `useState(props.x)` reads the prop once, on
  mount; every later render leaves the state where it was. The same family again — and the one that
  bites on a page of several forms, because **any** write revalidates the route and hands every panel
  fresh props. Ask it of every client component that holds server data: _can another form's save
  change this component's props?_ Where the answer is yes, reseed it, one of two ways:
  - **A `key` on the component**, which resets it by remounting. Simplest, and wrong wherever the
    component owns a `useActionState`: the remount throws away the „Gespeichert." the staff member
    is reading. `renewal-form.tsx` gets away with it because the key is on a _child_.
  - **A value-keyed resync during render** — `household-editor.tsx`. Compare what the props _say_,
    never their identity: a mapped array is a new object on every render and would reset the form on
    every keystroke elsewhere on the page. Keeps the action state, so the confirmation survives.

  It was `updateCustomerDetails` writing the customer's name into their household row that made the
  household table stale: it went on showing the name from before the correction, and its locked row
  stopped recognising the customer and unlocked itself.

- A summary can label its own state with no client component: `group` on the `<details>`, then
  `group-open:hidden` on one word and `hidden group-open:inline` on the other.
- **A folded control still needs its label where every other column keeps it.** What the summary says
  about itself is not the label. A `<summary>` is not labelable — use a `<span>` plus
  `aria-labelledby`.
- **A control that must be absent stays absent.** `return null`, not `disabled`. The exception is a
  control that **repeats down a table**: on the one row where it may not act, a cell that empties
  itself reads as a rendering fault rather than as a rule, and the rows below shift under the hand
  reaching for them. It stays, `disabled`, and the reason is stated once under the table — the
  household tables' „Zeile entfernen" on the customer's own row.
- **Destructive writes**: a closed `<details>`, a warning `Alert` inside it, a required reason
  `Textarea`, and a `destructive` submit disabled until a reason is typed. The disabled button is a
  courtesy; the use case is the guard.
- **Pending is `disabled={pending}` plus a German label swap.** No spinners, no skeletons.
- **A save button is named after what it saves.** Five buttons reading "Speichern" are
  indistinguishable by keyboard and by screen reader.
- **A multi-field data-entry form is saved on purpose: `onKeyDown={guardEnter}`** from
  `src/app/enter-guard.ts`. A form with one submit button submits on Enter in any field, which is
  right for a search box and wrong for a save. DF reported it from „Kunde aufnehmen": staff who type
  fast were registering households with the members still half-entered and the group still the
  proposed one, and that save consumes a customer number and issues a card. The guard hangs on the
  `<form>`, never on the document — the intake and the archive-search panel sit on the same screen
  and only the first one loses its Enter.

  It swallows Enter in a text field and a `<select>`, and leaves it everywhere it means something
  else: the `<textarea>` keeps its newline, a `<summary>` its disclosure, and the **submit button
  its activation**, so the form is still finishable without a mouse. Search boxes and the counter
  loop on `/ausgabe` — where Enter _is_ the interaction — take no guard at all; neither do the
  single-field confirm forms, which have nothing half-filled to protect.

## 7. Feedback

**Every write says what happened.** One component — `src/app/notice.tsx` — and no hand-written
`<Alert>` for an action's answer.

| Tone      | Means                                                   | Icon            |
| --------- | ------------------------------------------------------- | --------------- |
| `success` | It happened.                                            | `Check`         |
| `refusal` | It did not happen, and nothing is broken — here is why. | `TriangleAlert` |
| `error`   | It did not happen and something is wrong.               | `CircleAlert`   |

- All three are `role="status"`, overriding the `role="alert"` `Alert` hardcodes: an answer to a
  button somebody pressed is not an alarm. `Confirmation` is the `success` alias.
- **The tier comes from the typed `DomainErrorCode`** via `tierOf()` in `src/app/notice-tier.ts` —
  never from the German sentence, which is the thing most likely to be reworded. That file is an
  exhaustive `Record`, not a `switch` with a default, so a new domain error fails the build until
  somebody decides what it means. For an untyped Zod failure the rule is: _did a staff member type
  the bad value?_ A visible field is a refusal; a malformed hidden field is an error.
- **The notice renders beside its own button**, in the viewport, never as a floating toast.
- **A screen with several write controls shows one answer at a time.** Wrap it in `NoticeBoard` and
  have each control call `useNoticeSlot(id, answer)` — passing the action state object, not a
  boolean.
- **A control that its own write destroys cannot hold its confirmation.** Hand the message to a
  parent that survives, or redirect with a flag the page reads. A `redirect` to the URL the browser
  is already on moves no scroll, so the flag is what makes the navigation real. Flag constants live
  in a module with no directive — a `"use server"` module may export nothing but async functions.
- **A form action clears every uncontrolled field it owns**, on refusal as well as success. Decide by
  **outcome, not by field**: _a save clears everything, a refusal keeps everything._ Three ways,
  cheapest first:

  | The form already…            | Then                                                                  |
  | ---------------------------- | --------------------------------------------------------------------- |
  | remounts on a save (a `key`) | make the fields controlled — the remount clears them                  |
  | unmounts on a save           | the same, and nothing has to clear them                               |
  | must show stored values back | carry the submission on the action state; `state.values?.x ?? stored` |

  Hand values back **raw, exactly as typed, never parsed**: the value the domain could not read is
  precisely the one that has to be seen to be fixed.

- **Controlled is not enough for a radio or a checkbox.** React keeps a controlled input's
  `defaultValue` attribute in step with its value and does **not** do the same for `defaultChecked`,
  so the reset restores the dot from the attribute the _server_ rendered while the unchanged
  `checked` prop makes React repaint nothing — the control rewinds and the state it is meant to show
  does not. Keep the default equal to the state on the input itself, which makes the reset a no-op:

  ```tsx
  ref={(node) => {
    if (node !== null) {
      node.defaultChecked = option === chosen;
    }
  }}
  ```

  Passing `checked` and `defaultChecked` together instead is a React warning, not a fix. No gate sees
  this one: it is a browser check or nothing.

- Mark a rejected field by the input's **`name`**, carried on the action state — never by
  string-matching the message. Reddened label, `aria-invalid`, `aria-describedby`, and a short
  `text-sm text-destructive` line under the control, alongside the form-level `Notice`. A refusal
  that names **no** field carries none, and marks nothing: a quota below the active customer count is
  a collision between two numbers, and marking one of them would call a value malformed that is only
  too small.
  - **The mechanism is `src/app/field-refusal.ts` and `src/app/field-mark.tsx`** — `FieldRefusal`,
    `marking()`, `problemAt()`, `summarise()`, `FieldRejection` and `useFocusFirstRefusal`. Do not
    write a second one. It existed twice, in two shapes, and that is precisely why three further
    screens shipped with no marks at all: there was nothing to reuse and nowhere obvious to look.
  - **Report every field the schema refused, not the first.** A form with a day per household
    member fails in three places at once, and one round trip per field is how an intake takes five
    submissions. A _domain_ refusal still names at most one, because a use case stops at the first
    rule broken — that asymmetry is honest, not a gap.
  - **The summary names the fields; the marks carry the problems.** Never the other way round: on a
    screen with three money boxes, „Kein gültiger Betrag." by the button names none of them, while
    the mark that knows which box it sits under would be saying nothing worth reading.
  - **Put the cursor in the first field named.** The summary is by the button and the field may be
    the whole form above it — 442px on `/einstellungen`, 1 600px on the registration, measured.
- **A write revalidates every screen that counts what it changed** — `revalidatePath` per screen,
  before the `redirect`, with a comment naming what on that screen moved. A `redirect` is a
  navigation, not a revalidation: it says nothing about the hub two clicks away whose badge is now
  wrong. The other half of the rule is that the list stays honest — when a screen stops counting
  something, the write that changed it drops the call in the same commit, or the comment beside it
  becomes the sentence the next reader copies.
- Server action shape: `"use server"` actions in `*-actions.ts`, the state as a discriminated union
  (`idle | <success> | error` with a `tier`) in a sibling `*-state.ts`, the form a plain
  `<form action={…}>` with `useActionState`. Actions validate with Zod, call **one** use case, and
  hold no rules.

## 8. Text

- **German only from `src/i18n/de.ts`.** A new card title is a new key there, never a literal.
  Identifiers stay English.
- **A screen explains itself by what it shows; a paragraph saying so is not text, it is clutter.**
  Before writing a hint, an intro or a card description, ask the one question: _what does this say
  that the screen does not already show?_ „Berechnet aus den Geburtsdaten — nicht eingebbar“ under
  two figures that have no input beside them, „gilt sofort“ under a save button, a confirmation
  reciting that a replaced card is invalid — each answers **nothing**. Four people use this weekly
  and they are handed `docs/handout/`; they do not read the screen to find out what the software
  does. Text earns its place by naming something **invisible**:
  - a side effect — „Erinnerungen werden dabei auf 0 zurückgesetzt“
  - a one-way door — „Rückgängig machen lässt sich die Archivierung nicht“
  - a window that closes — „Korrekturen sind nur am selben Tag möglich“
  - what an **empty** field means — „Leer lassen: kein Maximalpreis“
  - an example that makes a free-text box answerable — „z. B. über die Nachbarin, dienstags
    vormittags“
  - a rule the missing control would otherwise raise — „Die Liste lässt sich nicht umsortieren“

  This has now been cut back five times, and it grows back every time, because each sentence is
  reasonable **on its own** — it is only redundant next to the thing it sits under. So the test is
  never „is this true?“ but „where else does this screen already say it?“ Where the answer is
  „nowhere“, keep it and keep it to one sentence.

- Enum values become records keyed by the enum literal (`groups: { RED: "Rot", BLUE: "Blau" }`) so a
  screen writes `de.customers.groups[row.group]` with no mapping code.
- Parameterised strings are typed arrow functions. Pluralisation is written per string.
- **Every write control gets the trio**: action label, in-flight label, confirmation
  (`submit` / `submitting` / `saved`). Destructive ones add `confirm` and `reasonLabel`. A
  `reasonHint` only where it carries an example (`waitingList.remove`) or names where the words end
  up (`settings` — „im Änderungsprotokoll festgehalten“); the block and the archive have none,
  because „bitte verständlich schreiben“ is advice, not information.
- **A confirmation names the figures that are about to change and stops.** „Karte 7k1 wird ungültig.
  Neue Karte: 7k2.“ — not the rule about superseded cards. One that recites the rules is one that
  gets clicked past unread, which is the opposite of what a confirmation is for.
- Errors live in a per-section `errors` object keyed by cause, ending with `unknown`.
- Where two screens state the same fact, write one key in terms of the other. Two phrasings of one
  number is how two screens come to disagree.
- Number and date **shapes** come from `src/i18n/format.ts` (dates in UTC, times in Europe/Berlin) and
  `src/domain/money.ts`. Never format inline.
- **An amount that runs two ways is written with a sign, never with a direction word.** „+2,00 €“ and
  „−2,00 €“, through `signedAmount` in `src/i18n/de.ts` — not „Guthaben 2,00 €“, not „2,00 € offen“.
  A sign scans down a column of figures where a trailing word does not, and it is one glyph at the
  distance a counter is read from. The glyph is U+2212, not a hyphen. The **zero case stays a word**
  — „ausgeglichen“, „genau“ — because a signed zero reads as an amount that happens to be nothing
  rather than as the state of being in neither direction. Two quantities are written this way today,
  the customer balance and a payment's standing; a third joins them rather than inventing a third
  vocabulary.
- Hints are siblings with `aria-describedby`, never `<span>`s inside the label — nested, they are
  concatenated into the accessible name.
- **A long label is a dictionary problem, not a layout one.** Shorter true words, not a wider box.
- Removing a column or a control deletes its keys in the same commit.

## 9. Accessibility

- **A `Card` is not a section and `CardTitle` is not a heading.** `querySelectorAll('h1,h2,h3')` must
  list every section title on the screen.
- **A label and its value stay in one node** — one `<p>`, or a real `<table>` with `<th scope="row">`.
  Two stacked `div`s leave a screen reader reading them as unrelated facts.
- Every input keeps a real accessible name. In a table of repeated fields the column heading names
  the column, not the cell — put the full name on the input as `aria-label`.
- `<label htmlFor>` + `<Input id>`, never a nested `<label><control/></label>`. Generate the id with
  `useId()` unless a spec reaches the field by CSS id, in which case the id is load-bearing.
- Submit buttons keep distinct accessible names.
- Colour never carries a meaning on its own — the active nav item is marked three ways (rule, tint,
  weight) for the same reason the word always accompanies the chrome (§5).
- `Label` and `Dialog` are `"use client"`. In a server-rendered form with no interactivity, a plain
  `<label htmlFor>` styled `text-sm font-medium` is the better trade.
- A constant shared across the server/client boundary belongs in a module with **no** directive: a
  string exported from a `"use client"` module arrives as a client-reference proxy, renders nonsense
  into the attribute, and throws nothing.

## 10. What a restyle may not move

The unit suite covers `src/domain` and `src/application` only, so `src/app/` changes are invisible to
it. Playwright is the only thing that will tell you.

- **Every `data-testid` stays on the element whose text content it had** — on the **value**, never
  the label. Assertions are exact `toHaveText`; a testid must never come to contain its own label.
- **`data-*` state attributes and load-bearing classes travel with their element** — `data-verdict`,
  `data-tier`, `whitespace-pre-line`.
- **`-error` in a testid means _the answer was no_, not _the red tier_.** A refusal wears
  `<feature>-error` in both tiers and the tier rides on `data-tier` on the same locator.
- Keep `<main>`, the `<h1>`, and every id JS or a spec reaches by.
- `getByLabel` must keep working; the nav's four labels and `aria-current="page"` are a contract.
- Several specs assert `toHaveCount(0)`, not `toBeDisabled()`.
- A sweep asserting `Kundennummer: 1` owns its separator — tidying `Feld: Wert` into `Feld Wert`
  turns it red with a failure that names no testid.
- Folding a control a spec fills or checks costs spec edits: give the `<summary>` its own testid and
  have the spec click it **for real**, never `evaluate(d => d.open = true)`.

## 11. Doing the work

- **A restyle touches JSX structure and `className` only**, and its proof is the e2e suite passing
  untouched. Changing what a screen _says_ is a second commit; anything needing a spec edited is a
  third and wants its own argument.
- **Drive every screen with the `playwright-cli` skill** — building it and reviewing it, not only
  when asked to test one. Not a substitute for the e2e suite: the suite proves the contracts hold,
  `playwright-cli` is how you find out whether the screen is any good.

  ```bash
  pkill -f next-server; npm run build && npm run start -- --port 3100 &
  playwright-cli open http://127.0.0.1:3100/<route>
  playwright-cli snapshot     # read this, not just the screenshot
  playwright-cli console      # must be 0 errors
  ```

  > `next start` serves the build it booted with, and a leftover server will answer on the port with
  > the old screen. Kill and restart after every build, and prove which build you are looking at
  > before measuring anything.

- **Never end the pass on a fresh load.** After the write you came to look at, make a **second write
  from a neighbouring form** and read the first panel again — without reloading. A reload reseeds
  every client component from the server, which is exactly what hides a panel that has stopped
  following the record (§6, state seeded from a server prop). One save then one look is the whole
  difference between a review that finds this and one that does not; it is how the household table
  came to be shipped showing a name the record had already corrected.
- What to check beyond "it looks right": every section title is a `heading` and every field a named
  `textbox` in the snapshot; the writes are **exercised**, not only rendered; the viewport still holds
  the confirmation after the click (measure the button's own rect either side, not just
  `window.scrollY`); `documentElement.scrollWidth - clientWidth` is `0` at ~1440, ~800, ~390 and at
  both sides of any breakpoint introduced; and the thing that matters still dominates.
- **Look at the narrow side of every breakpoint, not only the design width.** Both e2e devices are
  1280×720, which is exactly the `xl` breakpoint, so the suite only ever sees the wide side of it —
  and DF do not work maximised, Safari remembers a page zoom per site, and a scrollbar takes its width
  out of what a media query is answered against. A rule that only holds at 1280 holds for nobody. Ask
  `getComputedStyle` what the breakpoint actually changed, then hit-test the first row beneath any
  sticky element (§3).
- Driving real flows writes to `data/fd.db`. That is fine — say so, and `npm run db:demo -- --reset`
  puts the demo register back.
- **Done is** `npm run lint && npm run typecheck && npm run test:coverage && npm run build`, then
  `npm run test:e2e` **and** `npm run test:e2e:webkit` with no test edited, then the `playwright-cli`
  pass above.
- **A day is typed, never picked.** Every calendar day uses `DateInput` (`components/ui/date-input.tsx`)
  with the placeholder from `de.day.placeholder` — never `<input type="date">`. The native control
  lets the _operating system_ decide which segment is typed first and, in Chromium, silently clamps
  an impossible month into a valid one; both reached DF before
  [ADR-013](../architecture/adr/013-type-calendar-days-as-tt-mm-jjjj-instead-of-using-the-native-date-input.md).
  When you drive a date in a spec, **type it** (`pressSequentially`) at least once: `fill()` assigns
  the value and proves nothing about entry.
- **And one look in real Safari, on a Mac.** DF run the application in Safari
  ([ADR-012](../architecture/adr/012-support-safari-and-chromium-based-browsers-and-gate-both-in-ci.md)),
  and the WebKit gate is not the same thing: Playwright ships the engine without Apple's shell, so
  the macOS `<input type="date">` picker — the most common field in this application — is not
  something CI can see. Open the screen you built in Safari and use its date fields before calling it
  done. An engine-conditional branch in `src/` is not the answer to what you find there; if the two
  disagree, the markup is usually the thing that is wrong.

**One standing exception.** `/kunden/[id]/karte` is the single screen not converted to the primitives.
Its outsized type is US-02.4's "legible across a desk", not a style choice — do not normalise it.
