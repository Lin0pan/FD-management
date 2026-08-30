# PRD: The egg allowance (US-28)

> **Extends US-07** (what a household receives), **US-14** (configure the business rules) and
> **US-04/US-16** (the screens that state it). The counter, the customer record and the record's live
> household editor each gain one figure — **Eier** — derived from the size of the household under a
> rule DF edit themselves.
>
> Source: DF's feedback from the testing phase, `local_only/new_requirements_analysis.md` §2.
>
> **Depends on US-27** and must run after it: US-27 removes the portion allowance, frees the tile
> slot this PRD fills and re-spans the settings grid this PRD adds a card beside.

## Introduction

Alongside the food, DF hand every household a quantity of **eggs**. Unlike food, eggs are countable —
they come in whole units, so a stated number is a number the staff member can actually hand over —
and how many a household receives depends on how large it is.

DF's rule today:

| Persons in the household | Eggs |
| ------------------------ | ---- |
| 8 or more                | 18   |
| 5 to 7                   | 12   |
| 3 to 4                   | 6    |
| 1 to 2                   | 0    |

**A person is every member of the household on file, whatever their age.** Infants count: two
grown-ups and one baby is three persons and six eggs. This is the household **as recorded**, not the
number of people standing at the counter — the same household the grown-up and children counts and
the price are already derived from. Because the rule counts heads and does not distinguish grown-ups
from children, **a member's 13th birthday does not change the egg count** (it still changes the counts
and the price, US-13). The egg count moves only when somebody joins or leaves.

**The eggs are free.** They are handed out in addition to the other food at no separate charge, they
do not affect what a household pays, and they have nothing to do with the Maximalpreis (US-26).

**The rule is DF's, not the software's.** The table above is what DF do today, so it is configuration
in the sense ADR-005 already establishes for the quota and the prices: a list of rows, each a
**threshold** (a number of persons) and the **number of eggs** a household reaching it receives. Rows
can be added and removed, there may be three or any other number, and **the list may be emptied** —
no rows means no eggs for anyone, which is a legitimate setting and not an unfinished one. A household
receives the eggs of the **highest threshold it reaches**; a household below every threshold receives
none. A saved change is in force immediately and the superseded version is kept as read-only history,
exactly like every other policy value.

This is the first policy value that is a **list** rather than a number, and that is where most of the
work in this PRD is: validating a staircase, storing rows, editing rows in a form, and diffing two
rules row by row in the Änderungsverlauf.

## Goals

- **The counter states the egg count**, so nobody works it out at the table.
- **One derivation, from the household on file**, shared by the counter, the customer record and the
  live preview — no screen computes eggs of its own, and none can disagree with another.
- **DF change the rule themselves**, on the settings screen, with rows they add and remove; in force
  the moment it is saved, kept as history, named in the audit entry.
- **The staircase is guaranteed**: a configuration where two rows claim the same household, or where
  a larger household comes away with fewer eggs than a smaller one, is refused with nothing saved.
- **An entitlement of none is stated as `0`**, never as a blank.
- **The eggs cost nothing** — no price, no cap, nothing on a distribution record.

## User Stories

### US-28.1: The egg rule is a validated policy value (domain)

**Description:** As a developer, I need a rule type that cannot hold a broken staircase, so nothing
downstream has to decide what an ambiguous or descending rule means.

**Acceptance Criteria:**

- [ ] New pure module `src/domain/policy/eggs.ts`:
      `EggRuleRow = { readonly minPersons: number; readonly eggs: number }`,
      `EggRule = ReadonlyArray<EggRuleRow>`, and `createEggRule(rows): EggRule`
- [ ] `createEggRule` **sorts by `minPersons` ascending and then validates in that order** — staff may
      type the rows in any order, so sorting is part of constructing the value rather than something a
      caller does first. The returned rule is always sorted, and every reader may rely on it
- [ ] Per-row validation, in the **input** order so the index it names is the row on screen:
      `minPersons` is an integer of at least **1**; `eggs` is an integer of at least **0**. Either
      failure throws `InvalidSettings("eggRule.<index>.minPersons" | "eggRule.<index>.eggs", …)` using
      the existing `requireInteger` helper — do not write a second one
