# PRD: Members' ages while a household is registered (US-43)

> **Source:** a request from DF, refined with DF's developer on 2026-11-07. Every open point was
> settled in that conversation; §Open Questions is empty on purpose.

## Introduction

When staff register a new household on `/kunden/neu`, they type each member's birthdate into the
**Haushalt** table, and the customer often wants to know right away how old someone is, for example
whether a child still counts as a child. Today staff have to work the age out in their heads. The
household editor on the customer record (`/kunden/[id]`) already has an **Alter** column beside the
birthdate. The registration form does not.

This story adds the same column to the registration form, filled in as soon as a birthdate has been
typed in full. It also fixes a latent fault the request brought to light: a birthdate in the future
(a typo such as `2062`) is expected to make the record's household editor fail while rendering,
because `ageInYears` throws `BirthDateInFuture` and nothing catches it.

## Goals

- On `/kunden/neu`, every household row shows the member's age as soon as its birthdate is a valid,
  complete day — the same moment the „Erwachsene / Kinder“ counts update.
- The column looks and behaves exactly like the **Alter** column in the record's household editor.
- A birthdate in the future never breaks either screen. It shows „—“ until the save refuses it.

## User Stories

### US-43.1: A future birthdate shows „—“ in the record's household editor

**Description:** As a staff member correcting a household on the customer record, I want a mistyped
future birthdate to leave the age blank rather than break the page, so I can just fix the typo.

**Context:** `src/app/kunden/[id]/household-editor.tsx` calls `ageInYears(day, today)` directly while
rendering (around line 326). `typedDay` already turns an incomplete or invalid date into `null`, but
it accepts a day after `today`, and `ageInYears` throws `BirthDateInFuture` for that.

**Acceptance Criteria:**

- [ ] Typing `01.01.2099` into a member's birthdate on `/kunden/[id]` shows „—“ in that row's
      **Alter** cell, and the page stays usable.
- [ ] The derived figures above the table (Erwachsene, Kinder, Preis, Eier) behave as they do today
      for such a row. `derived` already catches the throw, so do not change it.
- [ ] Saving with that date is still refused at the birthdate field, as today.
- [ ] The mapping from a typed birthdate to the displayed age lives in **one** place, and US-43.2
      reuses it (see Technical Considerations).
- [ ] An e2e test in `tests/e2e/customer-record.spec.ts` covers the case: a future birthdate typed in
      the household editor gives „—“ in that row's age cell.
- [ ] This is a `fix(app)` commit of its own, separate from US-43.2.
- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass.
- [ ] Verified in the browser with the `playwright-cli` skill.

### US-43.2: An Alter column in the registration form's household table

**Description:** As a staff member registering a household, I want each member's age to appear beside
their birthdate as soon as I have typed it, so I can tell the customer straight away without working
it out.

**Acceptance Criteria:**

- [ ] The **Haushalt** table on `/kunden/neu` has a column headed **Alter**
      (`de.customers.record.ageColumn`) between **Geburtsdatum** and the column with the remove ✕.
      Its header carries `whitespace-nowrap`, as on the record.
- [ ] Each row's age cell shows `de.customers.card.memberAge(age)`, i.e. „1 Jahr“ or „N Jahre“, with
      „0 Jahre“ for a child under one.
- [ ] The age appears **as soon as the birthdate is a complete, valid `TT.MM.JJJJ`**, without leaving
      the field: on the same keystroke that updates the „Erwachsene / Kinder“ counts. Leaving the
      field shows the same value.
- [ ] While a birthdate is empty, incomplete (`11.0`), invalid (`31.02.1990`) or in the future, the
      cell shows „—“. Nothing else changes in the row: no red border and no message until the save.
- [ ] Row 1, the customer's own row (read-only, mirrored from **Person & Anschrift**), also shows the
      age. It updates live while the birthdate in **Person & Anschrift** is typed.
- [ ] Adding a row shows „—“ in the new row. Removing a row removes its age, and the ages of the rows
      below move up with them.
- [ ] When the form is prefilled (re-registration from the archive, or promotion from the waiting
      list), every row shows its age immediately on page load.
- [ ] The age is computed against the form's `proposal.today` (the injected clock, read on the
      server), never a `new Date()` in the browser.
- [ ] The cell matches the record editor's: `align-top whitespace-nowrap tabular-nums`, with the text
      inside `<div className={ROW_TEXT}>` so it lines up with the inputs when a row carries an error
      mark.
- [ ] The age cell has a stable test id, the same scheme on both screens (e.g. `member-age-${index}`),
      added to the record editor too if it lacks one.
- [ ] e2e in `tests/e2e/registration.spec.ts`, each asserted **without leaving the page**: - a member's birthdate typed in full shows the expected age in that row before the field
      loses focus; - a birthdate on today's date 13 years ago shows „13 Jahre“, and the day after it shows
      „12 Jahre“ (the boundary the counts depend on), computed from the test clock; - an incomplete date shows „—“; - the customer's own row shows the age typed in **Person & Anschrift**.
