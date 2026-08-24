# ADR-005 — Keep business rules as dated, append-only settings data

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** the maintainer, with DF on which values are theirs to change

## Context

Every number in DF's process is a policy they set and change: the customer quota `N`, the price per
head, the cap on what one household pays, which weekday the distribution runs and which week of the
two-week cycle is which colour. None of them is a fact about the world; all of them are decisions DF
revisits when reality changes — a price rises, the quota moves.

A hard-coded constant would put each of those behind a developer and a deploy, which for a charity
with no IT staff means "not changeable". At the same time a distribution record stores only a `paid`
flag and never an amount, so the only way to answer _what did that household owe last March_ is to
know which policy was in force then.

## Considered options

- **Append-only, clock-stamped versions of the whole settings set** — chosen.
- **Hard-coded constants** — rejected: DF cannot change them, and the values were not even fully
  known when the system was designed.
- **A single mutable settings row, updated in place** — rejected. Overwriting the old price destroys
  the only record of what a past distribution cost.
- **A price table per household size** — tried and reversed on 2026-07-22 (`d3ecc88`). It made staff
  enumerate every household size they might meet, and an unmet one — nine people — reached the
  counter as an error. Price per head has no such gap.
- **A staff-entered "effective from" date on each change** — tried and reversed (`8552752`). DF
  adjust the numbers when reality changes; dating a change forwards or backwards was a field to get
  wrong rather than a requirement.

## Decision

Policy lives in the `SettingsVersion` table as complete, immutable versions. Saving a change appends
a new version stamped with the instant from the injected clock (`recordedAt`, indexed and
deliberately _not_ unique), and it is in force immediately. Superseded versions are kept as read-only
history. Any rule that needs a policy value resolves the version in force at the relevant instant via
`resolveSettingsAt`, and rows re-enter the domain through `createSettings`, so a hand-edited database
cannot smuggle an invalid policy in.

## Consequences

- DF change their own rules in the UI, and the change is live for the next customer at the counter.
- A past distribution can still be priced, because the version in force that day is still there.
- Nothing in the codebase may hard-code a price or a threshold — that is a standing rule, not a
  one-off.
- The settings screen has to show history, and a wall of eight columns turned out to be unreadable,
  so each version is displayed as a diff against its predecessor (`src/domain/policy/settings-diff.ts`).
- `updateSettings` can refuse a save: the quota may not drop below the number of active customers.
- Two saves in the same millisecond are a concurrency accident, not a business error; the later row
  wins by array position. Acceptable at this many users, and worth knowing.
- The **reminder escalation is deliberately not configurable**. Whether an expired certificate ends
  in archiving is a per-case staff judgement; three reminders is a habit, not a rule, so there is no
  threshold to configure and none was added.

## More information

- [Chapter 8 — configuration as data](../08-crosscutting-concepts.md#configuration-as-data)
- [Chapter 6 — saving a settings change](../06-runtime-view.md#scenario-3--saving-a-settings-change)
- `src/domain/policy/settings.ts`, `src/application/settings/`, `prisma/schema.prisma`
- Commits `378663d`, `d3ecc88`, `e2f0e18`, `8552752`
