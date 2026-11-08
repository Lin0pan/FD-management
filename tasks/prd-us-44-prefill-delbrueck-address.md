# PRD: PLZ and Ort start out as Delbrück (US-44)

> **Source:** a request from DF, refined with DF's developer on 2026-11-08. Every open point was
> settled in that conversation; §Open Questions is empty on purpose. Small enough to be written by
> hand rather than as a Ralph batch, so there is no `scripts/ralph/prds/` file for it.

## Introduction

DF is the food bank of Delbrück, and Delbrück has one postcode. Almost every household DF registers
or puts on the waiting list lives at „33129 Delbrück“, so staff type the same two values for nearly
every new person. This story starts both address fields out with those values on the two forms where
a new person is written down. Staff type over them for the rare household from somewhere else.

## Goals

- A new registration on `/kunden/neu` opens with **PLZ** `33129` and **Ort** `Delbrück`.
- The „Auf die Warteliste setzen“ form on `/warteliste` opens the same way, and starts that way
  again for the next applicant after each save.
- A form filled in from an existing record keeps that record's address.

## User Stories

### US-44.1: The registration form starts out in Delbrück

**Description:** As a staff member registering a household, I want PLZ and Ort already filled with
Delbrück, so I only type the street and house number for almost every household.

**Acceptance Criteria:**

- [ ] On `/kunden/neu`, with no pre-fill, `#zip` holds `33129` and `#city` holds `Delbrück`, as real
      values (not placeholders), which a save submits unchanged.
- [ ] Both fields are editable as before. Typing over them saves what was typed.
- [ ] Clearing either field and saving is refused with the existing blank-field message, as today.
- [ ] A re-registration pre-filled from the archive (US-11.4) shows the **archived** address, not
      Delbrück.
- [ ] „Leer beginnen“ after such a pre-fill returns the form to its fresh state, so PLZ and Ort show
      Delbrück again.
- [ ] Registering an applicant off the waiting list (`/warteliste/[entryId]/registrieren`, US-12.4)
      shows the **applicant's** address, not Delbrück.
- [ ] e2e in `tests/e2e/registration.spec.ts` and `tests/e2e/reregistration.spec.ts` covers each of
      the above. The existing assertion that „Leer beginnen“ leaves `#city` empty is updated.

### US-44.2: The waiting-list form starts out in Delbrück

**Description:** As a staff member putting someone on the waiting list, I want the same Delbrück
start, so writing down one applicant after another stays quick.

**Acceptance Criteria:**

- [ ] On `/warteliste`, the „Auf die Warteliste setzen“ form opens with `#zip` `33129` and `#city`
      `Delbrück`.
- [ ] After an applicant is saved, the form that clears for the next one shows Delbrück again, not
      blank fields.
- [ ] A refused save leaves PLZ and Ort as they were typed, as every other field is left today.
- [ ] e2e in `tests/e2e/waiting-list.spec.ts` covers the fresh form and the form after a save.

**Definition of done for both** (beside `tasks/README.md`'s): both e2e engines green, and both
screens looked at with the `playwright-cli` skill.

## Functional Requirements

- FR-1: The default is one constant, `33129` / `Delbrück`, read by both forms.
- FR-2: The default applies only where a form starts **blank**. Wherever a form is filled in from a
  record (archive or waiting-list entry), that record's address wins.
- FR-3: Nothing changes about what is saved or validated. PLZ and Ort stay required text.

## Non-Goals

- **Not a setting.** The software is built for DF alone, DF will stay in Delbrück, and the default
  decides nothing: the save still checks the fields, so ADR-005's rule that policy values are data
  does not reach it. Hard-coded on purpose.
- **No select-on-focus or other overwrite aid.** The other 1% clear the field like any other field.
- **No hint text** on either screen (CLAUDE.md „Don't explain the screen on the screen“): the value
  in the box says it.
- No change to the customer record's address editor (`/kunden/[id]`), which always edits an existing
  address.
- No change to the seed, to existing records, or to `docs/handout/`.

## Technical Considerations

- The registration form starts from `initialDetails(draft)` in
  `src/app/kunden/neu/registration-form.tsx`. The waiting-list form starts from `BLANK` in
  `src/app/warteliste/add-applicant-form.tsx`, and its `key` remount after a save starts from it
  again, so the second criterion of US-44.2 comes with the first.
- The constant lives in `src/app/`, beside the helpers both forms already share. It is a value of
  the app layer: no domain, application, schema, migration, port or audit change is involved.
- „33129 Delbrück“ is a town, not a person's address, so asserting it in a test does not break the
  synthetic-data rule.
- No ADR, and no arc42 chapter becomes untrue (checked against ADR-005 and chapter 8 „Configuration
  as data“).

## Open Questions

None. All points were settled on 2026-11-08:

1. Scope: `/kunden/neu` **and** the waiting-list form.
2. Hard-coded, not a setting.
3. A real value, not a placeholder.
4. No select-on-focus.
5. Written by hand with this PRD, not as a Ralph batch.
