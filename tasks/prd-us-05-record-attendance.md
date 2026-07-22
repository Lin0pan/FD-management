# PRD: US-05 — Record Attendance and Payment

> Source story: `docs/user_stories_mvp.md` §US-05 (Tier 1). Depends on **US-04** (lookup and verdict)
> and **US-07** (price). Feeds **US-10** (no-show driven archiving) and the deferred reporting work.

## 1. Introduction

When a customer has been looked up and is clear to serve, one action must record that they showed up
and paid. This is the transaction that turns the app into a record of what actually happened — and,
because distribution history is never overwritten, it is also the raw material for spotting no-shows
(US-10) and for any later reporting.

Payment is a **flag**, not an amount: no money is stored on the record. The amount owed is implied by
the price table in force on that date, which is exactly why US-14 dates its settings versions.

## 2. Goals

- One action records customer, date, showed-up and paid.
- The price that applied is captured on the record for later interpretation.
- Recording twice for the same customer on the same day is impossible.
- Records survive indefinitely — nothing is overwritten week to week.
- A same-day mistake can be corrected.

## 3. User Stories

### US-05.1: `DistributionRecord` rules (domain)

**Description:** As a developer, I need the attendance rules as pure functions so duplicate
prevention and same-day correction are testable without a database.

**Acceptance Criteria:**

- [ ] `src/domain/distribution/attendance.ts` exports `canRecord(existingRecordsForCustomer, today)`
      returning either `OK` or a typed `AlreadyServedToday` error carrying the existing record's date
- [ ] `canCorrect(record, today)` returns true only when `record.date` is the same calendar day as
      `today` — a record from any earlier day is immutable
- [ ] Day comparison is calendar-day based in the local timezone (Europe/Berlin), documented; tested
      across a midnight boundary and across a DST change
- [ ] Pure — `today` is a parameter

### US-05.2: `recordAttendance` use case (application)

**Description:** As a staff member, I want one action that records the hand-out, so the queue keeps
moving.

**Acceptance Criteria:**

- [ ] `recordAttendance(deps, { customerId, paid })` writes one record with the customer's surrogate
      id, `deps.clock.now()`, `showedUp: true`, the `paid` flag, and `priceCents` resolved from the
      settings in force on that date for the customer's derived counts
- [ ] `paid` defaults to `true` and can be passed as `false`
- [ ] Re-invoking for the same customer on the same day rejects with `AlreadyServedToday` and writes
      nothing
- [ ] The use case re-evaluates the counter verdict (US-04.1) before writing and refuses to record
      for `ARCHIVED`, `BLOCKED` or `WRONG_GROUP` — the UI is not the only guard
- [ ] `correctAttendance(deps, { recordId, ... })` amends or deletes a record made **today**; an
      older record rejects with a typed `RecordNoLongerCorrectable` error
- [ ] Both write audit entries (what/when/why, no actor)
- [ ] Tested with fakes and a fake clock, including the same-day-duplicate and next-day-correction cases

### US-05.3: Distribution record persistence (infrastructure)

**Acceptance Criteria:**

- [ ] Prisma model `DistributionRecord`: `id`, `customerId` (FK to `Customer.id`), `date DateTime`,
      `showedUp Boolean`, `paid Boolean`, `priceCents Int`
- [ ] Unique constraint on `(customerId, dateOnly)` — store a normalised date-only column or a
      day-key string so the database, not just the use case, prevents a double record
- [ ] Index on `date` and on `(customerId, date)` for the no-show query (US-10)
- [ ] **No delete cascade from customer archiving** — records outlive status changes and are never
      removed
- [ ] Migration committed; integration test proves the duplicate constraint fires

### US-05.4: Serve action on the counter screen (presentation)

**Description:** As a staff member, I want to confirm the hand-out with one keystroke without leaving
the counter screen.

**Acceptance Criteria:**

- [ ] A prominent German "Ausgabe erfassen" button appears on the counter screen only when the
      verdict permits serving
- [ ] A "paid" checkbox is **pre-checked** and can be cleared before confirming
- [ ] The button is keyboard-reachable and confirms with Enter; on success the screen shows a short
      confirmation and re-focuses the lookup input for the next customer
- [ ] Attempting to record a second time shows "Heute bereits versorgt" with the existing record's time
- [ ] A "correct today's entry" control appears for a record made today, allowing the paid flag to be
      changed or the record to be removed, with a confirmation step before removal
- [ ] Verify in browser using dev-browser skill

### US-05.5: E2E — distribution-day happy path

**Acceptance Criteria:**

- [ ] Playwright spec: fixed clock on a Red distribution day → look up a Red customer → record
      attendance with paid → assert confirmation, and that the customer's record shows today's date
- [ ] Spec attempts a second recording and asserts the German "already served today" message and that
      only one record exists
- [ ] Spec clears the paid flag on a second customer and asserts the record stores `paid = false`

## 4. Functional Requirements

- FR-1: One action must record the customer, today's date, that they showed up, and that they paid.
- FR-2: The record must store the price that applied, read from the price table for the customer's
  current derived counts.
- FR-3: No amount tendered and no separate payment date is stored; payment is a boolean flag.
- FR-4: The paid flag must be pre-set to true and must be clearable by the staff member.
- FR-5: Recording twice for the same customer on the same day must be prevented, with a message
  saying they were already served today.
- FR-6: Distribution records must survive indefinitely and must never be overwritten week to week.
- FR-7: A record created today must be correctable or removable on the same day; older records must be
  immutable.
- FR-8: The use case must re-check eligibility before writing, independently of the UI.

## 5. Non-Goals

- No recording of who served the customer — there is no login.
- No recording of the actual quantity handed out; supply-driven adjustments happen at the counter and
  are out of scope entirely.
- No amount tendered, change given, or payment method.
- No reporting or statistics screens (deliberately deferred; this story just keeps the data).
- No recording of turn-aways or no-shows as events — a no-show is simply the absence of a record.

## 6. Technical Considerations

- `priceCents` is stored on the record **in addition to** effective-from settings. That is deliberate
  redundancy: settings resolve the price historically, but storing it makes a record self-describing
  and any future reporting a single-table read. Document the redundancy so it is not "cleaned up".
- The day-key column is what lets SQLite enforce the one-record-per-day rule; a naive `DateTime`
  unique index would compare timestamps, not days.

## 7. Success Metrics

- Recording a hand-out takes one keystroke and under 500 ms.
- Zero duplicate records per customer per day in production data.
- Every historical record can be priced without consulting anything outside the database.

## 8. Open Questions

- Should a record be creatable on a **non**-distribution day (e.g. a special hand-out)? Assumed yes —
  the use case checks eligibility, not the calendar — but **confirm with FD**.
- Should correcting a record be limited to the same day, or the same distribution week? The story says
  "same day"; this PRD follows it literally.
