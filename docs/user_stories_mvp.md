# User Stories — Füllhorn Delbrück (FD), First MVP

Derived from [`domain_information/domain_analysis.md`](domain_information/domain_analysis.md).

**How to read this document.** Stories are ordered by relevance: **Tier 1** is the thin slice that
must exist before the software can replace the Excel sheet for a single distribution day; **Tier 2**
covers the customer lifecycle that keeps the data true over weeks and months; **Tier 3** is
supporting functionality that FD can live without for the first few weeks. Section 4 lists what is
deliberately _out_ of the MVP.

Anything not traceable to the domain analysis is marked **`[added]`** with a one-line justification.
Those marks are the places to challenge me — they are my inference, not FD's statement.

Roles used: **Staff member** (the only human user; there is no login and no user administration, so
staff are indistinguishable to the system), **Applicant** and **Customer** (never touch the system
themselves — they appear as the beneficiary of a story, never as its actor).

---

## Tier 1 — Distribution Day Core

Without these seven stories there is no usable product. Together they cover: a customer exists, a
staff member finds them at the counter, decides whether to serve them, and records the result.

---

### US-01 — Register a New Customer

**As a** staff member
**I want to** register an applicant with their household, address and needs certificate
**So that** they become an active customer who can collect food, and their data stops living in a
shared spreadsheet.

**Preconditions**

- The applicant is not already an active customer.
- The applicant presents a valid needs certificate.
- At least one customer number in `1..N` is free (otherwise → US-12, waiting list).

**Acceptance Criteria**

1. The form captures: first name, last name, date of birth, address (street, house number, ZIP,
   city), and the certificate's type and validity period (expiry date).
2. The form captures each household member with first name, last name and date of birth. **The
   customer themselves is one of these members** — a single-person household has exactly one.
3. The grown-up count (13+) and children count (<13) are **displayed as derived values** and cannot
   be typed in or overridden.
4. The system offers the **lowest free customer number** in `1..N`, including numbers freed by
   archiving. `[added]` — the analysis says "next free number" without defining the order; lowest-free
   makes the result reproducible and testable.
5. The system suggests the group (Red/Blue) with fewer active customers, and the staff member can
   override the suggestion.
6. Saving is rejected with a clear message if: no free number exists, a required field is missing,
   the household is empty, or a date of birth lies in the future.
7. On save, the customer is `active`, has reminder count `0`, and card number `<number>k1`.

**Postconditions**

- An active customer exists with an assigned number, group and first card.
- The customer number is no longer offered to other registrations.

**Related:** US-02 (card), US-11 (re-registration from archive), US-12 (waiting list), US-14 (quota `N`)

> **Note — customer number is a slot, not an identity.** The `1..N` customer number is reusable: it
> is freed on archiving (US-10) and later reassigned, so it is **not unique across the archive** —
> two unrelated people may each have held number `50` at different times. It is therefore treated as
> an attribute the customer _currently holds_, not as their identity. Internally the customer is
> identified by a separate, never-reused surrogate key that all records (distribution, cards, notes)
> reference; it is not shown to staff, who keep using the customer number and card number. See §5.3
> of the architecture sketch for the rationale.

---

### US-02 — Issue a Customer Card (Digital)

**As a** staff member
**I want to** issue a customer card and see all its information displayed digitally
**So that** the customer can identify themselves at the counter and be called up in the right order.

**Preconditions:** The customer exists and is active.

**Acceptance Criteria**

1. The card shows: card number, first and last name, group (Red/Blue), grown-up count, children
   count.
2. The card number is `<customer number>` + `k` + running index — customer 50's first card is
   `50k1`, the next `50k2`.
3. Exactly one card number per customer is valid at a time; issuing a new one invalidates all
   earlier ones immediately.
