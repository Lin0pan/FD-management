# PRD: US-04 — Look Up a Customer by Card Number

> Source story: `docs/user_stories_mvp.md` §US-04 (Tier 1). Depends on **US-01, US-02, US-03, US-07**
> and reads state produced by **US-06** (reminders) and **US-08** (blocks).
>
> **This is the single most valuable screen in the product.** Everything a staff member currently
> reconstructs by eye from spreadsheet columns must arrive here as one verdict.

## 1. Introduction

At the counter, customers are called in ascending card-number order. A staff member types the number
from the card and must immediately know: is this person allowed to collect today, how many portions
do they get, what do they pay, and is there anything I need to say to them. Today that means scanning
a spreadsheet row and interpreting several columns at once, under time pressure, with a queue waiting.

This feature replaces that with a single lookup that returns **one unmissable verdict** plus the
supporting data.

## 2. Goals

- One input accepts either a card number (`50k3`) or a plain customer number (`50`).
- The verdict is computed by a pure function so every branch is unit-tested, not assembled in JSX.
- The verdict is visually unmissable and stated in plain German.
- Turning someone away for the wrong group or an invalid card records nothing and changes nothing.
- An unknown number produces a clear "not found", never an empty screen.

## 3. User Stories

### US-04.1: `evaluateCustomerAtCounter` — the verdict rule (domain)

**Description:** As a developer, I need a pure function that takes a customer's state, today's week
colour and today's date, and returns exactly one verdict, so the counter decision is testable in
milliseconds and cannot drift between screens.

**Acceptance Criteria:**

- [ ] `src/domain/distribution/counterVerdict.ts` exports `evaluateAtCounter(input): Verdict`
- [ ] `Verdict` is a discriminated union with exactly these cases: `NOT_FOUND`, `ARCHIVED`, `BLOCKED`
      (carries the reason), `WRONG_GROUP` (carries the customer's group and today's colour),
      `OUTDATED_CARD` (carries the presented and the current card number), `CLEAR_TO_SERVE`, and
      `CLEAR_TO_SERVE_CERTIFICATE_EXPIRED` (carries the expiry date and reminder count)
- [ ] **Precedence is fixed and tested**: `NOT_FOUND` → `ARCHIVED` → `BLOCKED` → `WRONG_GROUP` →
      `OUTDATED_CARD` → certificate check → `CLEAR_TO_SERVE`. Every ordering pair has a test
