# Redesigning "Einstellungen" (`/einstellungen`)

A UX analysis of the settings screen as it stands today, and a concept for rebuilding it on the
shadcn/ui primitives — one of the last three screens in the conversion
`docs/ui_conversion_guide.md` describes.

**Status:** **§8 step 1 is built** — the conversion. The measurements in §3 are the "before", and
§8 carries the "after" against each of them. Steps 2–4 are open; §3.1 is untouched and is the one
worth the most.

The screen has one property none of the others has: **it is the only place in the application where
FD can change what the software believes.** CLAUDE.md's "policy values are data, not constants" is
enforced here or nowhere. That raises the cost of every defect below, because a settings screen that
loses an edit is a settings screen people stop trusting, and the fallback is a developer.

---

## 1. How this was examined

Driven through `playwright-cli` against a production build (`npm run build && npm run start --
--port 3100`) on the demo register, at 1440×900, 800×900 and 390×844. Both states were driven: the
normal screen, and the `NoSettingsInForce` screen — reached by pinning the clock to 2020-01-01
through `FD_FIXED_NOW_FILE`, the seam `src/infrastructure/clock.ts` carries for exactly this. Three
saves were made — one accepted, two rejected — and the field values were read back **after** each,
which is where §3.1 came from. The accessibility snapshot was read alongside the screenshots.
Numbers below are measured off the live DOM. `npm run db:demo -- --reset` restored the register
afterwards.

Console: **0 errors, 0 warnings.** Horizontal page overflow: **0 at all three widths.**

---

## 2. What this screen is for

US-14.4: _"edit the quota, portions, prices and week-cycle settings in the app so FD can adapt
without calling a developer."_ Eight values, changed rarely — a price rise, a new distribution day,
a quota adjustment — by one of four people who will not have done it for months.

| #   | Job                                              | Frequency                       | What the screen has to make safe       |
| --- | ------------------------------------------------ | ------------------------------- | -------------------------------------- |
| A   | **Change one value and save it**                 | A few times a year              | Finding the field; not losing the edit |
| B   | **Check what is in force right now**             | Whenever a figure is questioned | Reading eight values at a glance       |
| C   | **See when something last changed, and to what** | Rare, and after an argument     | The history, diffable                  |
| D   | **Recover from a rejected save**                 | Whenever A goes wrong           | The error, next to the field it names  |

A is the screen. The current design serves B adequately, serves A badly (§3.1, §3.2), and does not
really serve C at all (§3.6).

Two properties of the domain shape everything: **a change applies immediately** — there is no
effective-from field and there must not be one (US-14.4, and `settings.spec.ts` asserts
`#effectiveFrom` `toHaveCount(0)`) — and **superseded versions are kept forever** (FR-1). So every
save is both an edit and an append, and the screen has to make both legible.

---

## 3. Findings

### 3.1 A rejected save discards every edit, including the valid ones

The worst defect on the screen, and it is invisible in a screenshot.

Measured: four fields were changed — `quotaN` → `0` (invalid), `pricePerGrownUp` → `3,33`,
`portionsPerChild` → `7`, `reason` → `Testlauf`. The save was rejected. Read back immediately after:

| Field              | Typed      | On screen after the rejection |
| ------------------ | ---------- | ----------------------------- |
| `quotaN`           | `0`        | **`240`**                     |
| `pricePerGrownUp`  | `3,33`     | **`2,10`**                    |
| `portionsPerChild` | `7`        | **`1`**                       |
| `reason`           | `Testlauf` | **`""`**                      |

**Four edits made, one invalid, four lost.** The screen then displays
`Ungültiger Wert im Feld „Höchstzahl der Kundinnen und Kunden (N)"` — an error about a value that is
no longer anywhere on screen. There is nothing to correct, because there is nothing left; the whole
change has to be retyped from memory.

The mechanism is the one the conversion guide records from `/kunden/neu`: React resets an
uncontrolled form once its action resolves, and every field here is
`<input defaultValue={…}>`. The guide's rule is that this must be a **per-field decision**:

> Whenever a form submits through an action, decide deliberately for each field whether the
> post-action reset is wanted — and check it in `playwright-cli` by reading `input.value` after the
> submit, not by looking at the page.

Here it is wanted for exactly one field out of nine. **`reason` should clear** — it describes one
change and must not be carried into the next; a successful save clears it correctly today, and that
is right. The other eight should keep what was typed when the save is rejected, and take the newly
stored values when it succeeds. Today all nine behave the same way in both cases.

A second probe made the same point on a different field: typing `2026-W2` into `Ankerwoche`
(a plausible mistake — the real format is `2026-W02`) produces
`Ungültiger Wert im Feld „Ankerwoche (ISO, z. B. 2026-W02)"` and puts `2026-W02` back in the box. The
error and the field now contradict each other, and there is no way to see what was wrong with what
was typed.