- [ ] Cross-row validation, after sorting: two rows naming the same `minPersons` throw the new
      `DuplicateEggThreshold(minPersons)`; a row whose `eggs` is not **strictly greater** than its
      predecessor's throws the new `EggsNotIncreasing(minPersons, eggs, lowerMinPersons, lowerEggs)`.
      Checking each row against its immediate predecessor is sufficient and is what the code does —
      the list is sorted, so strict increase between neighbours gives strict increase throughout
- [ ] Both new errors live in `src/domain/errors.ts` with their codes in `DomainErrorCode`, carry the
      numbers that made them fail, and are tiered **`refusal`** in `src/app/notice-tier.ts` — they are
      a collision between two rows a staff member can see and fix, not a broken screen
- [ ] **An empty rule is valid** and means no eggs for anyone. There is no minimum row count and no
      "at least one threshold" rule
- [ ] Beyond the rules above the module **judges nothing**: an egg count need not be a multiple of
      six, a threshold of 1 person is allowed, and a row awarding `0` eggs is allowed
- [ ] Strict TDD, invariant-breaking test first, one named test per rule:
      `accepts DF's own rule`, `accepts an empty rule`, `accepts a single row`,
      `sorts rows typed out of order`, `refuses two rows naming the same threshold`,
      `refuses a higher threshold awarding the same eggs`,
      `refuses a higher threshold awarding fewer eggs`, `refuses a threshold below one person`,
      `refuses a fractional threshold`, `refuses a negative egg count`,
      `refuses a fractional egg count`, `accepts an egg count that is not a multiple of six`,
      `accepts a threshold of one person`, and
      `names the typed row, not the sorted row, for a malformed value`
- [ ] Pure: no I/O, no clock, no import from Next.js, React or Prisma
- [ ] `npm run test:coverage` keeps `domain/` at 100%; typecheck and lint pass

### US-28.2: `eggsFor` derives the count (domain)

**Description:** As a staff member, I want the number of eggs to follow from how many people are in
the household, so the figure on screen is the one I hand over.

**Acceptance Criteria:**

- [ ] `eggsFor(rule: EggRule, persons: number): number` returns the `eggs` of the **highest threshold
      that `persons` reaches**, and `0` when it reaches none
- [ ] It takes an already-validated `EggRule`, so it does no sorting and no checking of its own — the
      type **is** the invariant, which is why `createEggRule` is the only way to make one. The doc
      comment says so, so the next reader does not add a defensive re-sort
- [ ] Tests written first, named after the rule, against DF's own rule (3 → 6, 5 → 12, 8 → 18):
      `awards nothing to a household below every threshold` (1 and 2 persons),
      `awards six from three persons` (boundary: exactly 3), `awards six at four persons`,
      `awards twelve from five persons` (boundary), `awards twelve at seven persons`,
      `awards eighteen from eight persons` (boundary), `awards eighteen to a very large household`
      (20 persons — there is no upper row and the top one keeps applying),
      `awards nothing under an empty rule`, `awards nothing to a household of nobody`
- [ ] The doc comment states that the rule counts **heads and not ages**, and why the eggs are
      therefore untouched by a 13th birthday
- [ ] Pure; `domain/` stays at 100%; typecheck and lint pass

### US-28.3: The rule is part of the settings, and a change to it is readable (domain)

**Description:** As a staff member, I want an edited egg rule to be versioned, audited and legible in
the Änderungsverlauf like every other policy value, so what DF hand out is on the record.

**Acceptance Criteria:**

- [ ] `Settings` in `src/domain/policy/settings.ts` gains `readonly eggRule: EggRule`, and
      `createSettings` builds it through `createEggRule` so an invalid rule can never reach a
      `Settings` value
- [ ] `SettingsInput` takes `ReadonlyArray<EggRuleRow>` — the unsorted, unvalidated form, as the
      weekday already is
- [ ] `SETTINGS_FIELDS` gains `"eggRule"` (after `priceCap`), so `changedSettingsFields` reports it
      and `updateSettings` names it in the audit entry's changed-field list
- [ ] `isUnchanged` gains an `eggRule` case beside the existing `weekAnchor` one — the value is an
      array, so `previous[field] === next[field]` is a reference comparison and would report every
      save as a change
