# ADR-014 — Store the egg allowance as versioned threshold rows

- **Status:** Accepted
- **Date:** 2026-08-25
- **Deciders:** the maintainer, with DF on the rule itself and on it being theirs to change

## Context

Alongside the food, DF hand every household a quantity of eggs, and how many depends on how large
the household is. Their rule today is a staircase: from 8 people 18 eggs, from 5 people 12, from 3
people 6, and below that none. It counts **heads of any age** — an infant is a person — so it is not
the grown-up/children pair the price is derived from, and a 13th birthday leaves it where it was.
The eggs are free: they touch neither the price nor the _Maximalpreis_ and nothing about them is
written to a distribution record.

Every other policy value DF owns is one number on a `SettingsVersion` row
([ADR-005](005-keep-business-rules-as-dated-append-only-settings-data.md)), and the standing rule
that follows from it is that nothing may hard-code a price or a threshold. The egg rule is the first
policy value that is not a number but a **list** — rows added and removed, and legitimately emptied,
because "no eggs for anyone" is a setting DF may choose. So the question this ADR answers is not
_whether_ the rule is configurable, but what shape a list-valued setting takes in a schema where
every value so far has been a typed column. Whatever shape is chosen is the precedent the next
list-valued setting will follow, which is what makes it worth recording
([goal 1 — legibility over five-plus years](../01-introduction-and-goals.md#quality-goals)).

The rule also carries two invariants of its own: no two rows may name the same threshold, and a
higher threshold must award strictly more eggs than the one below it. A configuration breaking
either is refused with nothing saved.

## Considered options

- **A child table of `SettingsVersion` — `EggAllowanceRow(minPersons, eggs)`** — chosen. Typed
  integer columns, `@@unique([settingsVersionId, minPersons])` in the database, and the staircase
  checked in `createEggRule` where every other settings invariant lives.
- **A JSON column on `SettingsVersion`** — rejected. It would be one opaque string the schema could
  not document and the database could not constrain: no types on the two numbers, no uniqueness on
  the threshold, and a hand-edited value reaching the domain as `unknown`. It is also out of step
  with a schema in which every value is a typed column that carries its argument in a `///` comment
  — the reader would have to open the application to find out what is in it.
- **Three fixed columns, one per step of DF's rule** — rejected, and the more tempting of the two:
  it is the smallest change, and DF's rule has exactly three steps. That is the trap. Three steps is
  DF's _current configuration_, not a fact about egg allowances, and pinning it into the schema would
  make a rule change into a migration — precisely what [ADR-005](005-keep-business-rules-as-dated-append-only-settings-data.md)
  and US-14 exist to prevent. A fourth step, or an emptied rule, would need a developer.
- **A single number of eggs per head** — rejected: it is not DF's rule. Their steps are deliberately
  coarse (a household of 3 and one of 4 both get 6), because eggs come in boxes and the staircase is
  what they hand over in practice.
- **Both invariants in the domain only** — rejected for the duplicate-threshold half. It is the one
  of the two that a database can state, and
  [strategy 5](../04-solution-strategy.md#5-the-database-is-the-final-authority-on-every-hard-invariant)
  says a rule that can be a constraint is one. The staircase is a comparison between neighbouring
  rows and has no constraint to be, so it stays in the domain alone.

## Decision

The egg rule is a set of `EggAllowanceRow` rows hanging off each `SettingsVersion`, written with the
version and never edited; the database enforces one row per threshold per version, and
`src/domain/policy/eggs.ts` owns the staircase rule, the sort and the lookup — a household receives
the eggs of the highest threshold its head count reaches, and `0` when it reaches none.

## Consequences

- DF add, change and remove steps on `/einstellungen` without a developer, and an emptied rule is a
  configuration rather than an error — a version with no rows is never read as "not configured".
- A rule is **sorted as part of being constructed**, so staff type rows in any order and every reader
  — the check, the screen, the history — sees one order. `eggsFor` needs no search: it walks the
  sorted rule and keeps the last row reached.
- The two refusals are stated where they can be: the duplicate threshold by
  `@@unique([settingsVersionId, minPersons])` _and_ by the domain, the staircase by the domain alone.
- A past distribution's egg count can still be answered, because the version in force that day still
  carries its rows.
- The cost is that a settings version is no longer one row. `append` writes the rows as a nested
  create, `listVersions` includes them ordered by `minPersons`, and a test that clears the settings
  tables must delete the children first — `clearSettings` in
  `src/infrastructure/prisma/test-support.ts` is the sanctioned way, in the same spirit as
  `clearRegister` ([ADR-010](010-never-hard-delete-a-record-archive-and-let-the-database-refuse.md)).
- The Änderungsverlauf gained a shape it did not have: the egg rule is the only `SettingsChange`
  without a `from`/`to` pair, because a list's change is a set of row changes — which rows were
  added, removed, and which moved from how many eggs to how many.
- **What would make us revisit it.** A second list-valued policy value with the same shape would make
  a generic "settings list" table tempting; it should be resisted until there is a third, because two
  typed tables read better than one polymorphic one at this size. A rule that had to vary by
  something other than head count — a group, a season — would be a different decision, not an extra
  column here.

## More information

- [Chapter 8 — configuration as data](../08-crosscutting-concepts.md#configuration-as-data) and the
  `SettingsVersion` diagram above it
- [ADR-005](005-keep-business-rules-as-dated-append-only-settings-data.md) — the append-only settings
  versions this hangs off
- `src/domain/policy/eggs.ts`, `src/application/allowance/describe-allowance.ts`,
  `prisma/schema.prisma` (`EggAllowanceRow`)
- [`tasks/prd-us-28-egg-allowance.md`](../../../tasks/prd-us-28-egg-allowance.md)