4. All card information is presented **digitally** in the application — a card view on screen. The
   MVP does **not** produce a physical/printable card. `[added]` — FD confirmed that printing the
   physical card is handled by a separate, existing system; the software only needs to display the
   card data so it can be transcribed or fed into that system. See §4 (out of scope).

**Postconditions:** The customer's current card number is updated; previous numbers are invalid.

**Related:** US-01, US-09 (reissue after loss), US-13 (reissue after 13th birthday)

---

### US-03 — Know Which Group Collects Today

**As a** staff member
**I want to** see at a glance whether today is a Red or a Blue distribution day
**So that** I serve the right half of the customer base and the alternation stays fair.

**Acceptance Criteria**

1. The application shows today's week colour prominently on the distribution screen.
2. The colour is **derived from the calendar** by strict alternation from a configured anchor week —
   it is not typed in per week, and two consecutive weeks can never share a colour.
3. A staff member can look up the colour of a past or future week.
4. On a non-distribution day, the screen states which colour is next and when. `[added]` — the
   analysis does not say what the app shows off-day; without this the screen would be blank or
   misleading four days out of five.

**Related:** US-04, US-05

**Open dependency:** the anchor week and the distribution weekday must be configured once at
install (US-14).

---

### US-04 — Look Up a Customer by Card Number

**As a** staff member
**I want to** type the number from a customer's card and immediately see everything I need to decide
**So that** I can serve a queue of customers quickly without paging through a spreadsheet.

**Preconditions:** It is a distribution day; the customer is at the counter with a card.

**Acceptance Criteria**

1. Entering either a card number (`50k3`) or a plain customer number (`50`) finds the customer.
2. The result shows, without further clicks: name, customer number, group, grown-up/children counts,
   portion allowance, price, certificate expiry, status, reminder count, and staff notes.
3. The screen states a clear verdict, visually unmissable:
   - **Wrong group for today** → "Blue customer — Red week. Send away, back next week."
   - **Outdated card number** → "Card `50k2` is invalid, current card is `50k3`."
   - **Blocked** → block reason shown.
   - **Archived** → archived, not eligible.
   - **Certificate expired** → serve, remind, log (US-06).
   - Otherwise → clear to serve.
4. Being turned away for the wrong group or an invalid card records nothing and changes nothing —
   it is neither a block nor an archiving event.
5. An unknown number gives a clear "not found" rather than an empty screen.

**Related:** US-05, US-06, US-08 (blocks)

> **Note.** Criterion 3 is the single most valuable screen in the product. Everything a staff member
> currently reconstructs by eye from spreadsheet columns is here as one verdict.

---

### US-05 — Record Attendance and Payment

**As a** staff member
**I want to** record with one action that a customer collected food and paid
**So that** FD knows who was served this week and no-shows become visible.

**Preconditions:** The customer has been looked up (US-04) and is clear to serve.

**Acceptance Criteria**

1. One action records: the customer, today's date, that they showed up, and that they paid.
2. The record shows the price that applied — derived from the per-head prices and their current
   counts.
3. No amount and no separate payment date are stored; payment is a flag. Paid is the normal case and
   is pre-set, but the staff member can clear it. `[added]` — the analysis says the employee tracks
   "paid" without saying whether not-paying is possible; a flag that cannot be cleared would be
   pointless, so it must be clearable.
4. Recording twice for the same customer on the same day is prevented, with a message that they were
   already served today.
5. The record survives indefinitely — distribution history is never overwritten week to week.
6. A staff member can correct a record made in error on the same day.

**Postconditions:** A dated distribution record exists for that customer.

**Related:** US-04, US-07, US-10 (no-show driven archiving), §4 (future reporting)

---

### US-06 — Check the Certificate and Log a Reminder

**As a** staff member
**I want to** see whether the needs certificate is still valid and log a reminder when it is not
**So that** customers get a fair grace period before losing their place, and the reminder history is
documented rather than remembered.

**Acceptance Criteria**

