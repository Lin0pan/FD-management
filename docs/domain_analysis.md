# Domain Analysis: Füllhorn Delbrück (FD) Software

Structured restatement of the current, manual process described in
`general_domain_description.md`, refined with follow-up answers from the FD team.

**Status of this document.** It describes the process **as it is run today**, with a few explicitly
marked wishes for how the future system should behave (most notably the automatic age
reclassification in 4.7). It is **not** a detailed or complete requirements specification. It is
meant as the **basis for deriving user stories and scoping a first MVP** — decisions it does not
cover are open by default, not implicitly settled. Remaining ambiguities are called out under
**Open Questions**.

## 1. Overview

Füllhorn Delbrück (FD) is a small charity that receives food donations from local food retailers
and distributes them to eligible needy people ("customers"). Food is not free — customers pay a
small price based on household size. FD needs software that:

- manages customers (registration, eligibility, status), and
- tracks food distribution (who showed up and received food, and when).

The process is currently run by 3-4 staff members using an **Excel spreadsheet** as the customer
list (not paper).

## 2. Actors

- **Customer** — a person receiving food from FD. Must be registered and currently eligible.
- **Staff member** — handles registration, eligibility checks, and distribution. All staff have
  identical system permissions; many decisions (blocking, archiving thresholds, group placement)
  are made at individual staff discretion on a case-by-case basis rather than by strict fixed
  rules.
- **FD (the organization)** — owns the customer quota and the food supply that limits it.

## 3. Core Entities & Attributes

### Customer

| Attribute                   | Description                                                                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer number             | Unique number in range 1..N (e.g. 1..240). Determines call-up order at distribution. Freed and reassignable once a customer is archived.                                                                                                       |
| Name                        | First name and last name.                                                                                                                                                                                                                      |
| Date of birth               | Required — drives the age-13 classification (see 4.7).                                                                                                                                                                                         |
| Address                     | German address: street, house number, ZIP code, city.                                                                                                                                                                                          |
| Household members           | Name and date of birth of each family member (see Household Member).                                                                                                                                                                           |
| Number of grown-ups         | Household members aged 13+. **Derived** from the household members' birthdates, not entered by hand.                                                                                                                                           |
| Number of children          | Household members under 13. Age 13 is the exact cutoff — a child turns "grown-up" on that birthday. **Derived** like the grown-up count.                                                                                                       |
| Group / color               | "Red" or "Blue" — determines which weekly distribution the customer attends. Can change in individual cases; staff try to keep the two groups roughly equal in size, both when registering new customers and when moving existing ones.        |
| Portion allowance           | Number of food portions, derived from grown-up/children counts. Roughly a fixed amount per adult and per child, but can be adjusted up or down depending on currently available food supply or special occasions (e.g. Christmas).             |
| Price                       | Small amount the customer pays to receive food. **Derived per head**: a fixed price per grown-up and a fixed price per child, multiplied by the two counts. Unlike the portion allowance, it does _not_ flex with supply or special occasions. |
| Certificate (Bescheinigung) | Proof of need (e.g. from the Jobcenter); has a type and a validity period/expiry date.                                                                                                                                                         |
| Status                      | Active / temporarily blocked / archived. A temporary block is set **manually** by a staff member together with a **free-text reason**; it is lifted manually as well (see 4.5).                                                                |
| Reminder count              | Number of certificate-expiry reminders issued (0-3 typically; resets to 0 once a valid certificate is presented).                                                                                                                              |
| Current card number         | The customer's currently valid card number (see Customer Card).                                                                                                                                                                                |
| Comments / notes            | Free-text field for individual staff notes about the customer.                                                                                                                                                                                 |

### Household Member

Every person in the customer's household is registered individually, children included. **The
registered customer is themselves a household member** — a single-person household therefore has
exactly one member, and that member is counted in the grown-up count. The household composition —
and with it the grown-up/children counts, the portion allowance and the price — is derived from this
list rather than stored as two hand-maintained numbers.

| Attribute     | Description                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| Name          | First name and last name.                                                            |
| Date of birth | Determines whether the member currently counts as a grown-up (13+) or a child (<13). |