### 3.2 The error names a field 454px above it, and marks nothing

Measured on the rejected-quota path: `#quotaN` is at `y=272`; `[data-testid=settings-error]` is at
`y=760`. **454px between the field and the message about it**, with seven other fields in between.
The field carries no `aria-invalid`, no changed border, no marker of any kind — its computed
`border-color` is identical to every other field's.

So the message has to name the field in words, and it does:
`Ungültiger Wert im Feld „Höchstzahl der Kundinnen und Kunden (N)"`. That is 39 characters of German
label used as a pointer, on a screen where the label is also printed 454px higher. The dictionary
even carries a whole parallel table for it — `de.settings.errorFields`, keyed by the `field` values
`InvalidSettings` throws — which exists solely because the error is too far from the field to point
at it.

The same shape as the record's block reason sitting 2 602px below the status it explained
(`docs/ui_redesign_kunden_record.md`), and it wants the same answer.

### 3.3 Nine fields, one width

Measured `input`/`select` widths, all nine, at each breakpoint:

| Width | Every field |
| ----- | ----------- |
| 1440  | **408px**   |
| 800   | **360px**   |
| 390   | **326px**   |

`portionsPerChild` holds `1`. `quotaN` holds `240`. `pricePerGrownUp` holds `2,00`.
`weekAnchorIsoWeek` holds `2026-W02`. All four are 408px at 1440, because all nine live in one
`sm:grid-cols-2` and the grid is `408px 408px`.

The conversion guide's finding from `/kunden/neu` applies verbatim:

> A field's width is the most reliable hint a form has about what it wants, and a form where every
> field is the same width makes the same promise about all of them.

It matters more here than there, because these fields are typed into once a year by someone who has
forgotten what goes in them. A 408px box invites a sentence.

### 3.4 Three control heights in one form

Measured: `<input>` 34px, `<select>` 32px, the submit button 40px. Three heights, side by side in
the same grid — `Gruppe der Ankerwoche` (32) sits directly below `Portionen je Kind` (34), and the
two selects in row 3 are 2px shorter than the four inputs above them. It is the `/kunden` filter-row
finding again:

> Give every control in a filter row the same height — three heights in one row reads as a ragged
> baseline, and it is the first thing that makes a form look unfinished.

### 3.5 One grid interleaves two unrelated policy domains

The eight settings are two subjects that have nothing to do with each other:

- **What a household gets** — quota `N`, portions per grown-up, portions per child, price per
  grown-up, price per child.
- **When distribution happens** — anchor week, anchor colour, distribution weekday.

The screen groups them as `Aktuell gültige Werte` (quota + portions + **all three calendar
settings**) and `Preise`. Because the first section is one `sm:grid-cols-2` flowing in source order,
the two subjects do not merely share a section — **the grid pairs them row by row**:

| Row | Column 1                                | Column 2                             |
| --- | --------------------------------------- | ------------------------------------ |
| 1   | Höchstzahl der Kundinnen und Kunden (N) | Portionen je Erwachsenem             |
| 2   | **Portionen je Kind**                   | **Ankerwoche (ISO, z. B. 2026-W02)** |
| 3   | **Gruppe der Ankerwoche**               | **Ausgabetag**                       |

Row 2 is a portions rule beside a calendar rule. A reader scanning for "when is the Ausgabe" has to
read past two portions fields to find it, and a reader scanning for the prices finds three of the
five money-and-portions settings in one section and two in another.

The heading over it does not help: **`Aktuell gültige Werte` describes everything on the screen**,
including the two fields under `Preise`, so it distinguishes nothing.

### 3.6 The history repeats 150 characters per version so that one of them can change

Two consecutive versions, after saving a price change of 10 cents, read verbatim:

```
Geändert am 01.08.2026 — aktuell gültig
Höchstzahl der Kundinnen und Kunden (N): 240 · Portionen je Erwachsenem: 2 · Portionen je Kind: 1
Preis je Erwachsenem: 2,10 € · Preis je Kind: 1,00 €

Geändert am 01.01.2026
Höchstzahl der Kundinnen und Kunden (N): 240 · Portionen je Erwachsenem: 2 · Portionen je Kind: 1
Preis je Erwachsenem: 2,00 € · Preis je Kind: 1,00 €
```

Measured: the payload is **150 characters** and the two rows differ at **exactly one character
index, 122**. The rows are 86px apart, and the reader has to compare **five `Feld: Wert` pairs**
across a wrapped run-on string to find which one moved. That is job C, and the format is the worst
possible one for it — a table of five columns would put the change in a column, at a glance.

Three further problems in the same list:

- **Three of the eight settings never appear.** `weekAnchor.isoWeek`, `weekAnchor.colour` and
  `distributionWeekday` are not printed. So a change to the Ausgabetag — the setting with the most
  visible downstream effect, since the Start dashboard and `/ausgabe` both read it — produces a new
  history row **identical to its predecessor in every character**. The record says something changed
  and refuses to say what.
- **The reason is collected and never shown.** The form has an optional `Grund der Änderung`, hinted
  as _"Wird, falls angegeben, im Änderungsprotokoll festgehalten"_. `SettingsVersion` is
  `{ recordedAt, settings }` — no reason — so it goes to the audit log (FR-8), and the audit log has
  no screen. A reader of the history therefore sees _what_ and _when_ and can never see _why_, on a
  screen whose own intro promises that earlier versions are kept "damit vergangene Ausgaben
  nachvollziehbar bleiben".
- **`— aktuell gültig` is the least prominent thing on the row.** It is a muted em-dash suffix at
  14px, the same size as everything else, and it is the single most important attribute a history
  row has.

The PRD's bar is low here and the screen clears it: US-14.4 asks only that _"the page lists previous
versions with the date each was recorded, read-only"_. Everything above is the gap between clearing
that bar and doing job C.

### 3.7 The reason field's accessible name is a whole sentence

From the snapshot:

```yaml
- textbox "Grund der Änderung (optional) Wird, falls angegeben, im Änderungsprotokoll festgehalten."
```

The hint `<span>` is nested inside the `<label>`, so it is concatenated into the field's accessible
name. A screen reader announces a 91-character sentence where the name should be four words, and
`getByLabel("Grund der Änderung (optional)", { exact: true })` does not resolve. Nothing catches it:
`settings.spec.ts` reaches this field by `#reason`.

All nine labels are the nested `<label><span>…</span><input/></label>` shape — no `htmlFor`, no
`id` binding — which the guide flags as working "only by nesting" and fragile the moment a control
moves. Two of them are load-bearing: `settings.spec.ts` uses
`getByLabel(de.settings.fields.pricePerGrownUp, { exact: true })` four times.

### 3.8 The section holding the save button has no heading

Headings on the page: `h1 Einstellungen`, `h2 Aktuell gültige Werte`, `h2 Preise`,
`h2 Änderungsverlauf`. The third `<section>` in the form — the one holding the reason field, the
notice and the submit button — has none. It is the section where the screen's only write happens,
and in the accessibility tree it is an unnamed `generic` between two named ones.

### 3.9 The empty state is a dead end that three screens link to

Driven with the clock pinned before the seeded version. `/einstellungen` renders:

```yaml
- heading "Einstellungen" [level=1]
- paragraph: Es sind noch keine Einstellungen hinterlegt. Bitte die Grundeinstellungen einspielen.
```

Measured on that page: **0 forms, 0 inputs, 0 links, 0 buttons.** The form is not rendered at all —
`readCurrentSettings` throws `NoSettingsInForce` and the page returns early, before `<SettingsForm>`.

And the instruction names an action the screen cannot perform. "Bitte die Grundeinstellungen
einspielen" can only be done by running the seed script from a terminal.

This matters more than a rare edge case, because **three screens send staff here when nothing is
configured**, all through `de.home.settingsLink`:

| Screen      | Where                  |
| ----------- | ---------------------- |
| `/` (Start) | `src/app/page.tsx:77`  |
| `/ausgabe`  | `ausgabe/page.tsx:265` |
| `/kunden`   | `kunden/page.tsx:523`  |

So on a fresh database the whole application funnels into a screen with nothing on it. FR-7 mitigates
this in practice — "a fresh database must seed one provisional version" — but the seed is what makes
the state rare, not what makes the screen right, and US-17.3 explicitly requires the dashboard to
degrade to a link that leads somewhere.

### 3.10 The record of a save lands below the fold

After a successful save at 1440×900, measured: the confirmation renders at `y=534`, and the **new
history entry at `y=930`** in a 900px viewport. The screen says "Gespeichert. Die neuen Werte gelten
ab sofort." and the only evidence — the version row that proves the append happened — is off-screen.
Page `scrollHeight` goes 1068 → 1126.

### 3.11 The shell is 128px inside the bar above it

`<main>` is `x=272, w=896` (`max-w-4xl`); the nav's list is `x=144, w=1152`. The exact step
`src/app/shell.ts` was extracted to remove, recorded there from `/kunden/neu` and `/kunden/[id]`.

---

## 4. The concept

### 4.1 Principle

> **A rare edit by someone who has forgotten the screen.** Group the fields by the decision they
> belong to, size each field to what goes in it, put the error where the mistake is, and never throw
> away what somebody typed.

### 4.2 Proposed structure