1. The lookup screen shows the certificate's expiry date and whether it is expired **as of today**.
2. If expired, the customer is **still served this time** — an expired certificate never blocks a
   hand-out.
3. Logging a reminder increments the reminder count by one; the screen shows the new count.
4. Recording a renewed certificate (new type and validity period) **resets the reminder count to 0**.
5. The screen shows the current reminder count alongside the expiry status, so the staff member can
   see how often this customer has already been reminded and decide what to do. The system holds no
   threshold and never prompts or archives on its own — archiving is US-10's manual decision.
   `[changed]` — FD reminds about three times as a habit, but each case is judged individually, so a
   configured number would only be a rule the software pretends to have.
6. At most one reminder is logged per customer per distribution day. `[added]` — prevents a
   mis-click from consuming a customer's grace period.

**Related:** US-04, US-10 (archiving)

---

### US-07 — See the Portion Allowance and Price

**As a** staff member
**I want to** see how many portions a customer gets and what they pay
**So that** I hand out the right amount without doing arithmetic at a busy counter.

**Acceptance Criteria**

1. The portion allowance is computed from the derived grown-up/children counts and the configured
   portions-per-grown-up / portions-per-child values.
2. The price is **derived per head**: the configured price per grown-up times the grown-up count
   plus the configured price per child times the children count. It never flexes with supply or
   occasion.
3. The allowance shown is always the **standard** one derived from the configured portion values.
   Day-to-day adjustments for supply or special occasions do happen, but they are made physically at
   the counter and are **out of scope for the software** — the system neither captures nor records
   them.
4. Money is displayed in euro and never computed in floating point.

**Related:** US-05, US-14

---

## Tier 2 — Keeping the Data True

The lifecycle stories. Without them the data slowly drifts out of sync with reality, which is
exactly the failure mode of the current spreadsheet.

---

### US-08 — Block and Unblock a Customer

**As a** staff member
**I want to** temporarily block a customer with a written reason, and lift the block later
**So that** a customer can be paused without losing their number, and my colleagues at the counter
see why.

**Acceptance Criteria**

1. Blocking requires a free-text reason; it cannot be saved empty.
2. There are no automatic triggers — a block is always a manual decision.
3. A blocked customer keeps their customer number, card and record, and does **not** free a slot.
4. The block and its reason are shown prominently on the lookup screen (US-04).
5. Any staff member can lift the block; no fixed duration and no automatic expiry.
6. Lifting a block returns the customer to `active`.

**Related:** US-04, US-10

> **Note.** The analysis states that nothing beyond the reason is tracked today — not who blocked,
> not when, no history. The MVP matches that, and since there is no login (§4), _who_ could not be
> recorded even if wanted. The reason text is therefore the only account of a block that exists —
> which is an argument for staff writing useful reasons, not for the software enforcing a format.

---

### US-09 — Reissue a Card After Loss

**As a** staff member
**I want to** issue a replacement card when a customer loses theirs
**So that** they can keep collecting food while the lost card stops working.

**Acceptance Criteria**

1. The new card number reuses the customer number with the next running index (`50k3` → `50k4`).
2. The new number becomes the only valid one; every earlier number for that customer is invalid.
3. Presenting an old card at the counter shows "invalid card" (US-04) and the customer is turned
   away — not blocked, not archived.
4. There is no limit on the number of reissues; the system does not prevent a further one.
5. The number of reissues so far is visible, so staff can judge whether someone is losing cards
   unusually often. `[added]` — the analysis says staff _may_ decide to stop reissuing for frequent
   losers; that judgement needs the count to be visible. The system never enforces it.

**Related:** US-02, US-04, US-13

---

### US-10 — Archive a Customer

**As a** staff member
**I want to** archive a customer who is no longer eligible or no longer attending
**So that** their slot frees up for someone on the waiting list and the record is kept.

**Acceptance Criteria**

1. Archiving is always a manual decision with a recorded reason; the system never archives on its
   own.
