# PRD: The portion allowance is removed (US-27)

> **Withdraws half of US-07** (see the portion allowance and price). Every screen that states a
> portion figure — the counter (US-04), the customer record and its live household editor (US-16.5),
> the customer list (US-15), the card view (US-02) — loses it, and the two settings that feed it
> (US-14) leave the settings screen and the schema with it. The **price is untouched**: it is still
> derived per head and still capped by the Maximalpreis (US-26).
>
> Source: DF's feedback from the testing phase, `local_only/new_requirements_analysis.md` §1.
>
> **US-28 (the egg allowance) depends on this PRD** and must run after it: it re-spans the same
> settings grid and fills the tile slot this one vacates.

## Introduction

The software states a number of portions for every household — `grownUps × portionsPerGrownUp +
children × portionsPerChild`, from two configurable per-head values. DF have now used the counter,
and the number describes nothing that happens at their distribution.

**Food is not handed out in portions.** A staff member decides, per distribution, _how much_ food
goes to each grown-up and each child — not how many units — and that decision moves from week to week
with what the shops and producers have donated. There is nothing countable for the figure to count.

This is worth being precise about, because it is not the usual kind of change. The number is not
_wrong_ and does not need correcting; **the quantity it names does not exist.** So there is nothing
to fix, nothing to make configurable and nothing to explain on screen — there is a derivation, two
settings, five displays and a column to delete. A number on the counter screen that means nothing is
worse than no number at all: it invites a staff member to act on it.

The price is unaffected and stays exactly as it is: per head, capped by the Maximalpreis, derived
through `priceFor` wherever it appears. What DF charge is real; what DF hand over is not counted.

**This is a deletion, and the discipline of a deletion is that nothing survives it.** The failure
mode is a portion figure left on one screen after it has gone from the settings — a household
described one way at the counter and another way on its record, computed from configuration that no
longer exists. The list of places in §US-27.5 is therefore exhaustive by design, and the e2e suite is
what proves it: `grep -ri portion src/ tests/` returns nothing after this PRD.

## Goals

- **The portion allowance leaves the software entirely** — the derivation, the two settings, the
  schema columns, the five displays, the German strings and the tests, in one PRD.
- **The price is untouched**, including the Maximalpreis: this removes food, not money.
- **No screen can disagree with another**, because after this there is nothing left to disagree
  about.
- **The documents stop describing a portion allowance**, so the next reader does not take a deleted
  quantity for a decision DF once made.
- The suite stays green at every step, and coverage on `domain/` and `application/` stays at 100% —
  a removal that leaves an untested branch behind has removed the wrong thing.

## User Stories

### US-27.1: The portion allowance leaves the domain

**Description:** As a developer, I need `portionsFor` and the two per-head portion settings gone from
the domain, so nothing downstream can derive a figure that does not exist.

**Acceptance Criteria:**

- [ ] `src/domain/policy/portions.ts` and `src/domain/policy/portions.test.ts` are **deleted**. There
      is no deprecation, no `@deprecated` marker and no re-export: this is pre-release and the only
      callers are in this repository
- [ ] `Settings` in `src/domain/policy/settings.ts` loses `portionsPerGrownUp` and
      `portionsPerChild`; `createSettings` loses their two `requireInteger` calls and the two lines
      that copy them into the returned object
- [ ] `PortionValues` is deleted with its module — it was a `Pick` of the two fields being removed
- [ ] `SETTINGS_FIELDS` loses both names, so `changedSettingsFields` stops reporting them and
      `updateSettings` stops writing them into an audit entry's changed-field list
- [ ] `SettingsChange` in `src/domain/policy/settings-diff.ts` loses the `portionsPerGrownUp` and
      `portionsPerChild` variants, and `diffSettings` loses the two comparison blocks
- [ ] The tests that asserted the two settings validate — `rejects a fractional portions count` and
      its siblings in `settings.test.ts` — are **deleted rather than rewritten**. A test for a value
      that no longer exists is not a test that can fail