- [ ] `diffEggRule(previous, next)` in `eggs.ts` returns the row-level changes, matched **by
      threshold** and reported in threshold order:
      `{ kind: "added" | "removed"; minPersons; eggs }` and
      `{ kind: "changed"; minPersons; from; to }`
- [ ] `SettingsChange` gains `{ field: "eggRule"; rows: ReadonlyArray<EggRuleRowChange> }` — **the one
      variant without `from`/`to`**, and deliberately so: a list-valued setting's change is a set of
      row changes, and rendering it as `from → to` would print the two whole rules side by side, which
      is exactly the 136-character restatement the history was rewritten to stop doing
- [ ] `diffSettings` emits the `eggRule` change **only when `rows` is non-empty**, so two identical
      rules produce no entry
- [ ] Tests written first: a row added, a row removed, a row's egg count changed, several at once, an
      unchanged rule, an emptied rule (every row removed), a rule filled from empty, and a rule whose
      rows were merely retyped in a different order (**not** a change — the value is sorted)
- [ ] `domain/` stays at 100%; typecheck and lint pass

### US-28.4: The allowance seam states the egg count (application)

**Description:** As a developer, I need the eggs derived in the one place the counts and the price are
derived, so no screen computes them and no two screens can disagree.

**Acceptance Criteria:**

- [ ] `Allowance` in `src/application/allowance/describe-allowance.ts` gains `readonly eggs: number`,
      and `allowanceAt` derives it as `eggsFor(settings.eggRule, grownUps + children)`
- [ ] **The person count is the composition's own total**, not a second count of the members array.
      `composition` already refuses an empty household and a birthdate in the future, and the two
      figures must never be able to describe different sets of people
- [ ] `CounterView` in `src/application/customers/lookup-customer.ts` gains `eggs`, copied from the
      allowance
- [ ] `read-customer.ts` and `read-card.ts` need no change: both return the whole `Allowance`, and
      **the card view simply does not render the eggs**. One seam derives one allowance and each
      screen shows what belongs on it — that is what the seam is for
- [ ] The customer-list row in `list-customers.ts` **does not gain `eggs`**: it copies named fields,
      and the list does not show them (see Non-Goals)
- [ ] Tests written first against hand-written fakes: a household of two grown-ups and one **infant**
      receives six eggs — the named test for _every member counts, whatever their age_; a household of
      two receives none; the eggs are **unchanged across a member's 13th birthday** while the counts
      and the price move (the boundary test that proves the rule counts heads); a past date is
      evaluated against the rule **in force then**, not today's
- [ ] `application/` stays at 100%; typecheck and lint pass

### US-28.5: The rule is stored and versioned (infrastructure)

**Description:** As a developer, I need each settings version to carry its own rule, so a past
distribution can be described by the rule that was in force on its day.

The model this story adds:

```prisma
model EggAllowanceRow {
  id                Int             @id @default(autoincrement())
  settingsVersionId Int
  settingsVersion   SettingsVersion @relation(fields: [settingsVersionId], references: [id], onDelete: Restrict)
  minPersons        Int
  eggs              Int

  @@unique([settingsVersionId, minPersons])
  @@index([settingsVersionId])
}
```

**Acceptance Criteria:**

- [ ] `prisma/schema.prisma` gains the model above, and `SettingsVersion` gains
      `eggRule EggAllowanceRow[]`
- [ ] `onDelete: Restrict` is written **out loud** even though the relation is required, and no
      relation gains `onDelete: Cascade` — `src/infrastructure/prisma/schema.test.ts` checks both, in
      the schema and in the generated SQL
- [ ] The `@@unique([settingsVersionId, minPersons])` is not decoration: it is the no-duplicate-
      threshold rule enforced a second time, by the database, and the `///` comment says so
- [ ] Pre-release rules apply (`CLAUDE.md` § Database migrations, ADR-009): delete
      `prisma/migrations/`, regenerate with `npx prisma migrate dev --name init`, then
      `npm run db:reset`, and **re-add the hand-written partial unique index**
      (`Customer_customerNumber_onRegister_key`) at the end of the migration SQL
- [ ] `PrismaSettingsRepository.append` writes the rows as a **nested create** inside the same
      `settingsVersion.create` call, so a version and its rows are one statement and one transaction —
      a version can never exist with half a rule