```
┌─ Nav (existing, sticky, h-12) ───────────────────────────────────────────────┐

  h1  Einstellungen                                                             ← header row
  Änderungen gelten sofort. …                                    ← one line, kept

  ┌─ Card: Mengen und Preise ────────────────────────────────────────────────┐
  │  h2 Mengen und Preise                                                    │
  │  ┌──────┐   ┌────┐  ┌────┐        ┌──────┐  ┌──────┐                     │
  │  │ N    │   │Erw.│  │Kind│        │ 2,00 │  │ 1,00 │                      │
  │  │ 240  │   │ 2  │  │ 1  │        │  €   │  │  €   │                      │
  │  └──────┘   └────┘  └────┘        └──────┘  └──────┘                     │
  │  Höchstzahl  Portionen je …        Preis je Erwachsenem / je Kind        │
  │  Der Preis wird je Kopf berechnet. …                                     │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌─ Card: Ausgaberhythmus ──────────────────────────────────────────────────┐
  │  h2 Ausgaberhythmus                                                      │
  │  ┌──────────┐  ┌────────┐  ┌────────────┐                                │
  │  │ 2026-W02 │  │  Rot   │  │ Donnerstag │                                │
  │  └──────────┘  └────────┘  └────────────┘                                │
  │  Ankerwoche    Gruppe       Ausgabetag                                   │
  │  Nächste Ausgabe: Donnerstag, 6. August 2026 – Gruppe Rot.   ← see §4.4   │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌─ Card: Änderung speichern ───────────────────────────────────────────────┐
  │  h2 Änderung speichern                                                   │
  │  Grund der Änderung (optional)  [────────────────────────]               │
  │  Wird, falls angegeben, im Änderungsprotokoll festgehalten.              │
  │  [ Speichern ]        ⓘ Gespeichert. Die neuen Werte gelten ab sofort.   │
  └──────────────────────────────────────────────────────────────────────────┘

  ┌─ Card: Änderungsverlauf ─────────────────────────────────────────────────┐
  │  h2 Änderungsverlauf                                        2 Fassungen  │
  │  Geändert am │ N   │ P/Erw │ P/Kind │ €/Erw  │ €/Kind │ Woche  │ Tag     │
  │  01.08.2026 ●│ 240 │  2    │   1    │ 2,10 € │ 1,00 € │ W02 Rot│ Do      │
  │  01.01.2026  │ 240 │  2    │   1    │ 2,00 € │ 1,00 € │ W02 Rot│ Do      │
  └──────────────────────────────────────────────────────────────────────────┘
```

Six decisions carry this.

**(a) Two cards, by decision, not by "values" and "prices".** `Mengen und Preise` holds the five
settings that decide what a household gets; `Ausgaberhythmus` holds the three that decide when.
`Aktuell gültige Werte` disappears as a heading — it described the whole screen (§3.5). This also
puts the two price fields back with the three portion/quota fields they are computed alongside,
which is what `describeAllowance` actually does with them.

**(b) A 12-column grid, spent.** Per the guide's `/kunden/neu` finding: 2 columns for a portions
count, 2 for the quota, 3 for a euro amount, 3 for the anchor week, 3 for a select. The card takes
the shell's width; the field grid inside it does not. A 408px box for a single digit is the clearest
possible signal that nobody thought about that field.

**(c) The error goes to the field.** `saveSettings` already returns a typed `InvalidSettings` naming
the field — `de.settings.errorFields` is keyed by exactly those names. Render the message under the
input, set `aria-invalid` on it, and keep the summary notice by the button for the errors that name
no field (the quota-below-active-count rule names two numbers, not one field). That deletes 454px of
travel and makes `errorFields` do the job it was built for instead of substituting for proximity.

**(d) A rejected save keeps what was typed.** `SaveSettingsState` grows the submitted values, and
each field's `defaultValue` becomes `state.values?.x ?? settings.x`. On success the state carries no
values, the server component has already revalidated, and the reset lands on the newly stored
figures — which is what happens today and is correct. `reason` keeps clearing in both cases.

> ⚠️ This changes `save-settings-state.ts` and the action's return shape. It is the highest-value
> item in this document and it is **not** a restyle — §8 gives it its own commit.

**(e) The history becomes a table, one column per setting.** Eight columns and a date. A change is
then a column whose value differs from the row below it, found by eye in one pass instead of by
diffing 150 characters (§3.6). All eight settings appear, so an Ausgabetag change stops being
invisible. `aktuell gültig` becomes a `Badge` on the in-force row rather than a muted suffix.

At two versions this is over-engineering; at twenty — which is where FD will be in a decade, since
FR-1 keeps every version forever — it is the difference between a record and a pile. The table is
also the shape that lets a future "was hat sich geändert?" highlight be a `className` on one cell.