- [ ] The tests that asserted the two diff cases in `settings-diff.test.ts` go the same way
- [ ] Every remaining doc comment that names the portion allowance as a motivation is reworded to
      name the price alone: the header of `settings.ts`, `householdComposition.ts`,
      `src/domain/calendarDay.ts`, `src/domain/card/staleCard.ts`, `src/domain/customer/customer.ts`
      and `src/domain/errors.ts`. The **counts** still drive something — the price — so the arguments
      those comments make survive; only the list of what the counts feed gets shorter
- [ ] `src/domain/` still imports nothing from Next.js, React or Prisma, and reads no clock
- [ ] `npm run test:coverage` passes with `domain/` at 100% — the two deleted branches take their
      tests with them and the number does not move
- [ ] Typecheck and lint pass. The typecheck failing loudly at every call site is the mechanism: it
      is the list of what US-27.2 to US-27.5 have to visit

### US-27.2: The allowance seam states counts and price only

**Description:** As a developer, I need `Allowance` to stop carrying a portion figure, so no use case
and no view model can pass one to a screen.

**Acceptance Criteria:**

- [ ] `Allowance` in `src/application/allowance/describe-allowance.ts` loses `portions`; the type
      becomes `{ grownUps, children, priceCents }`, and `allowanceAt` stops calling `portionsFor`
- [ ] The header comment stops calling the module "portions and price" and says what it now is: the
      one seam that turns a household plus a date into the **counts and the price**
- [ ] `describeAllowance` and `describeAllowances` keep their signatures, their date handling and
      their single read of the settings history. **This story changes what is derived, not how**
- [ ] `CounterView` in `src/application/customers/lookup-customer.ts` loses `portions`, and the line
      that copies it from the allowance
- [ ] The customer-list row type in `src/application/customers/list-customers.ts` loses `portions`
      and its copy line
- [ ] `read-customer.ts` and `read-card.ts` keep returning the allowance; only their doc comments
      change, from "the standard portions and price" to "the standard price"
- [ ] The comments in `src/application/ports.ts` that name the portions among the derived values are
      reworded
- [ ] Application tests lose their portion assertions and their portion fields in fakes and
      expectations. A test named after a portion rule is deleted; a test that asserted counts, price
      **and** portions keeps its other assertions
- [ ] `npm run test:coverage` passes with `application/` at 100%
- [ ] Typecheck and lint pass

### US-27.3: The two portion settings leave the schema

**Description:** As a developer, I need the columns gone, so a future reader of the schema cannot
find a portion allowance in it and conclude DF once had one.

**Acceptance Criteria:**

- [ ] `SettingsVersion` in `prisma/schema.prisma` loses `portionsPerGrownUp` and `portionsPerChild`
      and the `///` comment above them
- [ ] Pre-release rules apply (`CLAUDE.md` § Database migrations, ADR-009): the change **replaces**
      the init migration rather than stacking a corrective one onto it — delete
      `prisma/migrations/`, regenerate with `npx prisma migrate dev --name init`, then
      `npm run db:reset`. Confirmed with DF: the testing-phase database holds no real customer data
- [ ] The hand-written partial unique index at the end of the generated migration SQL
      (`Customer_customerNumber_onRegister_key`) is **re-added** after regeneration —
      `prisma migrate dev` drops it every time, and `src/infrastructure/prisma/schema.test.ts` greps
      the SQL and fails if it is missing
- [ ] No relation gains `onDelete: Cascade`, and every nullable relation still says
      `onDelete: Restrict` out loud — `schema.test.ts` checks both, in the schema and in the SQL
- [ ] `StoredVersion`, `toDomain` and `append` in `src/infrastructure/prisma/settings-repository.ts`
      lose the two fields
- [ ] `src/infrastructure/prisma/seed.ts` stops seeding them
- [ ] The repository integration test loses its portion assertions and still proves the round trip
      for every remaining value, the price cap's `null` among them
- [ ] `npm run db:reset` runs clean, and `/einstellungen` afterwards reports configured values rather
      than "nothing is configured" — that screen is the first symptom of schema/database drift
- [ ] Typecheck, lint and `npm run test:coverage` pass

### US-27.4: The settings screen stops configuring portions