- [ ] `listVersions` includes the rows ordered by `minPersons` ascending, and `toDomain` passes them
      through `createSettings`, so a hand-edited database cannot smuggle a descending staircase or a
      fractional threshold into the domain
- [ ] `src/infrastructure/prisma/seed.ts` seeds **DF's real rule**: 3 → 6, 5 → 12, 8 → 18. Unlike the
      quota, the prices and the calendar values, this one is **not provisional** — DF confirmed it
- [ ] Integration test against a throwaway SQLite file: append a version with three rows and one with
      **none**, read both back, and assert the three rows survive in threshold order and that the
      empty rule comes back as an empty array rather than as absent or as a default
- [ ] Integration test: two versions may hold the same thresholds — the unique index is per version,
      not global
- [ ] `npm run db:reset` runs clean and `/einstellungen` afterwards reports configured values
- [ ] Typecheck, lint and `npm run test:coverage` pass

### US-28.6: The counter, the record and the live preview state the eggs (presentation)

**Description:** As a staff member at the counter, I want the egg count beside the grown-ups, the
children and the price, so I hand over the right number without working it out.

**Acceptance Criteria:**

- [ ] **Counter** (`src/app/ausgabe/counter-lookup.tsx`): a `Stat` labelled `de.customers.derived.eggs`
      with `testId="counter-eggs"`, in the **third** slot of the four-track figures row — the slot the
      portion tile vacated in US-27 — so the **price stays in the fourth**, where staff already look
      for it
- [ ] **Customer record** (`src/app/kunden/[id]/page.tsx`): the same tile with `testId="eggs"` in the
      read-only allowance block, in the same slot
- [ ] **Live household editor** (`src/app/kunden/[id]/household-editor.tsx`): the same tile, updating
      as members are added and removed. `derived()` computes it through `eggsFor` against the rule the
      server handed down — **it must not re-implement the lookup**; `AllowanceValues` widens to carry
      the rule, and `page.tsx` passes `settings.eggRule` into the `policy` object
- [ ] A household entitled to none shows **`0`**, never a blank and never a dash. The figure is never
      left out: a blank field cannot be told apart from one that failed to appear, and the staff
      member has to be able to see that the question was answered. The editor's `unknown` dash still
      applies while **nothing is derivable at all** (no dated member yet), exactly as it does for the
      counts beside it — that is a different state from an entitlement of none
- [ ] The figure is a **plain number**, in the same form as the grown-up and children counts beside
      it — no „Stück", no unit suffix, no explanation of the rule on any of the three screens
- [ ] `src/i18n/de.ts` gains `customers.derived.eggs: "Eier"`. No German literal in any component
- [ ] **The customer list and the card view are not touched** and gain no egg figure (see Non-Goals)
- [ ] Verify all three screens in the browser using the `playwright-cli` skill, reading the
      **accessibility snapshot**: the tile is announced as one fact — „Eier 6", label and value inside
      one `<p>`, which is what `Stat` exists to guarantee — and the editor's figure moves when a
      member is added across a threshold
- [ ] Typecheck, lint and `npm run test:coverage` pass

### US-28.7: The rule is editable on the settings screen (presentation)

**Description:** As a staff member, I want to add, change and remove the egg rows myself, so a change
to what DF hand out does not need a developer.

**Acceptance Criteria:**

- [ ] A new **Eier** `Section` card on `/einstellungen`, between **Mengen und Preise** and
      **Ausgaberhythmus**. It is its own card rather than a sixth field in the first one: a repeating
      table with add and remove controls does not belong in that card's twelve-column field grid