**(f) The empty state gets the form.** Instead of returning early, render the form with the
provisional defaults the seed would have written and a notice saying nothing is in force yet.
Saving it becomes the first version. That turns §3.9's dead end into the one screen in the
application that can bootstrap it — which is what three other screens already promise when they
link here.

### 4.3 Field sizing, concretely

| Field                 | Content      | Columns (of 12) | Notes                               |
| --------------------- | ------------ | --------------- | ----------------------------------- |
| `quotaN`              | `240`        | 2               | `tabular-nums`, `type=number`       |
| `portionsPerGrownUp`  | `2`          | 2               |                                     |
| `portionsPerChild`    | `1`          | 2               |                                     |
| `pricePerGrownUp`     | `2,00`       | 3               | stays `type=text inputMode=decimal` |
| `pricePerChild`       | `1,00`       | 3               | ditto                               |
| `weekAnchorIsoWeek`   | `2026-W02`   | 3               | see §11.3                           |
| `weekAnchorColour`    | `Rot`/`Blau` | 3               | native `<select>`, tokens per §5    |
| `distributionWeekday` | `Donnerstag` | 3               | native `<select>`                   |
| `reason`              | free text    | 12              | a sentence gets a sentence's width  |

One height for all of them — the guide's `FILTER_SELECT` recipe from `kunden/page.tsx` gives the
native selects the same `h-9` and the same focus ring as `Input`, which fixes §3.4 in one constant.

### 4.4 One thing worth adding, and one worth resisting

**Worth adding:** the `Ausgaberhythmus` card should state the consequence of its three fields —
"Nächste Ausgabe: Donnerstag, 6. August 2026 – Gruppe Rot." Anchor week, anchor colour and weekday
are three abstractions whose combined effect nobody can compute in their head, and the whole point
of editing them is the sentence on the Start dashboard. `getWeekColour` already produces exactly
that string; the card can render today's, so a reader can at least check the current setting is
right before changing it. (A live preview of the _pending_ change would need client state and is not
worth it — see §11.4.)

**Worth resisting:** confirmations, "are you sure", and undo. A settings change applies immediately
and every version is kept forever; the recovery from a wrong save is another save, which takes ten
seconds. A confirm step on a screen used four times a year is a control nobody will remember.

### 4.5 What must not change, and why

- **No effective-from field.** US-14.4, and `settings.spec.ts` asserts `#effectiveFrom`
  `toHaveCount(0)`. A change applies at once; dating it is a whole feature FD did not ask for.
- **Two saves on the same day both apply.** The spec drives it. Nothing may debounce, dedupe or
  refuse a second save.
- **The reason stays optional and stays labelled as optional.** US-14.4.
- **Prices stay euro text fields, not `type=number`.** German decimal commas; `type=number` refuses
  `2,50` in a de-DE browser and normalises to a dot in others. The conversion is `formatEuroAmount`
  out and whole cents in (CLAUDE.md: money is integer cents).
- **The three `<select>`s stay native.** Same reason as `/kunden`: Radix's `Select` is a `<button>`
  plus a portalled listbox, and `selectOption`/`toHaveValue` do not work against it. Style the
  native element.
- **Versions stay newest-first and read-only**, with the in-force one identified by
  `versions.find(v => v.recordedAt <= now)` — the same rule `resolveSettingsAt` applies, not "the
  first row". The comment in `page.tsx:31` explains why, and it is right: a future-stamped row from a
  clock skew must not make the label contradict the form.
- **`export const dynamic = "force-dynamic"` stays.**
- **The German error must never quote an English identifier.** `de.settings.errorFields` exists for
  that and stays even after §4.2c moves the message next to the field — an error with no field name
  still needs one for the summary.

---

## 5. Mapping to shadcn/ui

Everything needed is **already installed**.

| Element today                                          | Becomes                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `<main className="… max-w-4xl … p-8">`                 | `<main className={SHELL}>` (§3.11)                                                               |
| `<section>` + `<h2>`                                   | `Card` / `CardHeader` / `CardTitle` / `CardContent`, **with a real `<h2>` inside `CardTitle`**   |
| the unnamed third section                              | `Card` with a heading of its own (§3.8)                                                          |
| `fieldClass` (`rounded border border-foreground/20 …`) | `<Input>` for the six text/number fields                                                         |
| `<select className={fieldClass}>`                      | **stays native**, styled with the `FILTER_SELECT` recipe from `kunden/page.tsx`                  |
| nested `<label><span>…</span><input/></label>`         | `<label htmlFor>` + `<input id>`; ids from `useId` **except** the four a spec reaches by CSS id  |
| the hint `<span>` inside the reason label              | a sibling `<p id>` referenced by `aria-describedby` — fixes §3.7                                 |
| `<p role="status">` success / error                    | `<Alert role="status">` and `<Alert variant="destructive" role="status">`                        |
| `<button className="rounded bg-foreground …">`         | `<Button type="submit" disabled={pending}>`                                                      |
| `VersionHistory` `<ul>`/`<li>`                         | `Table` / `TableHeader` / `TableRow` / `TableHead` / `TableCell`, `<th scope="row">` on the date |
| `— aktuell gültig`                                     | `<Badge variant="secondary">` on the in-force row                                                |
| the version count                                      | `<Badge variant="secondary">` in `CardAction`                                                    |
| `text-foreground/60,/70`, `border-foreground/15,/20`   | `text-muted-foreground`, `border-border` / nothing                                               |
| `border-green-600/40 bg-green-600/10`                  | `<Alert>` default; see §6                                                                        |