**Description:** As a staff member, I want the Einstellungen screen to stop asking me for portion
counts, so I am not configuring a quantity DF does not hand out.

**Acceptance Criteria:**

- [ ] The two `NumberField`s for `portionsPerGrownUp` and `portionsPerChild` are removed from
      `src/app/einstellungen/settings-form.tsx`
- [ ] The **Mengen und Preise** card is re-spanned for the four fields that remain. The grid is
      twelve columns at `lg`; `3 + 3 + 3 + 3` fills it exactly and gives the quota the same width as
      each of the three money fields. Below `lg` the spans stop applying and the fields fall into two
      columns as they already do
- [ ] `settingsForm`, `formValues` and `SubmittedSettings` in `actions.ts` /
      `save-settings-state.ts` lose both keys; the comment that calls these "the ten fields of the
      settings form" is corrected to eight
- [ ] The `updateSettings` call in `actions.ts` stops passing them
- [ ] `src/i18n/de.ts` loses `settings.fields.portionsPerGrownUp`, `settings.fields.portionsPerChild`
      and both `settings.errorFields` entries
- [ ] `describeChange` in `src/app/einstellungen/page.tsx` loses the two `case` labels. The `switch`
      stays exhaustive over `SettingsChange` and gains **no** `default` branch
- [ ] `FullValues` stops printing them; its comment says how many values it now prints, and the first
      `<span>` holds the quota alone rather than the quota and two portion counts
- [ ] The card heading stays **Mengen und Preise**. It still holds a quantity — the customer quota —
      so the word is not left describing nothing
- [ ] Verify in the browser using the `playwright-cli` skill, reading the **accessibility snapshot**
      and not only the screenshot: the two textboxes are gone, the four that remain are still named
      textboxes on one baseline, the price hint still reaches `priceCap` through `aria-describedby`,
      and a save still succeeds and shows the new version in the Änderungsverlauf
- [ ] Typecheck, lint and `npm run test:coverage` pass

### US-27.5: No screen states a portion figure

**Description:** As a staff member, I want the portion figure gone from every screen at once, so no
household is described one way at the counter and another way on its record.

**Acceptance Criteria:**

- [ ] **Counter** (`src/app/ausgabe/counter-lookup.tsx`): the `counter-portions` `Stat` is removed.
      The row **keeps `grid-cols-2 sm:grid-cols-4`** and now holds three tiles. The tracks are shared
      deliberately with the customer-number/card-number pair above it, which already occupies two of
      the same four columns — identical widths on one baseline is what a comparison needs
      (`docs/guideline/ui_styling_guide.md` §4), and re-spanning this row to three would break the
      rhythm the row above depends on
- [ ] **Customer record** (`src/app/kunden/[id]/page.tsx`): the `portions` `Stat` in the read-only
      allowance block is removed, and the `policy` object handed to the household editor loses
      `portionsPerGrownUp` and `portionsPerChild`. The grid keeps its four tracks, for the same
      reason and so the read-only block and the editor below it stay column-for-column identical
- [ ] **Live household editor** (`src/app/kunden/[id]/household-editor.tsx`): `derived()` stops
      computing `portions`, the `portions` `Stat` is removed, and `AllowanceValues` becomes
      `PriceValues` — the import of `portionsFor` and `PortionValues` goes with it
- [ ] **Card view** (`src/app/kunden/[id]/karte/page.tsx`): the `portions` `Stat` is removed
- [ ] **Customer list** (`src/app/kunden/page.tsx`): the `Portionen` column header, the
      `customer-row-portions` cell and the row field are removed. The remaining columns take the
      freed width; the **name** column is the one that gets it, because it is the column staff scan
- [ ] `src/i18n/de.ts` loses `customers.derived.portions` and `customerList.table.portions`
- [ ] `de.customers.derived.standardValues` — „Standard-Portionen und -Preis; am Ausgabetisch nicht
      anpassbar." — now concerns the price alone: **„Standardpreis; am Ausgabetisch nicht
      anpassbar."** The screens that carry it (the record's read-only block and the two editors) keep
      it; the counter still does not, for the reason its comment already gives
