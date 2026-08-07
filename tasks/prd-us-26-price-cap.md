# PRD: A household never pays more than the Maximalpreis (US-26)

> Extends **US-07** (see the portion allowance and price) and **US-14** (configure the business
> rules). Every screen that shows a price — the counter (US-04), the card (US-02), the customer list
> (US-15), the customer record and its live household editor (US-16.5) — and every distribution
> record written at the counter (US-05) inherits the change without asking for it, because all of
> them price a household through the one function this PRD modifies.

## Introduction

FD charges per head: a price per grown-up plus a price per child, both configurable. Today that is
the whole rule, and it means a large household pays a large amount. With FD's current numbers —
2,00 € per grown-up, 1,00 € per child — a household of four grown-ups and three children owes
**11,00 €**.

FD does not charge that. There is a **Maximalpreis**: an upper limit on what any one household pays
for one distribution, currently **5,00 €**. The household above pays 5,00 €, not 11,00 €. The
software does not know this, so it states a price FD does not collect — on the counter screen, on the
customer's card, in the customer list, and in the `priceCents` written onto every distribution record
for a large household.

**What this changes is one line of arithmetic.** The price a household owes is already derived in
exactly one place, `priceFor` in `src/domain/policy/settings.ts`, and every screen and every use case
reaches it through `describeAllowance`. Capping the result there is the entire behavioural change:

```
uncapped = grownUps × pricePerGrownUp + children × pricePerChild
owed     = priceCap === null ? uncapped : min(uncapped, priceCap)
```

Everything else in this document is the consequence of that value having to be **configurable,
versioned and auditable** like every other policy value FD can change (US-14): a settings column, a
form field, a history entry, an audit field, and a seed.

**The cap is optional.** It is a `Cents | null`, and an empty Maximalpreis field means there is no
cap — the price is whatever the per-head arithmetic says. This is not the same claim as a cap of
0,00 €, which means every household collects for free, and the settings screen must be able to
express both. `0` is already a meaningful price everywhere else on that screen (a portions count of
0, a child price of 0), so it cannot double as the off switch.

**Why it must be versioned rather than a constant.** A distribution record stores a `paid` flag and
the price that was owed; the settings history is how the software answers _what did that household
owe last March_. A cap introduced now, or changed from 5,00 € to 6,00 € next year, must not silently
restate what an older distribution cost. It lives on `SettingsVersion` alongside the two per-head
prices, and `resolveSettingsAt` already does the rest.

## Goals

- **No household is ever quoted or charged more than the configured Maximalpreis.** One derivation,
  applied everywhere a price appears, with no screen able to disagree with another.
- **The cap is a setting, not a constant** — editable in the UI, in force the moment it is saved,
  kept as read-only history, and named in the audit entry for the save that changed it.
- **"No cap" is expressible and distinct from "a cap of nothing".** An empty field means uncapped;
  `0,00 €` means free.
- **Historical prices stay historical.** A distribution priced under yesterday's cap still reports
  yesterday's amount.
- Money stays integer cents from the form field to the database; no float touches the cap.

## User Stories

### US-26.1: The cap is part of the policy values (domain)

**Description:** As a developer, I need `Settings` to carry an optional maximum price, validated like
every other policy value, so that nothing downstream has to decide what an absent cap means.

**Acceptance Criteria:**

- [ ] `Settings` in `src/domain/policy/settings.ts` gains `readonly priceCap: Cents | null` —
      documented as _the most a household pays for one distribution, or `null` for no cap_
- [ ] `createSettings` accepts it and validates: `null` passes; a number must be a non-negative
      integer, rejected with `InvalidSettings("priceCap", …)` otherwise (the existing
      `requireInteger` helper, applied only when the value is not `null`)
- [ ] Tests written first, one per rule: a cap of 500 is accepted; `null` is accepted; `-1` is
      rejected naming `priceCap`; `2.5` is rejected naming `priceCap`; `0` is accepted (free for
      everyone is a legal configuration)