**`Label` is `"use client"`, and `settings-form.tsx` already is** — so unlike the server-rendered
screens, importing `Label` here costs nothing. Worth using: it is what makes `htmlFor`/`id` the
default rather than a thing to remember.

**Do not reach for:** `Select` (§4.5), `Tabs` to split the two cards (they are read together, and a
tab hides half the settings from job B), `Dialog` for the save confirmation (§4.4), or a
`react-hook-form`-style client validation layer — the domain validates, the action reports, and
adding a second validator is two sources of truth for exactly the kind of rule CLAUDE.md keeps in
one place.

---

## 6. Colour, after

| Meaning                            | Treatment                                   | Why                                                      |
| ---------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| Saved                              | `Alert` default, `role="status"`            | Not an alarm; the neutral confirmation the pilot settled |
| Rejected                           | `Alert variant="destructive"` + the message | Soft tint, not solid red (guide)                         |
| The invalid field itself           | `aria-invalid` + `border-destructive`       | New — §4.2c; the mark is what makes the message findable |
| `aktuell gültig`                   | `Badge variant="secondary"`                 | A fact, not a warning                                    |
| Superseded versions                | no chrome at all                            | Most rows; chrome marks the exception (guide)            |
| `Gruppe der Ankerwoche` = Rot/Blau | **plain `<select>`, no tint**               | See below                                                |

**The anchor-group select must not be painted red or blue.** It is the one place on this screen the
group appears, and it is a _setting_, not a household's card — painting it would put a fourth
treatment of RED/BLUE into the application, on a screen where the colour is a value being chosen
rather than a fact being displayed. `accents.ts` reserves the tint for "wherever a screen names a
household's group"; a dropdown of two options is not that. The words `Rot` and `Blau` carry it, which
is what US-03.4 requires anyway.

No colour on this screen means anything except "this save succeeded" or "this save did not".

---

## 7. Constraints the implementation must not break

All derive from `tests/e2e/settings.spec.ts`, which must pass **with no test edited**.

1. **`getByLabel(de.settings.fields.pricePerGrownUp, { exact: true })` must resolve to the input**
   and `toHaveValue("2,00")` / `"2,50"` / `"2,75"`. `exact: true` means the accessible name must be
   the label and nothing else — so the §3.7 hint-inside-label mistake must not be repeated on the
   price fields when they move.
2. **`#quotaN`, `#reason`, `#pricePerGrownUp` and `#weekAnchorIsoWeek` keep those exact CSS ids.**
   The spec fills the first two by id. The guide's rule applies: where a spec reaches a field by CSS
   id the id is load-bearing and stays; elsewhere generate it with `useId`.
3. **`#effectiveFrom` must not exist** — `toHaveCount(0)`.
4. **`getByRole("button", { name: de.settings.save, exact: true })`** must stay the submit's
   accessible name. `exact: true`, so a `Speichern …` or an icon with a label breaks it.
5. **`settings-saved` and `settings-error` keep their exact messages** —
   `toHaveText(de.settings.saved)` and
   `toHaveText(de.settings.errors.invalidSettings(de.settings.fields.quotaN))`. Moving the error next
   to the field is fine only if **an element with `data-testid="settings-error"` still holds exactly
   that string**. Simplest: keep the summary notice with the testid, and render the per-field message
   as a second, untestid'd element. Two messages saying the same thing is not ideal — but it is what
   lets step (1) of §8 be a restyle, and the per-field one can be the terser of the two.
6. **`settings-version` stays one element per version, newest first**, `toHaveCount(3)` after the
   second save, `.first()` marked with `de.settings.history.current`, and each row `toContainText`
   `` `${de.settings.fields.pricePerGrownUp}: 2,50 €` `` — **including the label, the colon and the
   euro sign**. This is the `Feld: Wert` sweep trap from the record, and a table splitting label and
   value into a heading and a cell **breaks it**. Resolution: the table's `TableCell` for a price
   must still contain the whole `Preis je Erwachsenem: 2,50 €` string, or the spec must be edited
   deliberately — see §8, where the history table is a content change for exactly this reason.