- [ ] `de.customers.record.householdHint` and the waiting-list sentence at `de.ts` ~line 825 both
      enumerate „Erwachsene, Kinder, Portionen und Preis" and become „Erwachsene, Kinder und Preis"
- [ ] Every remaining German string and component comment naming Portionen is reworded, including the
      worked example in `src/app/stat.tsx`'s header comment
- [ ] **No layout is redesigned beyond removing the tile or column.** No tile is enlarged to fill the
      gap, no card is re-ordered, no heading is rewritten
- [ ] Verify all five screens in the browser using the `playwright-cli` skill, reading the
      **accessibility snapshot**: no tile, cell or column named Portionen survives on any of them,
      and the price is still announced on each
- [ ] Typecheck, lint and `npm run test:coverage` pass

### US-27.6: The e2e suite stops asserting portions

**Description:** As a developer, I want the suite to prove the figure is gone rather than to have
stopped mentioning it, because a deletion that only removes assertions is one that can silently come
back.

**Acceptance Criteria:**

- [ ] `tests/e2e/portions.spec.ts` is **renamed** to `tests/e2e/allowance.spec.ts` and keeps its
      job — proving the figures on screen are derived on the request rather than read from a stored
      column, by adding a member straight in the database and reloading. It now asserts the counts
      and the price. A file named `portions.spec.ts` that proves there are no portions is a file the
      next reader will misread
- [ ] Every band comment across the suite that refers to "portions (211)" names the renamed spec
      instead; the customer-number band **211 does not move**
- [ ] `tests/e2e/price-cap.spec.ts`: the `PORTIONS` / `PORTIONS_WITH_EXTRA_CHILD` constants and their
      assertions go. Its test _raises the portions and not the price when a member joins above the
      cap_ becomes _does not raise the price when a member joins above the cap_ — the cap's other
      half loses its witness here and is **not** faked with a different quantity
- [ ] `tests/e2e/age-13.spec.ts` and `tests/e2e/customer-record.spec.ts`: the `BEFORE` / `AFTER`
      fixtures lose their `portions` entries and the assertions that read `portions` /
      `counter-portions`. The birthday and the added baby still move the counts and the price, which
      is what those specs are about
- [ ] `tests/e2e/counter.spec.ts`, `customer-list.spec.ts` and `settings.spec.ts` lose their portion
      assertions, including the settings screen's version-summary expectations — **update those
      expectations deliberately and say so in the diff, rather than loosening them to a substring
      match**
- [ ] One **new** assertion, in `allowance.spec.ts`: the counter screen for a seeded household
      contains no accessible name matching `/Portion/i`. This is the assertion that would fail if the
      figure ever came back
- [ ] Synthetic data only (Faker)
- [ ] `grep -ri "portion" src/ tests/ prisma/` returns nothing
- [ ] Both engines pass: `npm run test:e2e` and `npm run test:e2e:webkit`, each with the dev server
      stopped — a live port 3000 fails the suite for the wrong reason

### US-27.7: The documents stop describing a portion allowance

**Description:** As the next developer, I want no document still describing a quantity the software
does not have, because `docs/` is where a reader goes to find out what DF need.

**Acceptance Criteria:**

- [ ] `docs/architecture/01-introduction-and-goals.md` — the goal "derive the portion allowance and
      the price" becomes the price; the list of what DF can change loses portions; the out-of-scope
      row "Portion adjustments for supply or occasions" is **rewritten as the reason the allowance
      was removed**, because that row was already the seed of this change and deleting it would lose
      the argument; the stakeholder table's manager row loses portions
- [ ] `docs/architecture/03-context-and-scope.md` — the context diagram's two edge labels and the
      stakeholder table's inbound list
- [ ] `docs/architecture/04-solution-strategy.md` — the list of configurable values, and the standing
      rule "nothing may hard-code a price, a portion count or a threshold" → "a price or a threshold"
- [ ] `docs/architecture/05-building-block-view.md` — the `policy/` and `allowance/` rows
- [ ] `docs/architecture/06-runtime-view.md` — both sequence diagrams and the birthday flow diagram
      lose their portions node and labels
