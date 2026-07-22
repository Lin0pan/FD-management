# PRD: US-06 — Check the Certificate and Log a Reminder

> Source story: `docs/user_stories_mvp.md` §US-06 (Tier 1). Depends on **US-04** (counter screen) and
> **US-14** (reminder threshold). Feeds **US-10** (archiving prompt).

## 1. Introduction

Eligibility rests on a needs certificate (Bescheinigung), typically from the Jobcenter, with a
validity period. When it expires, FD does not turn the customer away — they are served anyway, given
a verbal reminder to bring a renewed certificate, and the reminder is logged. After the configured
number of reminders (default 3) with the certificate still expired, staff are prompted to archive the
customer — but the system never archives on its own, because staff routinely extend the threshold
case by case.

This feature makes the grace period **documented rather than remembered**.

## 2. Goals

- The counter screen always states whether the certificate is valid as of today.
- An expired certificate never blocks a hand-out.
- Logging a reminder is one action; at most one per customer per distribution day.
- Recording a renewed certificate resets the count to zero.
- Reaching the threshold prompts — never forces — archiving.

## 3. User Stories

### US-06.1: Certificate validity and reminder escalation (domain)

**Description:** As a developer, I need the expiry and escalation rules as pure functions so the grace
period behaves identically everywhere.

**Acceptance Criteria:**

- [ ] `src/domain/customer/certificate.ts` exports `isExpired(certificate, today)`
- [ ] A certificate is valid **on** its `validUntil` date and expired the day after — tested for the
      day before, the day of and the day after
- [ ] `escalation(reminderCount, threshold, expired)` returns `NONE`, `REMIND`, or `PROMPT_ARCHIVE`
- [ ] `PROMPT_ARCHIVE` is returned only when the count has reached the threshold **and** the
      certificate is still expired
- [ ] A valid certificate always yields `NONE`, regardless of the reminder count
- [ ] Pure — `today` and `threshold` are parameters, no clock, no settings lookup

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
- [ ] When the threshold is reached and the certificate is still expired, the screen shows a prompt
      offering to archive (linking to US-10) — with an equally prominent option to continue without
      archiving
- [ ] A "renewed certificate" form captures type and validity end date and, on save, shows the reset
      count of 0
- [ ] Verify in browser using dev-browser skill

### US-06.5: E2E — expired certificate to third reminder

**Acceptance Criteria:**

- [ ] Playwright spec with a controllable clock: a customer with an expired certificate is served on
      three consecutive distribution days, logging one reminder each time
- [ ] Spec asserts the second attempt on the same day is refused
- [ ] Spec asserts that after the third reminder the archive prompt appears and that the customer is
      **not** archived until staff confirm
- [ ] Spec asserts recording a renewed certificate resets the displayed count to 0 and removes the prompt

## 4. Functional Requirements

- FR-1: The lookup screen must show the certificate's expiry date and whether it is expired as of today.
- FR-2: An expired certificate must never block a hand-out; the customer is still served.
- FR-3: Logging a reminder must increment the reminder count by one and display the new count.
- FR-4: Recording a renewed certificate must reset the reminder count to 0.
- FR-5: At most one reminder may be logged per customer per distribution day.
- FR-6: When the count reaches the configured threshold (default 3) and the certificate is still
  expired, the system must prompt to archive — and must never archive automatically.
- FR-7: The threshold must be read from settings (US-14), not hard-coded.
- FR-8: Certificate renewals must be appended, preserving the history.

## 5. Non-Goals

- No automatic archiving, ever — it is always a staff decision (US-10).
- No written, e-mailed or posted reminders; reminders are verbal and only logged here.
- No upload or scan of the certificate document.
- No proactive "expiring soon" alerting at the counter (the expiry list is part of US-15's filters).
- No per-customer threshold override stored as data — staff simply decline the archive prompt.

## 6. Technical Considerations

- "One reminder per distribution day" is enforced per calendar day, which is stricter and simpler than
  per distribution event. Document that a special hand-out on a second day in the same week could
  therefore consume two reminders — flag for FD if that ever matters.
- The escalation function reads the threshold in force **today**; a past distribution's escalation is
  not recomputed retroactively.

## 7. Success Metrics

- No customer loses their place without a documented reminder trail.
- A mis-click cannot consume a customer's grace period.
- Staff can see the full escalation state without leaving the counter screen.

## 8. Open Questions

- The domain analysis says the count is "0–3 typically". Is there any case where a reminder should be
  removed or a count manually corrected? (Not offered here; the reset path is a renewal.)
- Should the system distinguish certificate **types** (Jobcenter, Sozialamt, …) for any rule, or is
  the type purely informational? (Assumed informational.)