7. **A rejected save must leave the stored value untouched**, proved by a reload asserting `2,75`.
   §4.2d changes what the _form_ shows after a rejection, never what was written.
8. **Every new German string goes in `src/i18n/de.ts`** — the two new card headings, the empty-state
   notice, and every history column header.
9. **`de.settings.errorFields` keys stay the `field` values `InvalidSettings` carries**, including
   the dotted `"weekAnchor.isoWeek"` and `"weekAnchor.colour"`.

---

## 8. Restyle vs. content change

| Change                                                         | Restyle? | Notes                                                                                                  |
| -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `SHELL`, `Card`, `Input`, `Button`, `Alert`, tokens            | ✅       | Pure conversion                                                                                        |
| Real `<h2>` in every `CardTitle`, incl. the unnamed section    | ✅       | Fixes §3.8; guide trap 1                                                                               |
| `htmlFor`/`id` instead of nesting; hint via `aria-describedby` | ✅       | Fixes §3.7; ids in §7.2 preserved                                                                      |
| The 12-column grid and per-field widths                        | ✅       | `className` only                                                                                       |
| One control height                                             | ✅       | `className` only                                                                                       |
| Regrouping into `Mengen und Preise` / `Ausgaberhythmus`        | ⚠️       | Structure, but the two headings are new dictionary keys                                                |
| `aria-invalid` + a border on the rejected field                | ✅       | Attribute and `className`; the summary notice is untouched                                             |
| **Keeping the typed values after a rejection**                 | ❌       | Changes `SaveSettingsState` and the action's return shape                                              |
| **Per-field error messages**                                   | ❌       | Depends on the state change above                                                                      |
| **The history as a table with all eight settings**             | ❌       | Breaks §7.6's `toContainText` unless the cell keeps `Feld: Wert`; and three settings are new on screen |
| **The empty state rendering the form**                         | ❌       | Changes what the page does, not how it looks                                                           |
| **Naming the current rhythm in words** (§4.4)                  | ❌       | A new read (`getWeekColour`) on this page                                                              |

Suggested sequence: **(1)** conversion — cards, grid, widths, labels, heights — e2e green untouched →
**(2)** the rejected-save fix, which is the finding worth the most → **(3)** the history table, with
`settings.spec.ts` edited deliberately and the reason recorded in the commit → **(4)** the empty
state and the rhythm sentence, if still wanted.

Step 2 is worth doing even if nothing else is.

### Step 1, as built

All 90 e2e specs green with **no test edited**, which is what the commit's boundary was for.
Measured at 1440×900 on the demo register, against the "before" numbers in §3:

| Claim                         | Before                             | After                                   |
| ----------------------------- | ---------------------------------- | --------------------------------------- |
| Shell inside the bar §3.11    | `main` x=272 w=896, nav x=144      | x=144 w=1152 — **identical to the nav** |
| Field widths §3.3             | all nine 408px                     | 163 / 252 / 1056 by content             |
| Control heights §3.4          | 34 input, 32 select, 40 button     | **36, all three**                       |
| Headings §3.8                 | `h1` + 3 `h2`, one section unnamed | `h1` + 4 `h2`                           |
| Reason's accessible name §3.7 | 91 characters                      | `Grund der Änderung (optional)`         |
| The rejected field §3.2       | no mark, border identical          | `aria-invalid` + `border-destructive`   |
| Horizontal overflow           | 0 at 1440/800/390                  | 0 at 1440/**1024**/800/390              |
| Console                       | 0 errors                           | 0 errors, 0 warnings                    |

Three numbers went the other way, and each is a card header rather than a mistake — the guide's
"a card header costs about 65px, and it is usually worth more than the target it breaks":

- **Page height 1068 → 1100px.** Three headers added, two `h2`s and three grid rows removed.
- **The confirmation moved down, 534 → 758px, and the new history row 930 → 942.** §3.10 wanted the
  record of a save above the fold and it is further below it. Not addressed here; the notice moves
  to the field in step 2, which is also where this is worth revisiting.
- **The field-to-error distance is 442px, against 454.** Effectively unchanged, and expected: the
  message is still the summary by the button. `aria-invalid` is what makes the field findable in
  step 1; §4.2c's per-field message is step 2.

Two things this pass turned up that the concept did not predict:

- **Spending the grid made the labels ragged.** Five inputs in one row landed on three baselines
  (y=276/296/316), because `Höchstzahl der Kundinnen und Kunden (N)` wraps to three lines in the
  163px slot §4.3 gives it and `Portionen je Erwachsenem` to two. Fixed with `grid-rows-subgrid`;
  the rule is now in `docs/ui_conversion_guide.md`. It is also **evidence for §11.5**: that label
  costs its row 40px of label height, which is a concrete price for the 39 characters.