- [ ] `docs/architecture/07-deployment-view.md` — the seed row's list of provisional values
- [ ] `docs/architecture/08-crosscutting-concepts.md` — the `SettingsVersion` class diagram and the
      standing rule quoted from ADR-005
- [ ] `docs/architecture/12-glossary.md` — the **Portion allowance** entry is removed
- [ ] `docs/architecture/adr/005-…md` and `007-…md` — the enumerations that name the portions;
      `adr/013-…md` — "which moves the portion allowance and the price" → the price. **No ADR is
      superseded**: none of the three decided that portions exist, they used them as an example
- [ ] `docs/architecture/09-architectural-decisions.md` — a row in **Decisions that were reversed**:
      the portion allowance was derived and shown for a year and is withdrawn because DF hand out
      food by judgement, not by count. That table exists precisely so the idea is not proposed again
- [ ] `docs/archiv/domain_analysis.md` and `docs/archiv/user_stories_mvp.md` — a short dated note at
      each portion claim pointing here, **not a rewrite**: `CLAUDE.md` says the archive is read as
      background and not extended, and a silent edit would erase what DF originally asked for
- [ ] `tasks/prd-us-07-portions-and-price.md` — a banner at the top marking the portion half
      **withdrawn** with a forward reference to this PRD; the price half stands
- [ ] `tasks/README.md` — the provisional-seed table loses its two portion rows and the sentence under
      it stops mentioning the allowance. The index table above it is **not** touched: it lists the MVP
      stories from `docs/archiv/user_stories_mvp.md` and has not been extended since US-16
- [ ] `CLAUDE.md` — the "Don't hard-code a price, portion count or threshold" bullet becomes "a price
      or a threshold". The three "derive, don't store" exceptions are **not** touched
- [ ] `docs/handout/betriebsanleitung.md` needs no change — verified: it never named the figure
- [ ] No code changes in this story

## Functional Requirements

- **FR-1:** The system must not derive, store, display or configure a portion allowance anywhere.
- **FR-2:** A settings version must no longer carry a portions-per-grown-up or portions-per-child
  value, and the settings screen must offer no control for either.
- **FR-3:** The price a household owes must be unchanged in every respect — per head, capped by the
  Maximalpreis, derived through `priceFor`, stored on a distribution record as it is today.
- **FR-4:** The derived grown-up and children counts must be unchanged, and must still follow a
  birthdate with no staff action (US-13).
- **FR-5:** The counter, the customer record, the live household editor, the card view and the
  customer list must each state the counts and the price, and no fourth figure.
- **FR-6:** A settings version recorded before this change must still resolve and still price a past
  distribution. The portion values it held are gone, and nothing reads them.
- **FR-7:** Wherever a screen explains that the values shown are the standard ones and cannot be
  adjusted at the counter, the sentence must concern the price alone.
- **FR-8:** No document may describe a portion allowance as something the software provides.

## Non-Goals

- **No replacement figure.** Nothing takes the tile's place in this PRD — not a total head count, not
  a bag count, not a "Menge" free-text field. US-28 fills the slot with the egg count, and that is a
  separate requirement with its own rule.
- **No change to the price, the Maximalpreis or how either is derived.** This removes food, not
  money.
- **No change to the counts, the 13th-birthday rule or the card's `AtIssue` snapshot.**
  `grownUpsAtIssue` and `childrenAtIssue` record what was printed on a card and are untouched.
- **No migration of the removed values into anything else** — not into a note, not into the audit
  log. They described nothing, so there is nothing to preserve.
- **No deprecation period.** The columns are dropped, not left nullable and unread.
- **No redesign of the screens that lose a tile.** Each keeps its grid tracks.
- **No change to `DistributionRecord`.** It never stored a portion count.

## Design Considerations

**Why the tile row keeps four tracks and shows three tiles.** The counter's identity pair
(Kundennummer, Kartennummer) sits in its own `grid-cols-2 sm:grid-cols-4` above the figures row and
deliberately occupies the first two of the same four columns, so the two rows share one column
rhythm. Re-spanning the figures row to three tracks would put the two rows a few pixels out of step
for the sake of filling a gap nobody is looking at. The record's read-only block and its editor share
tracks with each other for the same reason.