- [ ] An expired certificate **never** produces a blocking verdict — it is a serve-with-a-reminder case
- [ ] `ALREADY_SERVED_TODAY` is included as a verdict case (needed by US-05's duplicate prevention)
- [ ] Pure — takes `today` and `weekColour` as parameters, no clock, no I/O

### US-04.2: `lookupCustomer` use case (application)

**Description:** As a developer, I need a use case that resolves a typed number to a customer and
returns the verdict together with everything the screen shows.

**Acceptance Criteria:**

- [ ] Accepts a raw string; parses it as a card number (`50k3`) or a bare customer number (`50`)
- [ ] A bare customer number resolves to the **active** holder of that slot; if only archived
      customers ever held it, the verdict is `ARCHIVED` for the most recent holder
- [ ] A card number whose index is lower than the holder's current index yields `OUTDATED_CARD`
- [ ] A card number whose customer number is unassigned yields `NOT_FOUND`
- [ ] The result carries: name, customer number, group, grown-up/children counts, portion allowance,
      price in cents, certificate expiry, status, reminder count, notes, current card number, and
      consecutive-no-show count (US-10)
- [ ] Counts, portions and price are computed at read time from birthdates and the settings in force
      **today**, never read from stored columns
- [ ] The use case performs **no writes at all** — proven by a test asserting the fake repository
      received no mutations for every verdict branch
- [ ] Tested against fakes for all seven verdict branches

### US-04.3: Lookup queries (infrastructure)

**Acceptance Criteria:**

- [ ] `PrismaCustomerRepository.findByCustomerNumber(n)` returns the active holder, plus the most
      recent archived holder when there is no active one
- [ ] Indexes on `Customer.customerNumber` and `Customer.status` so the counter query stays instant
- [ ] Household members, certificate and cards are loaded in one query (no N+1 at the counter)
- [ ] Integration test with a reassigned slot: an archived and an active customer both holding
      number 50 resolve correctly

### US-04.4: Counter lookup screen (presentation)

**Description:** As a staff member, I want to type a number and see one clear answer, so I can serve a
queue quickly.

**Acceptance Criteria:**

- [ ] Route `/ausgabe` shows the week-colour banner (US-03) and a single, auto-focused number input
- [ ] Submitting with Enter performs the lookup; the input re-focuses and clears for the next customer
- [ ] The verdict renders as a full-width banner with a distinct colour **and** an explicit German
      sentence and icon — never colour alone:
  - Wrong group → "Blaue Kundin/Blauer Kunde — rote Woche. Wegschicken, nächste Woche wieder."
  - Outdated card → "Karte 50k2 ist ungültig, aktuelle Karte ist 50k3."
  - Blocked → the block reason, verbatim and prominent
  - Archived → archived, not eligible
  - Certificate expired → serve, remind, log (links to US-06's action)
  - Otherwise → clear to serve
- [ ] Below the verdict: name, customer number, group, counts, portion allowance, price, certificate
      expiry, status, reminder count and staff notes — all visible **without further clicks**
- [ ] An unknown number renders "Nummer nicht gefunden" and keeps the input focused
- [ ] The serve action (US-05) is present only when the verdict permits it
- [ ] All strings from `src/i18n/de.ts`
- [ ] Verify in browser using dev-browser skill

### US-04.5: E2E — every verdict at the counter

**Acceptance Criteria:**

- [ ] Playwright spec seeds one customer per verdict and asserts the banner text for each
- [ ] Spec asserts that looking up a wrong-group customer and an outdated card leaves the database
      unchanged (no distribution record, no reminder, no status change)
- [ ] Spec asserts an unknown number shows "not found" rather than an empty page

## 4. Functional Requirements

- FR-1: Entering either a card number (`50k3`) or a plain customer number (`50`) must find the customer.
- FR-2: The result must show, without further clicks: name, customer number, group, grown-up and
  children counts, portion allowance, price, certificate expiry, status, reminder count and staff notes.
- FR-3: The screen must state a clear verdict, visually unmissable, for each of: wrong group,
  outdated card, blocked, archived, certificate expired, and clear to serve.
- FR-4: Being turned away for the wrong group or an invalid card must record nothing and change
  nothing — it is neither a block nor an archiving event.
- FR-5: An unknown number must give a clear "not found" message.
- FR-6: The verdict precedence must be fixed, documented and tested.
- FR-7: Portion allowance and price must be computed at read time from the settings in force today.

## 5. Non-Goals

- No barcode scanning — the number is typed.
- No fuzzy matching or name search on this screen (that is US-15).
- No queue management or call-up display.
- No recording of turn-aways.

## 6. Design Considerations

- Optimise for a keyboard-only loop: type number → Enter → read verdict → press the serve key →
  input is focused again. A staff member should never need the mouse for the happy path.
- The verdict banner must be readable from a metre away — this screen is used standing up.
- Reuse one `<VerdictBanner>` component keyed by the discriminated union so a new verdict case is a
  compile error until it is rendered.

## 7. Technical Considerations

- The verdict union is the contract between domain and UI. Make the UI switch exhaustive
  (`never`-check in the default branch) so adding a case cannot silently render nothing.
- Everything on this screen is a read. Enforce it: the use case takes read-only ports.

## 8. Success Metrics

- Median time from typing a number to a rendered verdict under 200 ms on the staff MacBook.
- A staff member new to the app can state the correct action for each verdict without training.
- Zero counter decisions that require opening a second screen.

## 9. Open Questions

- When a card number is typed whose slot has since been reassigned to a **different** person, should
  the screen say "this card belongs to a former customer" rather than showing the current holder?
  (Assumed: match on customer number, then compare the card index against the current holder's, which
  yields `OUTDATED_CARD` — but the wording should make the ambiguity impossible to misread.)
- Should the screen show the customer's photo? (Not in the agreed field list; no photos are stored.)
