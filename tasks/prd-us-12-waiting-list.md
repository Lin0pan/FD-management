# PRD: US-12 — Manage the Waiting List

> Source story: `docs/user_stories_mvp.md` §US-12 (Tier 2). Depends on **US-01** (registration),
> **US-10** (freed slots) and **US-14** (quota `N`).

## 1. Introduction

When all `1..N` slots are taken, applicants are not turned away — they go on a waiting list. The list
is **strictly first-come-first-served**: the longest waiting applicant gets the next freed slot. There
is no priority override and no size cap; in practice the list has never grown long enough to need one.

The same eligibility bar as registration applies: an applicant can only be added with a valid
certificate already in hand. Because waits can outlast a certificate, promotion must re-check validity
before registration proceeds.

## 2. Goals

- Add an applicant to the list in one screen, with their certificate on file.
- Display the list in strict arrival order, with no way to reorder it.
- When a slot frees up, point at the longest-waiting applicant and offer to register them.
- Flag an applicant whose certificate expired while waiting, before registration proceeds.
- Remove an applicant who withdrew or became unreachable.

## 3. User Stories

### US-12.1: Waiting-list ordering rule (domain)

**Description:** As a developer, I need the ordering rule as a pure function so "first come, first
served" is a property, not a query detail.

**Acceptance Criteria:**

- [ ] `src/domain/customer/waitingList.ts` exports `nextInLine(entries, today)` returning the entry
      with the earliest `addedOn`
- [ ] Ties on `addedOn` (same day) break deterministically by insertion id — documented, never random
- [ ] `nextInLine` returns the earliest entry **regardless** of certificate validity; it also reports
      `certificateExpired: boolean` so the caller can flag it. The rule is never silently skipped
- [ ] An empty list returns a typed `WaitingListEmpty` result, not `undefined`
- [ ] Tests cover: single entry, ordering across dates, same-day tie, expired-certificate entry at the
      head of the list

### US-12.2: Waiting-list use cases (application)

**Acceptance Criteria:**

- [ ] `addToWaitingList(deps, input)` records: first name, last name, date of birth, address, contact
      note (free text), certificate type and validity end date, and `addedOn = deps.clock.now()`
- [ ] It rejects an applicant whose certificate is already expired, with a typed
      `CertificateExpired` error — the same bar as registration
- [ ] `listWaiting(deps)` returns entries in strict arrival order, each flagged with whether its
      certificate has since expired
- [ ] `removeFromWaitingList(deps, { entryId, reason })` requires a reason and writes an audit entry
- [ ] `promoteFromWaitingList(deps, { entryId })` returns a registration draft (shaped like US-11.2)
      **and** the certificate-expired flag; it does not itself register anyone
- [ ] Promotion rejects if no customer number is free, with a typed `NoFreeCustomerNumber` error
- [ ] The entry is removed from the list only **after** the resulting registration succeeds — tested
      by a failing registration leaving the entry in place
- [ ] Tested with fakes and a fake clock

### US-12.3: Waiting-list persistence (infrastructure)

**Acceptance Criteria:**

- [ ] Prisma model `WaitingListEntry`: `id`, `firstName`, `lastName`, `birthDate`, address fields,
      `contactNote String?`, `certificateType`, `certificateValidUntil`, `addedOn DateTime`,
      `removedOn DateTime?`, `removalReason String?`
- [ ] Removed entries are **retained** with a `removedOn` timestamp rather than deleted, so the order
      of past promotions stays reconstructable
- [ ] Index on `addedOn`; the active-list query filters `removedOn IS NULL`
- [ ] Migration committed; integration test asserts arrival ordering survives a same-day tie

### US-12.4: Waiting-list UI (presentation)

**Acceptance Criteria:**

- [ ] Route `/warteliste` lists entries in arrival order with position, name, date added, days waiting,
      and a clear German badge when the certificate has expired while waiting
- [ ] The list has **no** sort or reorder controls — the order is the rule
- [ ] "Auf die Warteliste setzen" form validates with Zod; an already-expired certificate is refused
      with a specific message
- [ ] When at least one customer number is free, the page shows a prominent banner naming the
      longest-waiting applicant and offering "Jetzt registrieren", which opens the registration form
      pre-filled (US-01.6)
- [ ] An expired-certificate applicant at the head shows a warning before the registration form opens,
      stating that a renewed certificate is required
- [ ] "Entfernen" requires a reason and confirms before removing
- [ ] Verify in browser using dev-browser skill

### US-12.5: E2E — full quota, waitlist, promotion

**Acceptance Criteria:**

- [ ] Playwright spec with quota set to a small number (e.g. 2 via US-14): fill all slots, attempt a
      third registration and assert the user is directed to the waiting list
- [ ] Add two applicants; archive one customer; assert the banner names the **first** applicant added
- [ ] Promote them and assert they receive the freed number and are removed from the list
- [ ] Assert the second applicant is now at the head

## 4. Functional Requirements

- FR-1: An applicant may only be added with a valid certificate on file — the same bar as registration.
- FR-2: The entry must record the date added and enough personal data to identify and contact the
  applicant later.
- FR-3: The list must be displayed in strict first-come-first-served order, with no priority override
  and no size cap.
- FR-4: When a customer number frees up, the system must point to the longest-waiting applicant and
  offer to register them.
- FR-5: Promotion must re-check certificate validity and flag an applicant whose certificate expired
  while waiting, before registration proceeds.
- FR-6: An applicant must be removable from the list with a recorded reason.
- FR-7: Removed and promoted entries must be retained, not deleted.

## 5. Non-Goals

- No priority, urgency or hardship override — the order is arrival order, full stop.
- No cap on list size.
- No automatic promotion — a staff member always performs the registration.
- No notification to the applicant that a slot opened (no e-mail or phone in the agreed field list).
- No estimated waiting time.

## 6. Design Considerations

- The "a slot is free" banner is the feature's whole value: without it, staff must remember to check
  the list. Show it on the waiting-list page **and** on the home screen.
- Deliberately omit column sorting from the table. A sortable list invites the exact unfairness the
  strict ordering exists to prevent.

## 7. Technical Considerations

- Entry data intentionally duplicates registration fields rather than referencing a customer — an
  applicant is not a customer and must not occupy a slot or a surrogate customer row.
- The `contactNote` free-text field is the pragmatic answer to open question 2 in the domain analysis
  (no phone/e-mail fields agreed): it lets staff note how to reach someone without committing to a
  contact-data model.

## 8. Success Metrics

- Every freed slot is offered to the correct applicant, provably in arrival order.
- No applicant is registered with an expired certificate.

## 9. Open Questions

- **How should an expired certificate at promotion be handled — skip to the next applicant, hold the
  slot, or ask the applicant for a renewal?** The story explicitly asks FD to decide. This PRD
  implements "flag and let staff choose", which supports all three, but the intended default should be
  confirmed.
- Should `contactNote` exist at all, or does FD genuinely never contact applicants between visits?
- Should the waiting list be visible on the counter screen during a distribution day, or only away
  from the counter?
