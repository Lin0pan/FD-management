# PRD: „Letzte Ausgabe" instead of „Erinnerungen" in the customer list (US-45)

> **Source:** a request from DF, refined with DF's developer on 2026-11-08. Every open point was
> settled in that conversation; §Open Questions is empty on purpose. Small enough to be written by
> hand rather than as a Ralph batch, so there is no `scripts/ralph/prds/` file for it.

## Introduction

The big table under **Kunden verwalten** (`/kunden`) shows each household's reminder count in a
column „Erinnerungen". DF have said they do not need that column there. What they want to read off
the register instead is when each household last **received food**. This story replaces the one
column with the other, on `/kunden` only.

## Goals

- `/kunden` shows a column **„Letzte Ausgabe"** in place of „Erinnerungen", holding the date of the
  household's latest hand-out.
- The reminder count stays everywhere else it is shown today: the household list under the counter
  mask on `/ausgabe`, the counter mask itself, the customer record (`/kunden/[id]`) and the session
  detail (`/ausgabetermine/[id]`).

## User Stories

### US-45.1: The customer list states each household's latest hand-out

**Description:** As a staff member reading the register, I want to see the date each household last
collected food, so I can tell at a glance who has been coming and who has not.

**Acceptance Criteria:**

- [ ] `listCustomers` gives every row a `lastHandoutAt: Date | null`: the instant of the household's
      latest hand-out across all sessions, or `null` if they have none. It counts hand-outs only.
      A reminder logged without a hand-out does not count.
- [ ] A hand-out written in the session running now counts at once, without the session ending.
- [ ] A hand-out that was removed no longer counts. The date falls back to the one before, or to
      `null` if there is none.
- [ ] Archived and blocked households get their date by the same rule as active ones.
- [ ] The value is read fresh at every request and never stored. No schema change, no migration.
- [ ] The whole list reads the latest hand-outs in **one** query, not one per row (see Technical
      Considerations).
- [ ] Application tests against fakes are written first, one named test per rule above, e.g.
      `states the latest hand-out, not the first`, `is empty for a household never served`,
      `ignores a session in which the household was only reminded`.

### US-45.2: „Letzte Ausgabe" replaces „Erinnerungen" on `/kunden`

**Description:** As a staff member on `/kunden`, I want the „Letzte Ausgabe" column where
„Erinnerungen" stood, because the reminder count is not something DF read off the register.

**Acceptance Criteria:**

- [ ] On `/kunden` the last column is headed **„Letzte Ausgabe"** (from `src/i18n/de.ts`). There is
      no „Erinnerungen" column.
- [ ] A served household's cell shows the **date only**, `TT.MM.JJJJ` via `germanDate`, with no
      time, and today's date stays a date, never „heute".
- [ ] A household never served shows „–", muted like today's reminder dash
      (`text-muted-foreground`).
- [ ] No highlighting, badge or colour for a date long past.
- [ ] The household list under the counter mask on `/ausgabe` is **unchanged**: it keeps
      „Erinnerungen" and does not gain „Letzte Ausgabe".
- [ ] The table still fits the 1100px window (`tests/e2e/layout.ts`) without a horizontal scroll.
- [ ] e2e in `tests/e2e/` (the customer-list spec): a household served in an ended session shows that
      date; one never served shows „–"; the counter's household list still shows „Erinnerungen".
- [ ] Looked at on `/kunden` with the `playwright-cli` skill (accessibility snapshot and
      screenshot), as `docs/guideline/ui_styling_guide.md` §11 describes.

### US-45.3: The handout says what changed

**Description:** As DF, I want the printed handout to describe the screens as they are.

**Acceptance Criteria:**

- [ ] `docs/handout/betriebsanleitung.md` §„Der Ausgabe-Bildschirm" no longer claims the counter's
      list has „denselben Spalten wie unter **Kunden verwalten**". It says the counter list shows
      **Erinnerungen** where Kunden verwalten shows **Letzte Ausgabe**, plus **Heute**, in German and
      in the handout's tone.
