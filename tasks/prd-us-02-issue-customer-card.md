# PRD: US-02 — Issue a Customer Card (Digital)

> Source story: `docs/user_stories_mvp.md` §US-02 (Tier 1). Depends on **US-01**. Extended by
> **US-09** (reissue after loss) and **US-13** (reissue after a 13th birthday).

## 1. Introduction

Every customer carries a card with a number that identifies them at the counter and sets their
call-up order. The card number is `<customer number>` + `k` + a running index — customer 50's cards
are `50k1`, `50k2`, `50k3`. Only the most recently issued number is valid; issuing a new one
invalidates every earlier one immediately.

The MVP displays the card **digitally** — a card view on screen. Producing the physical card is done
by a separate, existing system and is explicitly out of scope; the software only needs to show the
data so it can be transcribed or fed into that system.

## 2. Goals

- A `CardNumber` value object that parses, formats and increments, tested exhaustively.
- Exactly one valid card per customer, enforced in the domain **and** in the database.
- A card view showing everything printed on a physical card.
- Reissue mechanics available as one reusable use case for US-09 and US-13.

## 3. User Stories

### US-02.1: `CardNumber` value object (domain)

**Description:** As a developer, I need a value object for card numbers so `50k3` is never handled as
an ad-hoc string.

**Acceptance Criteria:**

- [ ] `src/domain/card/cardNumber.ts` exports `format(customerNumber, index)`, `parse(text)` and
      `next(cardNumber)`
- [ ] `format(50, 3)` → `'50k3'`; `parse('50k3')` → `{ customerNumber: 50, index: 3 }`
- [ ] `next({50, 3})` → `{50, 4}`
- [ ] `parse` returns a typed `InvalidCardNumber` error for: empty string, `'50'` (no `k`), `'k3'`,
      `'50k0'`, `'50k'`, `'50K3'` (case — decide and document; default: case-insensitive `k`),
      `'050k3'` (leading zeros rejected), `'50k3x'`, negative numbers
- [ ] Index starts at 1, never 0
- [ ] Pure module — no I/O, no clock

### US-02.2: `issueCard` use case (application)

**Description:** As a developer, I need one use case that issues the next card for a customer and
invalidates the previous one, reused by first issue, loss and stale-count reissue.

**Acceptance Criteria:**

- [ ] `issueCard(deps, { customerId, reason })` creates a card with `index = maxExistingIndex + 1`
      (or 1 if none) and marks it the customer's current card
- [ ] All earlier cards for that customer become invalid as a direct consequence — validity is
      **derived from being the highest index**, not a separate mutable flag that can drift
- [ ] Rejects with a typed error if the customer is archived
- [ ] Writes an audit entry recording the reason (`FIRST_ISSUE` | `LOST` | `STALE_COUNTS` | `OTHER`)
- [ ] Tested with fakes: first issue, second issue, issue for archived customer, issue after a gap
      in indices (must still take max+1)

### US-02.3: Card persistence and current-card query (infrastructure)

**Acceptance Criteria:**

- [ ] `Card` model already introduced in US-01.5; add `reason` and confirm
      `@@unique([customerId, index])`
- [ ] `PrismaCardRepository` exposes `currentCard(customerId)` returning the highest index, and
      `issue(customerId, index, reason)`
- [ ] Integration test proves two different customers may both hold `50k1` (different surrogate ids)
- [ ] Integration test proves a concurrent double-issue cannot create two cards with the same index
      (unique constraint surfaces as a typed error)

### US-02.4: Card view (presentation)

**Description:** As a staff member, I want to see all card information on screen so I can transcribe
it onto the physical card or feed it into the printing system.

**Acceptance Criteria:**

- [ ] Route `/kunden/[id]/karte` renders: card number, first name, last name, group (Red/Blue as a
      coloured German label), grown-up count, children count
- [ ] Counts are read live from the derived composition (US-01.1), so the view can never show a stale
      number relative to the database
- [ ] The view states plainly, in German, that this is the current card and which numbers it replaced
- [ ] Layout is card-shaped and legible enough to read across a desk; it is **not** a print stylesheet
- [ ] A "reissue card" action is present but its behaviour is specified in US-09
- [ ] Verify in browser using dev-browser skill

### US-02.5: E2E — card is issued on registration and shown

**Acceptance Criteria:**

- [ ] Playwright spec: register a customer (US-01 flow), land on the card view, assert card number
      matches `^\d+k1$` and name, group and counts match the input

## 4. Functional Requirements

- FR-1: The card view must show card number, first name, last name, group, grown-up count and
  children count.
- FR-2: The card number must be `<customer number>` + `k` + running index, starting at 1.
- FR-3: Exactly one card number per customer must be valid at a time; issuing a new one invalidates
  all earlier ones immediately.
- FR-4: Card validity must be derived from the highest issued index, not stored as an independently
  mutable flag.
- FR-5: All card information must be presented digitally in the application. The MVP must not attempt
  to produce a physical or printable card.
- FR-6: Card numbers must not be assumed unique across the archive — `50k1` may recur for a different
  person after slot 50 is reassigned.

## 5. Non-Goals

- **No printing** — no print stylesheet, no PDF, no printer integration. Handled by FD's existing
  separate system.
- No barcode or QR code.
- No card expiry date.
- No limit on the number of cards a customer may hold over time (US-09).

## 6. Technical Considerations

- `CardNumber` is display data only. Never key a row or a foreign key by it (architecture sketch §5.3).
- Because slot 50 can be reassigned, any lookup by card number must resolve to the **active** holder
  of that number (US-04 handles the ambiguity rules).

## 7. Success Metrics

- 100% branch coverage on `cardNumber.ts` — it is small, pure and load-bearing.
- No code path can produce two simultaneously valid cards for one customer.

## 8. Open Questions

- Should the `k` be accepted case-insensitively when staff type a card number at the counter?
  (Assumed: yes on input, always lowercase on output.)
- Does FD's printing system need a specific export format later, or is on-screen transcription
  sufficient indefinitely?