- [ ] `SettingsInput` needs no new exception — the field is spelled the same on both sides
- [ ] Pure: no clock, no I/O, no default cap baked in

### US-26.2: `priceFor` never returns more than the cap (domain)

**Description:** As a staff member, I want a large household's price to stop at the Maximalpreis, so
that the number on screen is the number I take at the counter.

**Acceptance Criteria:**

- [ ] `PriceValues` becomes `Pick<Settings, "pricePerGrownUp" | "pricePerChild" | "priceCap">` — the
      three values the derivation reads, still not the whole of `Settings`, so the household editor
      can keep pricing in the browser without being handed the quota and the week anchor
- [ ] `priceFor(settings, grownUps, children)` returns the per-head sum when `priceCap` is `null`,
      and `Math.min(sum, priceCap)` otherwise
- [ ] The result is integer cents in every case — both inputs are whole cents, so the minimum of two
      of them is too; no rounding is introduced anywhere
- [ ] Tests written first, named after the rule: - `charges the per-head sum when there is no cap` - `charges the per-head sum when it stays below the cap` — 1 grown-up, 1 child at
      2,00 €/1,00 € with a cap of 5,00 € owes **300**, the sum, because the cap is never reached - `stops at the cap for a large household` — FD's own numbers: 4 grown-ups, 3 children,
      2,00 €/1,00 €, cap 5,00 € → **500**, not 1100 - `charges the cap exactly when the sum equals it` (boundary: sum 500, cap 500 → 500) - `charges nothing when the cap is zero`, whatever the household size - `caps a single-grown-up household too` — a cap below `pricePerGrownUp` applies to everyone,
      there is no minimum-household exemption - `caps an empty household at nothing` — 0 heads owe 0, never the cap
- [ ] The doc comment states why the cap is `null`-able and not `0`-flagged, so the next reader does
      not "simplify" it

### US-26.3: A changed cap is named in the history and the audit entry (domain)

**Description:** As a staff member, I want a change to the Maximalpreis to appear in the
Änderungsverlauf like every other setting, so the record of what FD charges is complete.

**Acceptance Criteria:**

- [ ] `SETTINGS_FIELDS` in `settings.ts` gains `"priceCap"`, positioned after `pricePerChild`, so
      `changedSettingsFields` reports it and `updateSettings` writes it into the audit entry's
      changed-field list
- [ ] `SettingsChange` in `settings-diff.ts` gains
      `{ field: "priceCap"; from: Cents | null; to: Cents | null }`
- [ ] `diffSettings` reports a change when the two versions' caps differ, including
      **`null` → a value** (a cap was introduced) and **a value → `null`** (a cap was removed);
      `null` → `null` is not a change
- [ ] Tests written first covering all four transitions plus a value → different value
- [ ] The union stays exhaustive so the settings page's `switch` fails to compile until it handles
      the new case (US-26.6)

### US-26.4: The cap is stored and versioned (infrastructure)

**Description:** As a developer, I need the cap persisted on each settings version, so a past
distribution is priced by the cap that was in force on its day.

**Acceptance Criteria:**

- [ ] `SettingsVersion` in `prisma/schema.prisma` gains `priceCapCents Int?` — **nullable**, and the
      comment says why: absent is a real configuration, not a missing value
- [ ] Pre-release rules apply (`CLAUDE.md` § Database migrations): the change **replaces** the init
      migration rather than stacking onto it — delete `prisma/migrations/`, regenerate with
      `npx prisma migrate dev --name init`, then `npm run db:reset`. The hand-written partial unique
      index at the end of the migration SQL (`Customer_customerNumber_onRegister_key`) must be
      re-added afterwards, and the `onDelete: Restrict` clauses re-checked — `schema.test.ts` greps
      the generated SQL and will fail if either is lost
- [ ] `PrismaSettingsRepository.append` writes `settings.priceCap` to `priceCapCents`; `toDomain`
      reads it back as `row.priceCapCents ?? null` and passes it through `createSettings`, so a
      hand-edited database cannot smuggle a fractional cap into the domain