- **`reason` at `lg:col-span-12` is a 1056px box** for what is usually two words — against 408px
  before. §4.3 asks for 12 and it was built as asked, but it is the "field width is a promise"
  rule pointing the other way, and 6 columns would say what the field is for more honestly.

---

## 9. Responsive

- **≥ 1280px** — the target. Both cards' grids in one row each; the history table fits eight columns
  in `max-w-6xl` without a scroll container. Verify: nine columns of German headings is exactly the
  case `/kunden` got wrong, and `whitespace-nowrap` on `TableHead` gives each column a floor equal to
  its label. Abbreviate the headings to shorter _true_ phrases, never to abbreviations nobody says.
- **~1024px** — the breakpoint to measure, not to guess. `/kunden` pushed the page sideways by 26px
  at exactly this width and it was invisible at 1440, 800 and 390. Check
  `documentElement.scrollWidth - clientWidth` here specifically.
- **~800px** — measured today: every field 360px, no overflow, page 1068px. The 12-column grid should
  collapse to 6 columns here, so a quota and a portions count still share a row.
- **390px** — measured today: fields 326px, page 1642px, save button at y=1214, **0 overflow**. One
  column throughout; the history table gets its `overflow-x-auto` container and that is the right way
  to give up. Not a working width.
- **No sticky header on the history table.** It will hold a handful of rows for years — the three
  causes the guide documents are not worth paying for a list this short.

---

## 10. Verification, before the PR is opened

```bash
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:e2e                     # with no test edited, for step 1
pkill -f next-server && npm run build && npm run start -- --port 3100 &
curl -s http://127.0.0.1:3100/einstellungen | grep -c "<a string you just added>"   # ≥ 1
playwright-cli open http://127.0.0.1:3100/einstellungen
playwright-cli snapshot              # read it
```

- **Snapshot:** four `heading`s below the `h1`; every field a named `textbox`/`spinbutton`/`combobox`
  whose name is **the label and nothing else** (§3.7); the notice a `status`.
- **Read `input.value` after every submit, not the page.** This is the check §3.1 exists because
  nobody ran. Fill four fields, make one invalid, submit, and read all four back. Then fill a valid
  change and confirm `reason` clears and the rest take the stored values.
- **Measure the field-to-error distance** on the rejected path: **454px today**.
- **Both states.** Pin the clock to a date before the oldest version
  (`FD_FIXED_NOW_FILE=data/dev-now.txt`, write `2020-01-01T09:00:00.000Z`, delete the file to
  restore) and confirm the empty state is no longer 0 forms / 0 inputs / 0 buttons.
- **Save twice on the same day** and confirm both versions list — the second-save spec is the one
  most likely to be broken by a "helpful" guard.
- Four widths: `scrollWidth - clientWidth === 0` at 1440, **1024**, 800, 390.
- `playwright-cli console` — 0 errors.
- `playwright-cli show --annotate` in front of FD. The question to ask them is §11.1.

Driving these flows writes real settings versions to `data/fd.db`. They cannot be deleted (FR-1), so
`npm run db:demo -- --reset` afterwards is not optional here — it is how the demo register gets its
history back.

---

## 11. Open questions

1. **Does anyone at FD ever read the Änderungsverlauf?** §4.2e is the most expensive item in this
   document and it is worth nothing if the answer is no. If the history is only ever consulted after
   a disagreement about a price, a table of eight columns is right; if it is never opened, it should
   shrink to a date list and the effort should go into §4.2d instead.
2. **Should the reason surface here?** It is collected, it goes to the audit log (FR-8), and the log
   has no screen. Either put the reason on `SettingsVersion` — one field, and it makes the history
   answer _why_ — or drop the field and stop asking for something no one can read back. The current
   middle is the worst of the three.
3. **Should `Ankerwoche` be `<input type="week">`?** It produces exactly `2026-W02` and removes the
   `2026-W2` class of mistake entirely. But Firefox does not implement it and falls back to a plain
   text box, so the format hint in the label has to stay either way — which means the gain is real
   but partial, and it is a decision about which browser FD actually uses.
4. **A live preview of a pending rhythm change?** §4.4 shows today's rhythm from the server. Showing
   what the _edited_ values would produce needs the week arithmetic on the client, which
   `getWeekColour` deliberately owns in the application layer. Probably not worth the boundary.
5. **Is `Höchstzahl der Kundinnen und Kunden (N)` the right label?** It is 39 characters, it is the
   longest string on the screen, it sets the width of a field holding three digits, and the `(N)` is
   an internal name. "Höchstzahl der Haushalte" is shorter and truer — the quota counts households,
   not people — but it appears in `fields`, in `errorFields` and in every history row, so changing it
   is a dictionary change with three call sites.
