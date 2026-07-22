# PRD: US-10 — Archive a Customer

> Source story: `docs/user_stories_mvp.md` §US-10 (Tier 2). Depends on **US-05** (attendance history)
> and **US-06** (reminder count). Frees the slot consumed by **US-01** and **US-12**.

## 1. Introduction

Archiving is how a customer leaves — and, crucially, how their **slot is freed** for someone on the
waiting list. It is always a manual decision with a recorded reason. The system offers it in two
situations (a certificate still expired after repeated reminders; several consecutive no-shows) but
never performs it on its own, because both are staff judgement calls.

Archived customers keep their full record indefinitely and stay searchable. Nothing is deleted.

## 2. Goals

- Archive in one action, with a mandatory reason, from the customer record or the counter screen.
- Free the customer number immediately, so the next registration can reuse it.
- Make consecutive no-shows visible, so that archiving trigger is actually usable.
- Keep the archived record complete, queryable and never deleted.

## 3. User Stories

### US-10.1: Consecutive no-show counting (domain)

**Description:** As a staff member, I want to see how many distributions in a row a customer has
missed, so I can notice the pattern the archiving rule depends on.

**Acceptance Criteria:**

- [ ] `src/domain/distribution/noShows.ts` exports
      `consecutiveNoShows({ records, customerGroup, settings, today })`
- [ ] It counts **the customer's own distribution days** — only weeks whose colour matches their
      group are candidates; the other group's weeks are not misses
- [ ] Counting stops at the most recent attendance record
- [ ] A customer registered recently cannot show a no-show count for weeks before their registration
      date (registration date is an input)
- [ ] Blocked periods are **not** excluded from the count (documented decision — see Open Questions)
- [ ] Tests cover: never attended, attended last time, missed one, missed three, a group change
      mid-history (count from the current group's schedule), and a customer registered two weeks ago
- [ ] Pure — `today` and `settings` are parameters

### US-10.2: `archiveCustomer` use case (application)

**Acceptance Criteria:**

- [ ] `archiveCustomer(deps, { customerId, reason })` transitions the status to `ARCHIVED` via the
      US-08.1 state machine and stores the reason
- [ ] An empty or whitespace-only reason rejects with a typed `ArchiveReasonRequired` error
- [ ] Archiving frees the customer number **immediately** — asserted by a test showing the number is
      returned by `lowestFreeNumber` on the next call
- [ ] Distribution records, cards, certificates, reminder logs and notes are all retained unchanged —
      asserted by a test that counts rows before and after
- [ ] The customer's number field is retained on the archived row for historical reference; the
      partial unique index (US-01.5) exempts archived rows so the slot is genuinely free
- [ ] Archiving an already-archived customer rejects
- [ ] Writes an audit entry carrying the reason
- [ ] Tested with fakes, including archiving a blocked customer (allowed)

### US-10.3: Archive persistence and queries (infrastructure)

**Acceptance Criteria:**

- [ ] `Customer.archiveReason String?` and `Customer.archivedAt DateTime?` added
- [ ] Repository invariant test: an archived row does not appear in `takenActiveNumbers()`
- [ ] Repository invariant test: two archived customers may hold the same `customerNumber`
- [ ] No cascading deletes anywhere — archiving is a status change, never a delete
- [ ] The consecutive-no-show query is backed by the `(customerId, date)` index from US-05.3
- [ ] Migration committed

### US-10.4: Archive UI and no-show visibility (presentation)

**Acceptance Criteria:**

- [ ] "Archivieren" action on the customer record with a required reason field; save is disabled
      until the reason is non-empty
- [ ] A confirmation step states plainly, in German, that the customer number will be freed and may be
      reassigned, and that the record is kept
- [ ] The customer record and the counter screen both display the consecutive-no-show count when it is
      greater than zero
- [ ] The counter screen shows the reminder count next to an expired certificate (US-06) and keeps
      archiving reachable from there as an ordinary action — never a prompt, and never a forced dialog
- [ ] An archived customer's record renders read-only with an unmissable archived banner including the
      reason and date
- [ ] Verify in browser using dev-browser skill

### US-10.5: E2E — archive frees the number

**Acceptance Criteria:**

- [ ] Playwright spec: register a customer, note their number, archive them with a reason, register a
      new customer and assert the **freed number is reassigned**
- [ ] Spec asserts the archived customer is still findable (US-15 with archived included) and that
      their distribution records are intact
- [ ] Spec asserts the archived customer cannot be served at the counter
- [ ] Spec asserts archiving without a reason is refused

## 4. Functional Requirements

- FR-1: Archiving must always be a manual decision with a recorded reason; the system must never
  archive on its own.
- FR-2: Archiving must be offered — never forced — when the certificate is still expired after
  repeated reminders, or when the customer has missed several consecutive distributions.
- FR-3: Consecutive no-shows must be visible on the customer record.
- FR-4: Archiving must immediately free the customer number for reassignment.
- FR-5: Archived customers must keep their full record indefinitely and remain searchable; nothing may
  be deleted.
- FR-6: An archived customer must not be servable at the counter.
- FR-7: A customer must never transition out of `ARCHIVED`; a returning applicant is registered anew
  (US-11).

## 5. Non-Goals

- No automatic archiving on any trigger.
- No retention or deletion policy — "keep forever" until a legal obligation surfaces.
- No un-archive / restore action; re-registration (US-11) is the path back.
- No notification to the customer.
- No configurable no-show or reminder threshold — the counts are displayed, the decision is human.

## 6. Design Considerations

- The confirmation must make the irreversible part explicit: the number is released and someone else
  may hold it tomorrow. Staff should not learn this from a support call.
- The archive prompt after the third reminder must not look like a modal that has to be dismissed to
  continue serving — the queue is waiting.

## 7. Technical Considerations

- Freeing the slot is achieved purely by the partial unique index exempting archived rows; no field
  needs to be nulled. Keeping `customerNumber` on the archived row preserves the historical record.
- `consecutiveNoShows` needs the customer's group **schedule**, not just their record list — it is the
  one place the week-colour rule (US-03) and the attendance history (US-05) meet.

## 8. Success Metrics

- A freed number is reusable within seconds, with no manual bookkeeping.
- No archived customer's history is ever lost or unreachable.
- Staff can see the no-show pattern without exporting anything.

## 9. Open Questions

- Should weeks during which the customer was **blocked** count as no-shows? Assumed yes (simplest and
  most visible), but it arguably penalises the customer for FD's own pause. **Confirm with FD.**
- How many consecutive no-shows should the UI treat as "worth highlighting"? Assumed 3, displayed as
  emphasis only — never as an automatic action. Should it be configurable (US-14)?
- Does FD want a defined list of archive reasons for consistency, or is free text right? (Free text
  assumed, matching the block reason.)