- [ ] Integration test against a throwaway SQLite file: append a version with a cap and one without,
      read both back, assert `500` and `null` respectively survive the round trip
- [ ] The seed (`src/infrastructure/prisma/seed.ts`) sets `priceCap: 500` — FD's real cap, so seeded
      data exercises the capped path for larger households out of the box

### US-26.5: Maximalpreis is editable on the settings screen (presentation)

**Description:** As a staff member, I want to set or clear the Maximalpreis on the Einstellungen
screen, so a change to what FD charges does not need a developer.

**Acceptance Criteria:**

- [ ] A `Maximalpreis` field sits in the **Mengen und Preise** card beside the two per-head prices,
      as a euro field (`type=text inputMode=decimal`, German comma), `name`/`id` = `priceCap`
- [ ] **Leaving it empty saves no cap.** The field's own hint says so, in the dictionary, not in the
      component
- [ ] `src/i18n/de.ts` gains `settings.fields.priceCap` and `settings.errorFields.priceCap`
      (`Maximalpreis je Ausgabe`), and `settings.prices.hint` is reworded to state both halves of the
      rule: the price is per head, and the Maximalpreis is the most a household pays
- [ ] The Zod schema in `actions.ts` gets an **optional** euro transform: a field that trims to `""`
      becomes `null`; anything else goes through `parseEuros` and is refused with
      `de.settings.errors.notAnAmount` if it is not an amount
- [ ] A refused save keeps what was typed in this field like every other (`SubmittedSettings` gains
      `priceCap`, `formValues` reads it, `shownValue` restores it) — the §4.2d defect must not
      reappear for the new field
- [ ] The stored value renders as `formatEuroAmount(cap)`, and an absent cap renders as an **empty
      field**, never as `0,00` — the two must stay distinguishable on screen
- [ ] A rejected cap marks the field: `InvalidSettings("priceCap")` already carries the field name and
      the name is spelled identically on both sides, so no `INPUT_NAME` entry is needed
- [ ] **No cross-field validation.** A cap below `pricePerGrownUp` is unusual but coherent and is
      saved without complaint
- [ ] Verify in browser using the `playwright-cli` skill — read the accessibility snapshot, not only
      the screenshot: the new field must be a named textbox, and the hint must reach it via
      `aria-describedby` rather than being nested inside the label

### US-26.6: The Änderungsverlauf reads a cap change (presentation)

**Description:** As a staff member, I want `Maximalpreis: 5,00 € → 6,00 €` in the history, and to see
plainly when a cap was introduced or removed.

**Acceptance Criteria:**

- [ ] `describeChange` in `src/app/einstellungen/page.tsx` handles the `priceCap` case: both sides
      formatted with `formatEuros`, and a `null` side rendered as a German phrase from the dictionary
      (`de.settings.prices.noCap` — `kein Maximalpreis`)
- [ ] Introducing a cap reads `Maximalpreis je Ausgabe: kein Maximalpreis → 5,00 €`; removing one
      reads the reverse
- [ ] The read-only summary line for each version states the cap alongside the two per-head prices,
      in the same `Label: Wert` form the existing values use
- [ ] The `switch` stays exhaustive — no `default` branch added to silence the compiler
- [ ] Verify in browser using the `playwright-cli` skill

### US-26.7: The live household editor respects the cap (presentation)

**Description:** As a staff member editing a household, I want the price that updates as I type to be
the price the counter will charge.

**Acceptance Criteria:**

- [ ] `AllowanceValues` in `src/app/kunden/[id]/household-editor.tsx` picks up `priceCap` through the
      widened `PriceValues`, and `src/app/kunden/[id]/page.tsx` passes `settings.priceCap` into the
      `policy` object it hands the client component
- [ ] Adding a fifth member to a household already at the cap leaves the price unchanged while the
      portions rise — the two derivations are independent and only one of them is capped
