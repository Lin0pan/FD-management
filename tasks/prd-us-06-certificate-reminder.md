# PRD: US-06 — Check the Certificate and Log a Reminder

> Source story: `docs/user_stories_mvp.md` §US-06 (Tier 1). Depends on **US-04** (counter screen).
> Feeds **US-10** (archiving, which stays a staff decision).

## 1. Introduction

Eligibility rests on a needs certificate (Bescheinigung), typically from the Jobcenter, with a
validity period. When it expires, FD does not turn the customer away — they are served anyway, given
a verbal reminder to bring a renewed certificate, and the reminder is logged. The count of reminders
is what staff read when deciding what to do next: FD reminds about three times as a habit, but every
case is judged individually, so the system holds no threshold, never prompts and never archives on
its own (archiving is US-10).

This feature makes the grace period **documented rather than remembered**.

## 2. Goals

- The counter screen always states whether the certificate is valid as of today.
- An expired certificate never blocks a hand-out.
- Logging a reminder is one action; at most one per customer per distribution day.
- Recording a renewed certificate resets the count to zero.
- The reminder count is always visible next to the expiry status, so the decision to archive is an
  informed staff judgement rather than a rule the software applies.

## 3. User Stories

### US-06.1: Certificate validity (domain)

**Description:** As a developer, I need the expiry rule as a pure function so the grace period
behaves identically everywhere.

**Acceptance Criteria:**

- [ ] `src/domain/customer/certificate.ts` exports `isExpired(certificate, today)`
- [ ] A certificate is valid **on** its `validUntil` date and expired the day after — tested for the
      day before, the day of and the day after, plus 29 February
- [ ] There is **no** escalation function and no threshold: what a reminder count means is a staff
      judgement, so the domain exposes the count and the expiry, nothing more
- [ ] Pure — `today` is a parameter, no clock, no settings lookup

### US-06.2: `recordReminder` and `renewCertificate` use cases (application)

**Acceptance Criteria:**

- [ ] `recordReminder(deps, { customerId })` increments `reminderCount` by one and returns the new count
- [ ] It rejects with a typed `ReminderAlreadyLoggedToday` error if a reminder was already logged for
      that customer on the same calendar day, and writes nothing
- [ ] It rejects if the certificate is **not** expired (nothing to remind about)
- [ ] `renewCertificate(deps, { customerId, type, validUntil })` records the new certificate **and**
      resets `reminderCount` to 0 in the same transaction
- [ ] `renewCertificate` rejects a `validUntil` in the past with a typed error
- [ ] Both write audit entries; the reminder entry records the resulting count
- [ ] Tested with fakes and a fake clock: first reminder, same-day repeat, next-day reminder, reminder
      on a valid certificate, renewal resetting a count of 3

### US-06.3: Reminder persistence (infrastructure)

**Acceptance Criteria:**

- [ ] `Customer.reminderCount Int @default(0)` (already in the US-01 schema — confirm)
- [ ] Prisma model `ReminderLog`: `id`, `customerId` (FK to `Customer.id`), `loggedOn` day-key,
      `resultingCount Int`
- [ ] Unique constraint on `(customerId, loggedOn)` so the database enforces one reminder per day
- [ ] `Certificate` rows are **appended**, not overwritten — the current certificate is the latest by
      `validUntil` / `recordedAt`, preserving the history of renewals
- [ ] Migration committed; integration test proves the per-day constraint fires

### US-06.4: Certificate status and reminder action (presentation)

**Description:** As a staff member, I want the counter screen to tell me the certificate is expired
and let me log the reminder without leaving the screen.

**Acceptance Criteria:**

- [ ] The counter screen (US-04) shows the certificate's expiry date and, when expired, an
      unmissable German note that the customer is served this time but must bring a renewal
- [ ] A "Erinnerung erfassen" action logs the reminder and shows the new count immediately
- [ ] After the action, the button is disabled for the rest of the day with an explanatory label
- [ ] The reminder count is shown next to the expiry status whenever it is greater than zero, so the
      staff member can judge whether to archive (US-10); the screen never prompts or advises
- [ ] A "renewed certificate" form captures type and validity end date and, on save, shows the reset
      count of 0
- [ ] Verify in browser using dev-browser skill

### US-06.5: E2E — expired certificate to third reminder

**Acceptance Criteria:**

- [ ] Playwright spec with a controllable clock: a customer with an expired certificate is served on
      three consecutive distribution days, logging one reminder each time
- [ ] Spec asserts the second attempt on the same day is refused
- [ ] Spec asserts the screen shows a count of 3 after the third reminder and that the customer is
      still active — nothing about archiving happens without a staff decision
- [ ] Spec asserts recording a renewed certificate resets the displayed count to 0 and removes the prompt

## 4. Functional Requirements

- FR-1: The lookup screen must show the certificate's expiry date and whether it is expired as of today.
- FR-2: An expired certificate must never block a hand-out; the customer is still served.
- FR-3: Logging a reminder must increment the reminder count by one and display the new count.
- FR-4: Recording a renewed certificate must reset the reminder count to 0.
- FR-5: At most one reminder may be logged per customer per distribution day.
- FR-6: The reminder count must be visible wherever the expiry status is; what it means for this
  customer is a staff judgement, and the system must never prompt, advise or archive on its own.
- FR-7: No reminder threshold exists — neither configured nor hard-coded.
- FR-8: Certificate renewals must be appended, preserving the history.

## 5. Non-Goals

- No automatic archiving, ever — it is always a staff decision (US-10).
- No written, e-mailed or posted reminders; reminders are verbal and only logged here.
- No upload or scan of the certificate document.
- No proactive "expiring soon" alerting at the counter (the expiry list is part of US-15's filters).
- No threshold at all — not configured, not hard-coded, not overridable per customer. FD's "about
  three reminders" is a habit staff apply themselves, and encoding it would misrepresent a judgement
  as a rule.

## 6. Technical Considerations

- "One reminder per distribution day" is enforced per calendar day, which is stricter and simpler than
  per distribution event. Document that a special hand-out on a second day in the same week could
  therefore consume two reminders — flag for FD if that ever matters.
- The reminder count is a plain running total on the customer record. Because no rule consumes it,
  there is nothing to recompute retroactively when a past distribution is reviewed.

## 7. Success Metrics

- No customer loses their place without a documented reminder trail.
- A mis-click cannot consume a customer's grace period.
- Staff can see the expiry status and the reminder count without leaving the counter screen, and
  decide from there.

## 8. Open Questions

- The domain analysis says the count is "0–3 typically". Is there any case where a reminder should be
  removed or a count manually corrected? (Not offered here; the reset path is a renewal.)
- Should the system distinguish certificate **types** (Jobcenter, Sozialamt, …) for any rule, or is
  the type purely informational? (Assumed informational.)