- [ ] The rows are a **table** with two columns — the threshold („Ab wie vielen Personen") and the egg
      count („Eier") — plus a remove control per row and one **Zeile hinzufügen** button below.
      Tabular data in a table, with the field names in the column headings and each input keeping its
      full name as `aria-label`, exactly as the household editor's rows do
- [ ] Rows are held in `useState` with **controlled** inputs, seeded from the stored rule — the
      household editor's mechanism, and for its reason: `useActionState` resets an uncontrolled form
      when the action resolves, and a refused save must not silently rewind the rows that were typed.
      Because the rows are React state and survive the reset, they need **no** echo through
      `SubmittedSettings`, unlike the eight uncontrolled fields around them; say so in a comment so the
      asymmetry does not read as an oversight
- [ ] The rows are shown **in threshold order as stored**. Staff may type a new row anywhere and in
      any order; the order is settled on save, when the domain sorts, and the reloaded screen shows the
      sorted result
- [ ] **The list may be emptied.** Removing the last row is allowed, saving an empty list is allowed,
      and the empty table states in words that no household receives eggs — an empty area cannot be
      told apart from one that failed to render
- [ ] A hint under the table states the rule in one sentence: a household receives the eggs of the
      highest threshold it reaches, and a household below every threshold receives none. It is a
      sibling paragraph reached by `aria-describedby`, **not** nested inside a label (§3.7)
- [ ] The inputs carry repeated `name`s (`eggThreshold`, `eggCount`) and per-row ids, read back in
      `actions.ts` by a pairing helper beside `householdRows`. A row where **both** fields are blank is
      dropped before validation — pressing _Zeile hinzufügen_ and then saving must not refuse — while a
      row with **one** blank field is refused, naming the blank one
- [ ] The refusal paths, and the division between them:
  - a malformed or out-of-range value in one row marks **that row's control**, through
    `InvalidSettings("eggRule.<index>.minPersons" | ".eggs")` and the existing `marking` /
    `problemAt` mechanism;
  - a **collision between rows** — `DuplicateEggThreshold`, `EggsNotIncreasing` — names **no field**
    and is stated by the button, precisely as `QuotaBelowActiveCustomers` already is: marking one of
    two rows would say that row is malformed when the two are merely inconsistent. The German
    sentence names the thresholds, so the rows are findable
- [ ] `settingsFormFieldLabel` learns the indexed path through a regex helper modelled on
      `householdFieldLabel` — `/^eggRule\.(\d+)\.(minPersons|eggs)$/` → „Eier, Zeile 2: Eier" — so a
      refused row is named in the summary instead of being dropped as a field nobody can see (§7)
- [ ] `src/i18n/de.ts` gains the section heading, the two column headings, the add and remove labels,
      the hint, the empty-table sentence and the two collision sentences. No German literal in the
      component
- [ ] **Nothing is saved when the rule is refused** — the use case validates before it appends, and
      the other eight settings on the form are appended with it or not at all
- [ ] Verify in the browser using the `playwright-cli` skill, reading the **accessibility snapshot**:
      every input is a named textbox, the add and remove controls are named buttons, a removed row
      disappears without a reload, a refused save keeps every typed row, and the marked row is the one
      that was typed rather than the one it sorts to
- [ ] Typecheck, lint and `npm run test:coverage` pass

### US-28.8: The Änderungsverlauf reads a rule change row by row (presentation)

**Description:** As a staff member, I want to see which rows were added, which removed and which
changed, so a past egg rule is as readable as a past price.

**Acceptance Criteria:**

- [ ] `describeChange` in `src/app/einstellungen/page.tsx` handles the `eggRule` case, rendering the
      row changes joined by `·` under the label `de.settings.fields.eggRule`:
      „Eierregel: ab 8 Personen: 18 Eier (neu) · ab 5 Personen: 12 → 14 Eier · ab 3 Personen: 6 Eier
      (entfernt)"
- [ ] The three row phrasings are dictionary functions, one per `kind`, so the words for _added_,
      _removed_ and _changed_ are stated once
- [ ] The `switch` stays **exhaustive** over `SettingsChange` — the build fails until this case exists,
      which is the mechanism working; no `default` branch is added to silence it
- [ ] `FullValues` — the read-only summary of the version in force — states the rule on a line of its
      own, each row as „ab 3 Personen: 6 Eier", joined by `·`
- [ ] An **empty** rule renders as a German phrase (`de.settings.eggs.none` — „keine Eier") in both
      places, for the same reason `kein Maximalpreis` exists: an empty stretch of screen cannot be
      told apart from one that failed to render, and „keine Eier" and „0 Eier ab 1 Person" are two
      different configurations
- [ ] Verify in the browser using the `playwright-cli` skill: save three versions (change a row's egg
      count, add a row, empty the rule), open the folded Änderungsverlauf and confirm all three read as
      above and that the fold summary still states the version count and the last-changed date
- [ ] Typecheck, lint and `npm run test:coverage` pass

### US-28.9: E2E — the egg count from the settings screen to the counter

**Description:** As a developer, I want the rule proved against the built app, because the figure that
matters is the one on the counter screen when a customer number is typed.

**Acceptance Criteria:**

- [ ] New `tests/e2e/eggs.spec.ts`, owning a customer-number band no other spec uses and registering
      **synthetic** households (Faker), with the birthdates as literals because the counts are derived
      from them
- [ ] Under the seeded rule, asserts the count on the **counter** and the **customer record** for
      households of 2 → **0**, 3 → **6**, 5 → **12** and 8 → **18** — the three boundaries and the
      below-every-threshold case
- [ ] Asserts the household of **two grown-ups and one infant** shows `6`: the case the rule's wording
      exists for
- [ ] Asserts `0` is **shown** for the two-person household — the assertion is that the tile reads
      `0`, not that the tile is absent
- [ ] Asserts the **live preview**: adding a third member in the household editor moves the previewed
      figure from `0` to `6` before the save, and the saved record then agrees with it
- [ ] Asserts the rule is **read, not hard-coded**: change a row on `/einstellungen` (6 → 8 eggs at
      three persons), reload the counter for the same household, and see `8`
- [ ] Asserts the settings screen **refuses** an ambiguous and a descending rule: two rows naming the
      same threshold, and a higher threshold awarding fewer eggs. In both cases the notice names the
      thresholds, **nothing is saved** (reload and the old rule is still there), and the typed rows
      are still on screen
- [ ] Asserts an **emptied** rule saves, and every household then shows `0`
- [ ] Asserts the eggs are **not on the customer list and not on the card view**
- [ ] Asserts the eggs do **not** move the price: the price for each household is what the per-head
      rule and the cap already say
- [ ] `tests/e2e/age-13.spec.ts` gains one assertion: across the 13th birthday the counts and the price
      move and the **egg count does not**
- [ ] Existing specs pass unchanged
- [ ] Both engines: `npm run test:e2e` and `npm run test:e2e:webkit`, each with the dev server stopped

### US-28.10: The documents describe the egg allowance

**Description:** As the next developer, I want the egg rule recorded where the other policy values are,
including why it is stored as rows rather than as a number.

**Acceptance Criteria:**

- [ ] An **ADR** recorded through the `record-adr` skill: _store the egg allowance as versioned
      threshold rows_ — the first list-valued policy value, a child table of `SettingsVersion` rather
      than a JSON column, with the `@@unique([settingsVersionId, minPersons])` enforcing part of the
      rule in the database and the domain enforcing the staircase. Alternatives considered and
      rejected: a JSON blob (untyped, unenforceable, and out of step with a schema in which every
      value is a typed column) and three fixed columns (they would make DF's current three rows part
      of the software). It gets its row in
      `docs/architecture/09-architectural-decisions.md`
- [ ] `docs/architecture/01-introduction-and-goals.md` — the goal of deriving what a household
      receives, and the list of what DF can change, both name the egg allowance
- [ ] `docs/architecture/03-context-and-scope.md` — the diagram edge labels and the manager's inbound
      list
- [ ] `docs/architecture/04-solution-strategy.md` — the list of configurable values, and the standing
      rule "nothing may hard-code a price or a threshold" gains the egg counts by name
- [ ] `docs/architecture/05-building-block-view.md` — the `policy/` row names the egg rule; the
      `allowance/` row says the seam produces counts, eggs and a price
- [ ] `docs/architecture/06-runtime-view.md` — the counter sequence returns the eggs with the price
- [ ] `docs/architecture/07-deployment-view.md` — the seed row lists DF's rule and says it is **real**
      rather than provisional
- [ ] `docs/architecture/08-crosscutting-concepts.md` — the `SettingsVersion` class diagram gains the
      related rows, and the configuration-as-data section explains a list-valued setting
- [ ] `docs/architecture/12-glossary.md` — an **Eier / egg allowance** entry, and a **threshold** entry
      if the word is not already defined
- [ ] `docs/handout/betriebsanleitung.md` — DF's own printable instructions gain a short German
      paragraph: where the egg count appears at the counter, and how to change the rule
- [ ] `tasks/README.md` — the seed table gains the egg rule, marked as **confirmed** rather than
      provisional, and the paragraph above it says why that one row differs from the rest. The MVP
      index table is not touched
- [ ] `docs/archiv/` is **not** rewritten — a dated pointer at most, as US-27 established
- [ ] No code changes in this story

## Functional Requirements

- **FR-1:** The system must hold the egg rule as an ordered list of `(minPersons, eggs)` rows on every
  settings version, including the empty list.
- **FR-2:** The number of eggs a household receives must be the `eggs` of the highest `minPersons` it
  reaches, and `0` when it reaches none.
- **FR-3:** The person count must be **every member of the household on file**, whatever their age,
  and must be the same set of people the grown-up and children counts are derived from.
- **FR-4:** A configuration must be refused, with nothing saved, when two rows name the same threshold
  or a higher threshold does not award strictly more eggs than the one below it.
- **FR-5:** A `minPersons` must be a whole number of at least 1 and an `eggs` a whole number of at
  least 0; anything else is refused naming the row and the field.
- **FR-6:** The rule must accept rows typed in any order, must be sorted by threshold before it is
  checked, and must always be displayed in that order.
- **FR-7:** Beyond FR-4 and FR-5 the system must not judge the numbers — an egg count need not be a
  multiple of six, and a threshold of one person is allowed.
- **FR-8:** A saved rule must be in force immediately, the superseded version kept as read-only
  history, and the change named in the audit entry's changed-field list.
- **FR-9:** A change to the rule must appear in the Änderungsverlauf **row by row** — which rows were
  added, which removed, and which changed from how many eggs to how many.
- **FR-10:** The counter, the customer record and the live household editor must each state the egg
  count; the customer list and the card view must not.
- **FR-11:** A household entitled to no eggs must show `0`.
- **FR-12:** The eggs must not affect what a household pays, must not interact with the Maximalpreis,
  and must not be written to a distribution record.
- **FR-13:** A member's 13th birthday must not change the egg count.
- **FR-14:** A fresh installation must start with DF's rule: 3 → 6, 5 → 12, 8 → 18.

## Non-Goals

- **No eggs on the customer list or the card view.** The list is scanned, not read, and its columns
  are already paid for out of the name. The card is a digital representation of a card designed and
  printed in a **separate system**, and the eggs are handed over at the counter, where the screen is.
- **No egg count on a distribution record.** The record stores what the household handed over and the
  price that was owed (a `paid` flag, when this was written — see
  [US-29](prd-us-29-customer-balance.md)); the eggs are free, so there is nothing about them for it
  to answer.
- **No stock, no inventory, no "eggs remaining today".** The software states an entitlement, not a
  supply.
- **No charge for the eggs**, no egg-specific price, no interaction with the Maximalpreis in either
  direction.
- **No per-group or per-household rule.** One rule applies to everyone; a household DF want to treat
  differently is a conversation at the counter.
- **No rule based on anything but the head count** — not on ages, not on the grown-up/child split, not
  on the group.
- **No explanation of the rule on the counter.** The counter states the number and nothing else: no
  threshold, no "because your household is 5", no tooltip. The rule is on the settings screen.
- **No upper bound on rows** and no minimum. Three today, any number tomorrow, zero if DF stop handing
  out eggs.
- **No scheduling.** A rule cannot be dated forwards or backwards, for the same reason no other
  setting can.

## Design Considerations

**Where the tile goes, and why the price does not move.** US-27 leaves the figures row with three
tiles in four tracks. The eggs take the third slot — the one the portions vacated — so the price stays
in the fourth, exactly where it has always been on all three screens. The counts, then the eggs, then
the money: the first three are facts about the household, the last is the thing to collect. Moving the
price to make room would be the one change on this screen a staff member could actually get wrong.

**`0` is a figure, not a blank.** A household of two receives no eggs, and the tile says `0`. This is
the same argument `kein Maximalpreis` makes on the settings screen and `Noch keine Fassung` makes in
the history count: an absence rendered as nothing is indistinguishable from a failure to render, and
the staff member has to be able to see that the question was answered. The editor's `—` still stands
for _not derivable yet_, which is a different state and stays visibly different.

**Its own card on the settings screen.** The Eier rule is a repeating table with add and remove
controls; the **Mengen und Preise** card is a twelve-column grid of single fields whose subgrid keeps
every label on one baseline. Putting a table inside it would break that grid for the one thing on the
screen that is not a single value. A third card costs a heading and reads as what it is.

**A collision names no field.** The screen already has a refusal that names two numbers rather than one
field — a quota below the active customer count — and it is stated by the button, unmarked. Two rows
claiming the same household, or a bigger household getting fewer eggs, is the same shape: neither row
is malformed, the pair is inconsistent. Marking one of them would make a claim the software cannot
support, so the sentence names the thresholds and lets the staff member choose which row to change.

**The rows sort on save, not as you type.** Sorting the table while somebody is typing into it moves
the row under the cursor. So the domain sorts, the save settles the order, and the reloaded screen
shows the result — which also keeps the refusal honest, because a marked row is the row that was typed
rather than the row it would have sorted to.

**Wording.** „Eier" for the figure, matching what DF call it. „Ab wie vielen Personen" for the
threshold column rather than „Personenzahl", because the column holds a floor and not a count — the
distinction the entire rule turns on. „Eierregel" for the history label, so a change is not announced
under the same word as the figure it changes.

## Technical Considerations

**The person count comes from the composition, not from `members.length`.** `composition` refuses an
empty household and a birthdate in the future, and its two counts always sum to the household. Adding
a second count of the same array would be a second source of truth for the same fact — and in the
browser-side preview, where rows with half-typed dates are filtered out, the two would genuinely
disagree.

**`EggRule` is a validated value, so `eggsFor` can be a scan.** The only constructor is
`createEggRule`, which sorts and checks; everything downstream may assume ascending thresholds and a
strictly rising staircase. This is the same bargain `CardNumber` and `Settings` already strike, and it
is why `eggsFor` must not defensively re-sort — a second sort would be a second place for the ordering
rule to live.

**The `switch` in `describeChange` is exhaustive**, so adding the union member breaks the build until
the settings page handles it. That is the mechanism, not an obstacle; do not add a `default`.

**The new union member has a different shape from the other nine**, and that is a deliberate cost. A
list-valued setting has no `from → to` worth printing, so `SettingsChange` stops being uniformly
`{field, from, to}`. Everything that consumes it already `switch`es exhaustively, so the compiler finds
every place that has to care.

**Coverage.** `domain/` and `application/` are gated at 100%, and this PRD adds a validator with many
branches. Every refusal branch above has a named test in US-28.1; the empty rule and the
below-every-threshold case are the two easiest to leave uncovered.

**The migration is a regeneration.** Second time in three PRDs, same two things to watch: the
hand-written partial unique index, and `schema.test.ts`'s audit of the generated SQL.

**Fakes.** Every hand-written settings fake and builder under `src/application/**` and
`src/domain/**` gains `eggRule` when `Settings` does, in the same commit — the suite will not compile
otherwise.

## Success Metrics

- A staff member types a customer number at the counter and reads the egg count with everything else,
  without counting heads or consulting a table.
- A household of two grown-ups and one infant reads **6** on all three screens that state it.
- DF change a threshold or an egg count on the settings screen in one edit and one save, with no
  deploy, and the previous rule stays readable in the Änderungsverlauf.
- A configuration that would give a larger household fewer eggs cannot be saved.
- No screen derives an egg count except through `eggsFor`.

## Open Questions

- Does the rule ever differ between the RED and BLUE groups, or at a special distribution (Christmas,
  a donation glut)? Assumed **no** — one rule for everyone. A one-off would be a settings edit on the
  day, which the versioning already supports.
- Does DF want the counter to state _why_ a household gets its number („ab 5 Personen")? Assumed
  **no**, per Non-Goals; worth revisiting only if staff report distrusting the figure.
- Are there other countable goods handed out by household size — nappies, a second bag — that will want
  the same shape? If so, this PRD's row-and-threshold mechanism is the thing to generalise, and the
  ADR in US-28.10 is where that conversation should start. **Not designed for here**: one rule, named
  for eggs, is what DF asked for.