- [ ] Both engines are green: `npm run test:e2e` and `npm run test:e2e:webkit`.
- [ ] No new German literals: both strings already exist in `src/i18n/de.ts`.
- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass.
- [ ] Verified in the browser with the `playwright-cli` skill: register a household of four, then
      check the accessibility snapshot and a screenshot at desktop and narrow widths. The table must
      not grow a horizontal scrollbar it did not have before.

## Functional Requirements

- FR-1: The registration form's household table must show an **Alter** column between
  **Geburtsdatum** and the remove control.
- FR-2: A row's age must be `ageInYears(birthDate, today)` from `src/domain/customer/householdComposition.ts`,
  with `today` the server-provided day the form already uses for the counts.
- FR-3: The age must update whenever the row's birthdate text changes and parses as a valid day not
  after `today`. Otherwise the cell must show „—“.
- FR-4: The customer's own row must derive its age from the birthdate in **Person & Anschrift**,
  since that is the value the row mirrors.
- FR-5: A birthdate after `today` must never cause a render error, either on `/kunden/neu` or in the
  household editor on `/kunden/[id]`.
- FR-6: The display must be identical on both screens: same heading, same wording, same „—“, same
  cell styling.

## Non-Goals

- **No age beside the birthdate in Person & Anschrift.** The customer's age is in row 1 of the
  household table. A second copy would put the same figure on screen twice.
- **No months for babies.** Under one year reads „0 Jahre“, as on the record. Only „under 13“
  matters for the classification.
- **No highlighting of children** (badge, colour, „Kind“ label). The Erwachsene/Kinder counts below
  the table already say it, and the record does not highlight either.
- **No new validation or error message.** A future or invalid birthdate is still refused by the save,
  with the message it has today.
- No change to how ages are calculated, to the 13-year rule, or to the counts.
- No change to the read-only household table on the record (not in edit mode), which already shows
  the age.
- No change to `docs/handout/`.

## Design Considerations

- Reuse the record editor's column verbatim. It is the same table on the same kind of data, so it
  takes the same shape (`ui_styling_guide.md`). No hint text: per CLAUDE.md „Don't explain the screen
  on the screen“, the column heading is enough.
- „—“ for an underivable age is the established convention on the record editor.
- The narrow first column, the inputs and the ✕ keep their widths. Check that the new column does not
  squeeze the name inputs on a laptop-width window (DF run a MacBook).

## Technical Considerations

- **One mapping, not two.** Both screens need „typed text + today → age or nothing“. Today
  `household-editor.tsx` has `typedDay` and `registration-form.tsx` has its own `datedMembers` parse,
  each catching the parser's refusal. Put the shared piece beside the other shared row helpers in
  `src/app/kunden/household-row.ts` (where `EMPTY_ROW`, `ROW_TEXT` and `isCustomerRow` live), as a
  helper returning the age as a `number`, or `null` for an empty, invalid or future date. Better
  still, make it a small shared `AgeCell` component that both tables render. Either way it catches
  both `InvalidCalendarDay` and `BirthDateInFuture`. The age arithmetic stays in the domain
  (`ageInYears`). The app layer only decides what to _show_ when there is none.
- If the helper is pure and non-trivial enough to test, a unit test beside it should name the rules
  (`shows no age for a birthdate after today`, `shows no age while the date is half-typed`).
  Otherwise the e2e tests above carry it.
- The form already derives `members` (row 1 swapped for the Person & Anschrift values) and
  `proposal.today`. Render the age from `members`, not from `rows`, so FR-4 holds without special
  handling.
- No schema, migration, use case, port or audit entry is involved. The age is derived on every
  render and never stored (CLAUDE.md „Derive, don't store“).
- No ADR: this repeats an existing pattern on a second screen.
- Commit order: US-43.1 (`fix(app): …`) first, then US-43.2 (`feat(app): …`). If extracting the
  shared helper is done before either, it is a `refactor(app): …` commit of its own.

## Success Metrics

- Staff can read every member's age on `/kunden/neu` without calculating it, while the customer is
  still at the desk.
- No new error states and no regressions: both e2e engines green.

## Open Questions

None. All points were settled on 2026-11-07:

1. Timing: as soon as the date is complete, like the record editor (rather than only on leaving the
   field).
2. Placement: an **Alter** column in the household table, including the customer's own row, and not
   in Person & Anschrift.
3. Underivable age: „—“.
4. Future birthdate: „—“, and the record editor is fixed as well (US-43.1).
5. Under one year: „0 Jahre“.
6. No highlighting of children.
7. Prefilled forms show ages immediately.
8. Story number US-43, PRD in `tasks/`.