**The list column pays its width to the name.** The customer list's `Portionen` column is a
right-aligned digit under an eight-character heading. When it goes, the freed width goes to the name
— the column staff actually scan — rather than being spread evenly, which is the argument
`de.customerList.table.household` already makes for merging Erwachsene and Kinder into one column.

**The standard-values sentence shrinks rather than disappearing.** „Standard-Portionen und -Preis; am
Ausgabetisch nicht anpassbar." still has a job once the portions go: the price _is_ standard, it _is_
not adjustable at the counter, and the three screens that can edit a household are where a staff
member might expect to adjust it. Deleting the sentence would answer a question the screens no longer
answer at all.

**A deletion is verified by a grep, not by a screenshot.** The single most likely defect here is a
survivor — one `Stat`, one dictionary key, one comment that keeps a deleted concept alive for the
next reader. US-27.6 makes the grep an acceptance criterion for that reason.

## Technical Considerations

**The typecheck is the worklist.** Removing two fields from `Settings` breaks every `createSettings`
call site, every hand-written settings fake in the application tests, the repository, the seed, the
server action and the exhaustive `switch` in `page.tsx` — all at once, and all loudly. That is why
US-27.1 is one story rather than a field-at-a-time sequence: the intermediate states do not compile,
so there is nothing to ship between them.

**The `switch` in `describeChange` is exhaustive on purpose.** Removing the two union members leaves
two unreachable `case` labels that TypeScript will not flag as errors; they have to be deleted by
hand, and a `default` branch must not be added while doing it. The same union is what will make US-28
fail to compile until the egg case is handled — the mechanism working in both directions.

**The migration is a regeneration, not a `DROP COLUMN`.** DF hold no real data, so ADR-009 applies.
Two things do not survive `prisma migrate dev` on their own: the hand-written partial unique index,
and the audit `schema.test.ts` performs over the generated SQL. Both are covered by tests, so a lost
line fails CI rather than production.

**Coverage cannot be satisfied by deleting tests alone.** `domain/` and `application/` are gated at
100%, and removing a derivation removes both branches and their tests together, so the number should
not move. If it does, something was deleted that still has a caller.

**A deletion is executed outside-in, which is the inverse of the usual build order.** The stories
above are grouped by layer, as every PRD in `tasks/` is; the order they are _implemented_ in is the
other way round, because each step has to leave a compiling tree. The screens stop **reading** the
figure first (US-27.5 — `Settings` and `Allowance` still carry it, so everything compiles), then the
seam stops deriving it and `portions.ts` is deleted (US-27.2), then the two values leave the domain
and the settings screen together (US-27.1 + US-27.4 — one compile unit, since removing the fields
breaks the union, the exhaustive `switch`, the action, the repository and every fake at once), then
the columns go (US-27.3). Between US-27.1 and US-27.3 the Prisma columns are still `NOT NULL` with no
default, so `append` supplies a literal `0` for exactly one story. `scripts/ralph/prds/27-…json` is
sequenced that way and says so.

## Success Metrics

- `grep -ri "portion" src/ tests/ prisma/` returns nothing.
- The counter states three figures — Erwachsene, Kinder, Preis — and a staff member is never shown a
  number that no physical quantity corresponds to.
- The Einstellungen screen asks for four values in **Mengen und Preise**, all of which DF can point at
  something real for.
- Both e2e engines pass with no portion assertions and one new assertion proving the figure is absent.
- A settings version saved before the change still prices a past distribution correctly.

## Open Questions

- Does DF want the counter to state _anything_ about food quantity — a free-text note per
  distribution day, say? Assumed **no**: the analysis is explicit that the decision is made per
  distribution by the staff member and varies with what was donated. Worth revisiting only if staff
  ask for it after using the shortened screen.
- Should `tasks/prd-us-07-portions-and-price.md` be renamed now that half of it is withdrawn?
  Assumed **no** — the file name is cited from `progress.txt`, several specs and the Ralph batch
  index, and a banner at the top costs nothing while a rename costs a sweep.