- [ ] Verify in browser using the `playwright-cli` skill: type a household over the cap and confirm
      the previewed price matches what the customer record shows after saving

### US-26.8: E2E — the cap holds from the settings screen to the counter

**Acceptance Criteria:**

- [ ] `tests/e2e/settings.spec.ts`: set a Maximalpreis, save, reload, and assert the field shows it
      back; clear it, save, and assert the field is empty and the history names the removal
- [ ] A spec (extending `tests/e2e/portions.spec.ts` or a sibling) registers a household of 4
      grown-ups and 3 children under the seeded policy and asserts the counter screen, the customer
      record and the customer list all state **5,00 €** and not 11,00 €
- [ ] The same household under a cleared cap states 11,00 € — proving the cap is read, not hard-coded
- [ ] Attendance recorded for the capped household writes a distribution record whose `priceCents` is
      the capped amount, and the record still reads 5,00 € after the cap is later raised to 6,00 €
      (historical pricing intact)
- [ ] Run with the dev server stopped — a live port 3000 fails the suite for the wrong reason

### US-26.9: The documents say what FD charges

**Acceptance Criteria:**

- [ ] `docs/domain_analysis.md` — the `Price` row of the vocabulary table states the cap as part of
      the definition, and the distribution-day walkthrough step 7 mentions it
- [ ] `docs/user_stories_mvp.md` — US-07's derivation and US-14's list of editable values both name
      the Maximalpreis
- [ ] `docs/technical_documentation.md` — §on the settings model and the `priceFor` derivation state
      the cap, including why it is nullable
- [ ] No document still claims the price is _only_ the per-head sum

## Functional Requirements

- **FR-1:** The system must hold an optional maximum price per distribution, `priceCap`, as integer
  cents or absent, on every settings version.
- **FR-2:** The price a household owes must be
  `min(grownUps × pricePerGrownUp + children × pricePerChild, priceCap)` when a cap is configured,
  and the unmodified sum when it is not.
- **FR-3:** An absent cap and a cap of `0` must be distinct, both storable, and distinguishable on
  the settings screen (empty field vs `0,00`).
- **FR-4:** A cap must be a non-negative whole number of cents; anything else is refused by
  `createSettings` with `InvalidSettings("priceCap", …)` and nothing is written.
- **FR-5:** The system must not refuse a cap on the grounds of its relation to any other value — a
  cap below the price of a single grown-up is a legal configuration.
- **FR-6:** A saved cap must be in force immediately, and the superseded version kept, exactly as
  every other policy value is (US-14, FR-1).
- **FR-7:** A change to the cap must appear in the audit entry's changed-field list and in the
  Änderungsverlauf diff, including introduction (`null` → value) and removal (value → `null`).
- **FR-8:** A distribution record must store the capped amount it was priced at, and a later change
  to the cap must not alter what a past distribution reports.
- **FR-9:** The portion allowance must be unaffected by the cap — it caps money, not food.
- **FR-10:** Every surface that shows a price — counter, card, customer list, customer record, the
  record's hand-out history, and the live household editor — must show the capped amount, by virtue
  of deriving it through `priceFor`; none may compute a price of its own.
- **FR-11:** The dev seed must configure a cap of 5,00 €.

## Non-Goals

- **No per-household or per-group cap.** One cap applies to everyone. A household that FD wants to
  charge differently is a conversation at the counter, not a data model.
- **No cap on the portion allowance.** Portions already flex physically at the counter and are
  deliberately outside the software (US-07).
- **No second cap** — no floor, no minimum price, no "cap only above N heads" threshold.
- **No explanation of the cap on the price displays.** The counter, card, list and record show the
  amount owed and nothing else: no struck-through uncapped figure, no `Maximalpreis` marker, no
  tooltip. Decided deliberately — the number on screen is the number to take.
- **No cross-field validation** between the cap and the per-head prices, and no warning banner when
  the cap makes the per-head prices irrelevant.