Households change over time (births, someone moving in or out). Members are simply **added or
removed**; no history of past compositions is kept for now.

### Customer Card

| Attribute                  | Description                                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card number                | `<customer number>` + `k` + a running index, e.g. customer 50's cards are numbered `50k1`, `50k2`, `50k3`, ... Only the most recently issued card number is valid; earlier ones for the same customer are invalidated on reissue. |
| Name                       | Printed on the card.                                                                                                                                                                                                              |
| Group / color              | Printed on the card (Red/Blue).                                                                                                                                                                                                   |
| Grown-up / children counts | Printed on the card; used to derive portion allowance and price.                                                                                                                                                                  |

### Distribution Record

Still minimal — neither who served the customer nor the exact amount handed out is tracked. Payment
is recorded only as a flag on this record; no amount, no separate payment date. The amount owed is
implied by the per-head prices in force at that point in time.

| Attribute | Description                                                                  |
| --------- | ---------------------------------------------------------------------------- |
| Customer  | Reference to the customer.                                                   |
| Date      | The distribution date.                                                       |
| Showed up | Whether the customer showed up and received food that week.                  |
| Paid      | Set by the staff member at hand-out, confirming the customer paid the price. |

### Week Cycle

- Two alternating distribution weeks: **Red week** and **Blue week**, strictly alternating by
  calendar rule — two weeks of the same color in a row cannot happen (would be considered unfair).
- Red-group customers collect only in a Red week; Blue-group customers only in a Blue week.
- Staff keep the two groups roughly equal in customer count, both at registration and when
  reassigning an existing customer's group.
- Introduced specifically to spread out the customer load (too many customers for a single weekly
  distribution).

### Waiting List

- Once the customer quota (N) is full, new applicants are placed on a waiting list rather than
  turned away outright.
- **Strictly first-come-first-served** — the applicant who has waited longest gets the next freed
  slot.
- An applicant can only be put on the waiting list **with a valid certificate already in hand**;
  the same eligibility bar as registration applies.
- **No cap** on the list's size — in practice it has never grown long enough to need one.

## 4. Process Descriptions

### 4.1 Food Distribution (on a distribution day)

**Precondition:** It is a Red or Blue distribution day.

1. Customer arrives at FD with their customer card.
2. Customers are called up in ascending order of their card/customer number.
3. Staff look up the customer by the number on the card.
4. Staff check the card/group is valid for today:
   - Wrong group (e.g. a Blue customer shows up on a Red week), or an invalid/outdated card
     number → the customer is simply turned away and told to come back on the correct week / with
     a valid card. This is not a block or an archiving event.
5. Staff check the certificate's validity — see 4.2 (Eligibility & Reminder Flow).
6. Staff issue the portion allowance (based on grown-up/children counts, food supply, and any
   special-occasion adjustments).
7. Customer pays the small price for their household: the price per grown-up times the grown-up
   count plus the price per child times the children count.
8. Staff record that the customer showed up and received food that week (date-stamped) and mark the
   record as **paid**.

### 4.2 Eligibility & Reminder Flow (certificate check)

1. At distribution, staff check whether the certificate on file is still within its validity
   period.
2. If valid: customer proceeds normally.
3. If expired:
   a. The customer still receives food this time.
   b. Staff verbally remind the customer to bring a valid certificate next time.
   c. Staff log the reminder (increments the reminder count).
4. If a valid, renewed certificate is presented at any point, the reminder count resets to 0.
5. Once the reminder count reaches 3 (staff may individually extend this in specific cases) and
   the certificate is still expired: the customer is told they can no longer receive food and is
   archived.

### 4.3 Customer Registration / Intake

**Preconditions:** applicant is not already an active customer; applicant holds a valid needs
certificate.

1. Applicant applies, presenting a valid needs certificate.
2. Staff check whether the applicant already exists in the archive (a previously archived
   customer) and reuse their existing record/information if found.
3. Staff check whether the customer quota (N) is full.
   - If full: applicant is placed on the waiting list (valid certificate required — see Waiting
     List).
   - If not full: registration proceeds.