- [ ] No other handout passage changes. §„Frühere Ausgaben nachschlagen" describes the session
      detail, which keeps its reminder column.

**Definition of done for all three** (beside `tasks/README.md`'s): both e2e engines green
(`npm run test:e2e` and `npm run test:e2e:webkit`).

## Functional Requirements

- FR-1: The latest hand-out is the latest by instant over every hand-out record the household holds,
  in any session, running or ended. It is computed by the existing pure rule `lastHandoutAt`
  (`src/domain/distribution/attendance.ts`) or something equal to it, so the list and the counter
  mask cannot disagree about one household.
- FR-2: Only hand-out records count. Reminder logs (`ReminderLog`) and campaign-reminder ticks do not.
- FR-3: The cell renders `germanDate(lastHandoutAt)` or the existing „–"
  (`de.customerList.table.noReminders`, renamed if it now serves both columns, see Technical
  Considerations).
- FR-4: The column replaces „Erinnerungen" on `/kunden` and nowhere else.
- FR-5: Reading the list stays a read: no audit entry (as US-15, FR-7).

## Non-Goals

- **No sorting or filtering** by the new column, e.g. „seit X nicht da". That is a later requirement
  of its own.
- **No highlighting** of households absent for long, and therefore no threshold setting.
- No change to the counter's household list, the counter mask, the customer record or the session
  detail. Each keeps its reminder count.
- No change to how reminders are counted, logged or reset.
- No time of day in the cell, and no „heute".

## Technical Considerations

- **The shared columns.** `src/app/kunden/customer-cells.tsx` renders the Kundenliste's columns for
  both `/kunden` and the counter's household list, so the two cannot drift. The ninth column is now
  the one place they differ. The suggested cut: `CustomerHeads`/`CustomerCells` keep the eight
  shared columns, and each screen appends its own last column, as `session-households.tsx` already
  appends „Heute". Update the file's header comment, which says „nine columns", and say there why
  the last column is per-screen (US-45).
- **One query.** `DistributionRecordRepository` (`src/application/ports.ts`) has `listForCustomer`
  (one round trip per household) and `summariseBySession`. Add one aggregate in the same spirit,
  e.g. `latestHandoutByCustomer(): Promise<ReadonlyMap<number, Date>>` (`MAX(date)` grouped by
  customer). A household **absent** from the map was never served, mirroring the convention
  `summariseBySession` documents. Document it once, on the port. The Prisma adapter gets a thin
  integration test against a throwaway SQLite file. The application fake implements it off its
  stored records.
- **Who pays for the query.** `read-counter-roster.ts` builds its rows from `CustomerListRow`.
  Whether the counter roster also carries the field, unused, or `listCustomers` adds it in a
  `/kunden`-only shape is the implementer's choice. Keep the roster from doing a query it does not
  render, if that comes cheaply.
- **Strings.** Add `de.customerList.table.lastHandout: "Letzte Ausgabe"`. `reminders` stays for the
  counter list. `noReminders` („–") is now also the never-served dash. Either rename it to something
  neutral (e.g. `none`) or add a second key; update its comment, which explains the dash only for
  reminders.
- **Width.** „Letzte Ausgabe" over a ten-character date is wider than „Erinnerungen" over one digit.
  `tests/e2e/layout.ts` is what decides whether it still fits at 1100px.
- No domain change beyond reusing `lastHandoutAt`, no schema change, no migration, no audit entry, no
  ADR. Chapter 5 (building-block view) is checked for a mention of the shared nine columns and
  updated if it has one.

## Open Questions

None. All points were settled on 2026-11-08:

1. Scope: `/kunden` only. The counter's household list keeps „Erinnerungen".
2. It means _received food_: hand-outs only. Heading „Letzte Ausgabe", as on the counter mask.
3. DF explicitly do not need the reminder count on `/kunden`. It stays everywhere else.
4. Never served: „–". Date only. Archived households the same.
5. Just the column. Filtering comes in a future requirement.
6. No highlighting.
7. Written by hand with this PRD, not as a Ralph batch.