- **No recalculation of existing distribution records.** Records written before the cap existed keep
  the price they were written with; that is what a historical record is for.
- **No scheduling.** A cap cannot be dated forwards or backwards, for the same reason no other
  setting can — a change applies at once.

## Design Considerations

**Where the field goes.** The `Mengen und Preise` card, immediately after `Preis je Kind`, because it
is the third statement about money and reads as the qualifier on the two above it. The card's grid is
twelve columns at `lg` and is currently full — `2 + 2 + 2 + 3 + 3`. Adding a sixth field means
re-spanning the row; `2 + 2 + 2 + 2 + 2 + 2` fills it exactly and keeps the three money fields the
same width as each other. Below `lg` the spans stop applying and the fields fall into two columns as
they already do.

**The empty field is the affordance.** No checkbox, no "Maximalpreis aktiv" toggle beside the amount.
A toggle would introduce a second control that can contradict the first (a cap of 5,00 € with the
toggle off), and staff would have to know which one wins. An empty field means no cap, the hint under
the group says so, and there is exactly one thing to change.

**`0,00` must never stand in for empty.** `formatEuroAmount(0)` is `0,00`, so the renderer has to
branch on `null` before formatting — an easy line to lose, and losing it turns "no cap" into "free for
everyone" on the next save. The e2e spec in US-26.8 asserts the empty field precisely because the
defect would otherwise be silent.

**Wording.** `Maximalpreis je Ausgabe` rather than bare `Maximalpreis`, because the settings screen
also holds per-head prices and the distinguishing fact is that this one is per household per
distribution. The German for the absent state is `kein Maximalpreis`, used in both the field hint and
the history diff so the same idea is not named two ways.

## Technical Considerations

**The change is small because the derivation is already single.** `priceFor` is called from exactly
two places — `describeAllowance` (application, feeding counter, card, list, record and attendance)
and `household-editor.tsx` (the browser-side live preview). Both are listed above. Any new caller
that computes a price by multiplying prices by counts itself is a bug, and the architecture ESLint
rules will not catch it — this is the one thing review has to watch.

**`Cents | null` over `Cents | undefined`.** The value crosses a Prisma boundary where the column is
nullable and returns `null`, and a server-component boundary where it is serialised. One spelling
end to end avoids an `?? null` in every adapter.

**`Math.min` is safe here.** Both operands are validated non-negative integers, so no rounding, no
`NaN`, no float. The domain must not use `Math.max` anywhere near this — a cap is a ceiling.

**The migration is a regeneration, not an addition.** FD holds no real data, so `CLAUDE.md`'s
pre-release rule applies and the init migration is rewritten. The two things that do not survive
`prisma migrate dev` on their own are the hand-written partial unique index and the audit that
`schema.test.ts` performs over the generated SQL; both are checked by tests, so a lost line fails CI
rather than production.

**Coverage.** `domain/` and `application/` are gated at 100%. The `null` branch of `priceFor` and both
`null` sides of `diffSettings` need their own tests, which the story list already names.

## Success Metrics

- A household of 4 grown-ups and 3 children, under FD's seeded policy, is quoted **5,00 €** on every
  screen that names a price — the number FD actually collects.
- Changing the cap takes one field and one save, with no deploy, and the previous cap remains
  readable in the Änderungsverlauf.
- A distribution recorded under a 5,00 € cap still reports 5,00 € after the cap changes.
- No screen in the codebase derives a price except through `priceFor`.

## Open Questions

- Is 5,00 € the cap for both groups and every distribution, or does FD ever suspend it (e.g. a
  Christmas distribution)? Assumed **always in force** here; a suspension would be a settings edit on
  the day, which the versioning already supports.
- Does the cap apply to the price at all, or also to anything else FD charges for (deposits, bags)?
  Assumed price only — the software knows of no other charge.
- Should the counter ever surface that the cap applied? Deliberately not, per the decision recorded
  under Non-Goals. Worth revisiting only if staff report distrusting the figure.