2. It is offered — never forced — when: the certificate stays expired after repeated reminders
   (US-06), or the customer has not shown up for several consecutive distributions.
3. Consecutive no-shows are visible on the customer record so staff can spot them. `[added]` — the
   analysis names repeated no-shows as an archiving trigger but describes no way to notice them;
   with attendance recorded (US-05) this is derivable, and without it the trigger is unusable.
4. Archiving immediately frees the customer number for reassignment.
5. Archived customers keep their full record **indefinitely** and stay searchable; nothing is
   deleted.
6. An archived customer cannot be served at the counter.

**Postconditions:** Customer is `archived`; their number is free.

**Related:** US-01, US-06, US-11, US-12

---

### US-11 — Find and Reuse an Archived Record on Re-registration

**As a** staff member
**I want to** find a returning applicant's archived record and reuse their data
**So that** I do not retype a household that FD already knows.

**Preconditions:** The applicant applies again and holds a valid certificate.

**Acceptance Criteria**

1. During registration, searching by name and date of birth surfaces matching archived records.
2. Confirming a match pre-fills personal data, address and household members into the registration
   form, all of it editable.
3. The returning customer receives a **new** customer number — never their old one — and a fresh
   card index starting at `k1`.
4. The reminder count starts at 0 and the new certificate's validity period is recorded.
5. The old archived record is retained; it is not overwritten or merged away. `[added]` — the
   analysis says data is reused but not what happens to the old record. Keeping both preserves the
   history that criterion 5 of US-10 promises.

**Related:** US-01, US-10

---

### US-12 — Manage the Waiting List

**As a** staff member
**I want to** put an applicant on the waiting list when the quota is full and promote the longest
waiting one when a slot frees up
**So that** applicants are treated in a fair, defensible order instead of by who asks most
persistently.

**Preconditions:** All numbers in `1..N` are taken; the applicant holds a valid certificate.

**Acceptance Criteria**

1. An applicant can only be added with a valid certificate on file — the same bar as registration.
2. The entry records the date added and enough personal data to identify and contact the applicant
   later.
3. The list is displayed in **strict first-come-first-served** order; there is no priority override
   and no size cap.
4. When a customer number frees up, the system points to the longest-waiting applicant and offers to
   register them (US-01).
5. Promotion re-checks certificate validity — an applicant whose certificate expired while waiting
   is flagged before registration proceeds. `[added]` — waits can outlast a certificate; without this
   the system would register an ineligible person. **Confirm with FD** how they want that handled
   (skip, hold, or ask for a renewal).
6. An applicant can be removed from the list (withdrew, no longer needed, unreachable).

**Related:** US-01, US-10, US-14

---

### US-13 — Reclassify Children Automatically at Age 13

**As a** staff member
**I want** household counts to update by themselves when a child turns 13, and to be told which
cards that made outdated
**So that** portions and prices stay correct without anyone watching birthdays.

**Acceptance Criteria**

1. The grown-up/children split is computed from birthdates **every time it is displayed**, never
   stored as an editable number.
2. A member counts as a grown-up **on** their 13th birthday — the day before, they are still a
   child.
3. Portion allowance and price follow the new counts with no staff action.
4. The customer appears on a **"cards due for reissue"** list, because their printed card now shows
   stale counts.
5. A stale card is **not** grounds to turn anyone away — reissue happens as soon as practical, but
   it is not urgent.
6. Reissuing from that list follows US-09's numbering and removes the customer from the list.

**Related:** US-02, US-07, US-09

> **Note.** This is the one place where the analysis explicitly describes a _future_ behaviour rather
> than today's process — staff currently catch this informally, if at all. Its correctness depends on
> an injectable clock, so the boundaries (day before / day of / day after, and 29 February) can be
> tested.

---

### US-14 — Configure the Business Rules

**As a** staff member
**I want to** edit the quota, prices per head and portion values in the application
**So that** FD can adapt to changed prices or supply without calling a developer.

