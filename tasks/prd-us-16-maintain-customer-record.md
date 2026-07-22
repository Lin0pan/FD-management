# PRD: US-16 — Maintain a Customer's Record

> Source story: `docs/user_stories_mvp.md` §US-16 (Tier 3). Depends on **US-06** (certificate renewal),
> **US-13** (cards due for reissue) and **US-15** (list as entry point).

## 1. Introduction

Households change: a baby is born, someone moves out, a family moves house, a certificate is renewed,
a customer is moved between groups to keep them balanced. Without a way to edit the record, the data
drifts out of sync with reality — which is exactly the failure mode of the spreadsheet this software
replaces.

This is the customer detail screen: everything about one customer, editable, with the consequences of
each edit made explicit.

## 2. Goals

- One screen showing everything known about a customer.
- Household members addable and removable, with counts, portions and price updating immediately.
- Group changes informed by both current group sizes.
- Notes editable and visible at the counter.
- Certificate renewal from the same place, resetting the reminder count.

## 3. User Stories

### US-16.1: `updateHousehold` use case (application)

**Acceptance Criteria:**

- [ ] `updateHousehold(deps, { customerId, members })` replaces the household member set
- [ ] An empty member list rejects with `EmptyHousehold`; a future birthdate rejects with
      `BirthDateInFuture` — the same domain rules as registration, not a second implementation
- [ ] Derived counts, portions and price are **never written** — they follow automatically
- [ ] After a change that alters the counts, the customer appears on the cards-due-for-reissue list
      (US-13.2) with reason `HOUSEHOLD_CHANGE` — asserted by a test
- [ ] A change that does **not** alter the counts (e.g. correcting a spelling) must not put the
      customer on that list
- [ ] No history of the previous composition is kept — asserted, since it is an explicit non-goal
- [ ] Writes an audit entry

### US-16.2: `updateCustomerDetails` use case (application)

**Acceptance Criteria:**

- [ ] Updates name, date of birth and address fields with the same Zod/domain validation as registration
- [ ] The customer's own record and their household-member entry stay consistent when their name or
      birthdate changes — decide and test the mechanism (single source of truth preferred)
- [ ] The customer number is **not** editable through this use case
- [ ] Writes an audit entry

### US-16.3: `updateNotes` use case (application)

**Acceptance Criteria:**

- [ ] Free-text notes are saved as given; empty is allowed (unlike a block reason)
- [ ] Notes are returned by the counter lookup (US-04.2) — asserted by a test
- [ ] No length limit is enforced beyond a sane maximum (e.g. 4000 chars) with a clear message
- [ ] Writes an audit entry

### US-16.4: `changeGroup` use case (application)

**Acceptance Criteria:**

- [ ] `changeGroup(deps, { customerId, group })` sets the group and returns the resulting group sizes
- [ ] Changing to the same group rejects as a no-op
- [ ] The change takes effect immediately, including for today's counter verdict (US-04) — a test
      asserts a customer moved to Red is servable in a Red week on the same day
- [ ] The card prints the group, so a group change puts the customer on the cards-due list with reason
      `GROUP_CHANGE` (see US-13 open question)
- [ ] Writes an audit entry

### US-16.5: Customer record screen (presentation)

**Description:** As a staff member, I want one screen where I can see and update everything about a
customer.

**Acceptance Criteria:**

- [ ] Route `/kunden/[id]` shows: personal data, address, household members with birthdates and
      current age, derived counts, portions, price, group, status, current card number, certificate
      and expiry, reminder count, consecutive no-shows, notes, and the distribution history
- [ ] Household members can be added and removed inline; counts, portions and price update live
- [ ] The group control shows both current group sizes next to the choice
- [ ] Notes are a multi-line field saved explicitly, with an indication that they appear at the counter
- [ ] The certificate renewal form (US-06.4) is embedded here and shows the reminder count resetting to 0
- [ ] Actions available from this screen: reissue card (US-09), block/unblock (US-08), archive (US-10)
- [ ] An archived customer's record renders fully read-only with the archived banner
- [ ] Distribution history is listed newest first with date, showed-up and paid, and the price that
      applied
- [ ] All strings from `src/i18n/de.ts`
- [ ] Verify in browser using dev-browser skill

### US-16.6: E2E — edit a household and see the effects

**Acceptance Criteria:**

- [ ] Playwright spec: open a customer record, add a child, assert counts, portions and price update
      and that the customer appears on the cards-due list
- [ ] Change the group and assert both group sizes update and the counter verdict for today flips
      accordingly
- [ ] Edit the notes and assert the text appears on the counter screen for that customer
- [ ] Record a renewed certificate and assert the reminder count shows 0

## 4. Functional Requirements

- FR-1: Household members must be addable and removable; counts, portions and price must update
  immediately.
- FR-2: No history of past household compositions is kept.
- FR-3: Adding or removing a member must put the customer on the "cards due for reissue" list when the
  counts change.
- FR-4: A customer's group must be changeable, with both current group sizes shown to inform the
  decision.
- FR-5: Free-text notes must be editable and must be visible at the counter.
- FR-6: A renewed certificate must be recordable here, resetting the reminder count.
- FR-7: The customer number must not be editable.
- FR-8: An archived customer's record must be read-only.

## 5. Non-Goals

- No composition history, no "as of" view of a past household.
- No editing of distribution records older than today (US-05's rule applies).
- No customer number reassignment or manual override.
- No merging of customers.
- No document uploads (certificates are recorded as type + validity, not scanned).
- No contact details.

## 6. Design Considerations

- This screen concentrates almost every destructive action in the app (archive, block, reissue). Group
  them in a clearly separated section, each with its own confirmation, so none is a stray click away
  from the household editor.
- Show each household member's current age next to their birthdate — it makes the 13-year boundary
  legible and lets staff anticipate a reissue.

## 7. Technical Considerations

- Every mutation here goes through its own use case. Resist a single `updateCustomer` mega-action:
  the distinct use cases are what make the audit entries meaningful and the tests small.
- The customer-as-household-member duplication (US-16.2) is a genuine modelling question. Preferred
  resolution: the customer's own row **is** their household member row, referenced rather than copied,
  so a name change cannot desynchronise. Decide this before implementing, and record the decision.

## 8. Success Metrics

- Updating a household takes under a minute and needs no other screen.
- The record never shows counts that contradict the birthdates on file.
- Notes written here are read at the counter — measurable by whether staff use them at all.

## 9. Open Questions

- Should removing a household member require a reason for the audit log? (Not required today.)
- If the registered customer themselves moves out of the household, is that a household edit or an
  archive-and-re-register? The current model assumes the customer is always a member.
- Should the distribution history be limited to the last N entries with a "show all", or fully listed?