4. Staff record the applicant's personal data — first name, last name, date of birth, address
   (street, house number, ZIP, city) — each household member with name and date of birth, and the
   certificate's type and validity period. Grown-up and children counts follow from the household
   members' birthdates.
5. Staff assign the next free customer number — a re-registering, previously archived customer
   gets a **new** number, not their old one — and a group (Red/Blue), chosen to keep group sizes
   roughly balanced.
6. Staff issue a customer card showing name, customer number + card index, group, and the
   grown-up/children counts.

**Outcome:** active customer with an issued card, or a waitlisted applicant.

### 4.4 Card Loss / Reissue

1. Customer reports a lost card.
2. Staff issue a new card: card number = customer number + `k` + next running index (e.g. `50k3`
   → `50k4`).
3. The new card number is recorded as the customer's valid card number; all previously issued
   card numbers for that customer become invalid.
4. There is no fixed limit on the number of reissues, but staff may individually decide to stop
   reissuing (and archive) a customer who loses their card unusually often.

### 4.5 Archiving Triggers

A customer can be archived for any of the following reasons (decided individually per case):

- Certificate stays expired after the reminder process (4.2) runs its course.
- No-show for several consecutive weeks without informing FD.
- Other individually judged reasons (e.g. suspected fraud/scamming of the system).

A customer can also be **temporarily blocked** rather than archived. There are no rule-based
triggers: a staff member sets the block manually and enters a **free-text reason**. It has no fixed
duration and is lifted manually by a staff member when they judge the reason resolved. While
blocked, the customer keeps their customer number and record. Beyond the reason text, nothing about
a block is recorded today — not who set it, not when, and no history of earlier blocks.

Archiving is also what **frees a slot**: someone who is no longer a customer has to be archived so
that their number becomes available to a new applicant (4.6). Archived records are kept
**indefinitely** — there is currently no deletion or retention rule, though this may change.

### 4.6 Number / Slot Reassignment

1. Customer is archived (via 4.5).
2. Their customer number becomes a free slot.
3. The freed number is assigned to the next new (or re-registering) customer during a future
   registration (4.3).

#### 4.7 Age-Based Reclassification

Today this is not systematically detected — it is unclear whether the Excel sheet derives it at all,
so in practice it is caught informally. **In the future system it must happen automatically:** since
every household member is registered with a date of birth, the grown-up/children split is a derived
value that flips on the member's 13th birthday without any staff action.

1. A child in a customer's household reaches their 13th birthday.
2. The system reclassifies them as a grown-up automatically; the grown-up/children counts change
   with no manual edit.
3. Portion allowance and price follow from the new counts.
4. The printed card now shows outdated counts, so a new card is issued reflecting the updated ones
   (old card invalidated per the reissue mechanics in 4.4). The system should make staff aware that
   a reissue is due. The reissue should happen **as soon as practical, but it is not urgent** — a
   customer whose card still shows the old counts is not turned away.

## 5. Possible Future Requirements

Not needed for the first version, but flagged by FD as likely later — worth keeping in mind so the
data model does not preclude them.

- **Reporting / statistics**, e.g. total portions distributed per week or month, attendance rates,
  customer counts per group. This is a non-blocking, lower-priority item for later scoping. It
  mainly implies that distribution records are kept over time rather than overwritten each week.

## 6. Open Questions

All earlier questions about household semantics, blocks, card reissue and retention have been
answered by FD and are folded into the sections above. What remains open:

1. **Concrete policy values:** The actual numbers are still unknown — the price per grown-up and per
   child, the standard portions per grown-up and per child, and the customer quota `N`. Needed as
   initial configuration data, not as structure.
2. **Contact details:** The agreed field list has no phone number or e-mail. Is that deliberate
   (contact only happens in person at distribution), or simply not mentioned yet? Relevant if
   certificate-expiry reminders should ever be sent rather than given verbally.
3. **Reporting scope:** If/when reporting becomes a requirement, which figures matter and to whom
   (internal review, donors, municipality)? See §5.