**Acceptance Criteria**

1. Editable: customer quota `N`; portions per grown-up and per child; the price per grown-up and per
   child; the week-cycle anchor and distribution weekday.
2. Changes are stored with an **effective-from date** so past distribution records can still be
   interpreted with the values that applied at the time.
3. Lowering `N` below the number of active customers is refused with a clear explanation. `[added]` —
   otherwise the quota silently contradicts reality.
4. Price values are entered and stored in whole cents.

**Related:** US-01, US-06, US-07, US-12

> **Note.** The concrete values are still open question 1 in the analysis. This story is what makes
> that safe to leave open — the numbers become configuration, not code.

---

## Tier 3 — Supporting the Day-to-Day

Valuable, but FD could survive a first week without them.

---

### US-15 — Browse and Search the Customer List

**As a** staff member
**I want to** search and filter all customers
**So that** I can answer questions away from the counter — who is in the Red group, whose
certificate expires soon, who is blocked.

**Acceptance Criteria**

1. Search by name, customer number or card number.
2. Filter by status (active / blocked / archived), by group, and by certificate expiry.
3. The list shows both group sizes, so staff can keep Red and Blue roughly balanced.
4. Archived customers are excluded by default and can be included deliberately.

`[added]` — the analysis never mentions a list view, because in Excel the list _is_ the product.
Replacing Excel without one would be a regression.

**Related:** US-04, US-16

---

### US-16 — Maintain a Customer's Record

**As a** staff member
**I want to** update a customer's household, address, certificate, group and notes
**So that** the record reflects reality as households and circumstances change.

**Acceptance Criteria**

1. Household members can be added and removed; counts, portions and price update immediately.
2. No history of past household compositions is kept.
3. Adding or removing a member puts the customer on the "cards due for reissue" list (US-13),
   because the printed counts changed.
4. A customer's group can be changed, with both current group sizes shown to inform the decision.
5. Free-text notes can be edited and are visible at the counter (US-04).
6. A renewed certificate can be recorded, resetting the reminder count (US-06).

**Related:** US-06, US-13, US-15

---

---

## 4. Deliberately Out of MVP Scope

- **Physical card printing** — the software displays a customer's card data digitally (US-02), but
  producing the physical card is done through a separate, existing system and is out of MVP scope.
  Printing directly from this application may be added far later.
- **User administration and login** — there are no accounts, no roles and no sign-in. The
  application is used by 3-4 trusted colleagues on a shared machine, and every staff member has the
  same permissions anyway. May be added far in the future; until then, no action can be attributed
  to an individual staff member, and stories are worded accordingly.
- **Portion adjustments for supply or special occasions** — they happen, but at the counter, not in
  the software. The system only ever knows the standard allowance (US-07).
- **Reporting and statistics** (portions per week/month, attendance rates) — §5 of the analysis
  flags it as a likely later requirement. US-05's criterion 5 keeps the door open by never
  discarding distribution records.
- **Full audit log** of every state change — the architecture sketch argues for it; the domain does
  not require it yet. Without login it could only record _what_ changed and when, never _who_ did
  it.
- **Block history** — the analysis is explicit that FD does not track this today.
- **Retention and deletion of archived customers** — currently "keep forever"; revisit if a legal
  obligation surfaces.
- **Contact details, e-mail or letter reminders** — open question 2; reminders are verbal today.
- **Excel import** of the existing customer list — a migration question, not a product feature, but
  it must be answered before go-live.

---

## 5. Suggested Build Order

The dependency chain, not the tier order: **US-14** (configuration) and **US-03** (week cycle) are
technically first, because US-01 cannot assign a number without `N` and US-04 cannot judge a group
without today's colour. A sensible first vertical slice is
**US-14 → US-01 → US-02 → US-03 → US-04 → US-05**, which is a demonstrable distribution day.
US-06 completes the counter workflow; the lifecycle stories follow.
