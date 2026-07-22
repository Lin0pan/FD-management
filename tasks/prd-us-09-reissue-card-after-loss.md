# PRD: US-09 — Reissue a Card After Loss

> Source story: `docs/user_stories_mvp.md` §US-09 (Tier 2). Depends on **US-02** (`issueCard`).
> Shares its mechanics with **US-13** (reissue after a 13th birthday).

## 1. Introduction

Customers lose cards. When they do, staff issue a replacement that reuses the customer number with
the next running index — `50k3` becomes `50k4` — and the lost card stops working immediately. The
customer keeps collecting food; nothing about their status changes.

There is no limit on reissues, and the system never enforces one. But staff may decide case by case to
stop reissuing for someone who loses cards unusually often, so the **count of reissues so far must be
visible** — the judgement is theirs, the information is the software's job.

## 2. Goals

- Reissue in one action from the customer record or the card view.
- The new number is the only valid one, immediately.
- An old card presented at the counter shows "invalid card" and nothing else happens.
- The reissue count is visible so staff can spot a pattern.

## 3. User Stories

### US-09.1: `reissueCard` use case (application)

**Description:** As a staff member, I want to issue a replacement card in one action so a customer who
lost theirs can collect today.

**Acceptance Criteria:**

- [ ] `reissueCard(deps, { customerId, reason: 'LOST' })` delegates to `issueCard` (US-02.2) — there is
      **one** card-issuing code path, not two
- [ ] The new card's index is the previous maximum + 1; every earlier card for that customer becomes
      invalid as a consequence
- [ ] The customer's status, customer number, group, reminder count and distribution history are
      unchanged — asserted by a test
- [ ] There is **no limit check** — the tenth reissue succeeds exactly like the second
- [ ] Rejects only for an archived customer
- [ ] Writes an audit entry with reason `LOST`
- [ ] Tested with fakes, including reissuing twice in a row

### US-09.2: Reissue count query (application + infrastructure)

**Description:** As a staff member, I want to see how many cards a customer has been issued so I can
judge whether they are losing them unusually often.

**Acceptance Criteria:**

- [ ] The customer read model exposes `cardsIssued` (the current index) and `reissuesForLoss` (the
      count of cards with reason `LOST`)
- [ ] The two are reported separately, so a reissue caused by a 13th birthday (US-13) is not counted
      against the customer as a loss
- [ ] Repository query is a single aggregate, not a load-all-and-count in application code
- [ ] Integration test seeds a mixed history (first issue, loss, stale-counts, loss) and asserts
      `cardsIssued = 4`, `reissuesForLoss = 2`

### US-09.3: Reissue UI (presentation)

**Acceptance Criteria:**

- [ ] "Karte neu ausstellen (Verlust)" action on the card view (US-02.4) and the customer record (US-16)
- [ ] A confirmation step states the old number and the number that will be issued, before writing
- [ ] After reissue the card view shows the new number and states that all earlier numbers are invalid
- [ ] The card view shows the reissue count, with the loss-caused count called out separately
- [ ] The system never warns, blocks or nags about a high count — it only displays it
- [ ] Verify in browser using dev-browser skill

### US-09.4: E2E — old card is refused, new card works

**Acceptance Criteria:**

- [ ] Playwright spec: reissue a card for a customer holding `Nk1`, assert the new number is `Nk2`
- [ ] Look up `Nk1` at the counter → assert the German "invalid card, current card is Nk2" verdict and
      that no distribution record, block or archive resulted
- [ ] Look up `Nk2` → assert clear to serve
- [ ] Spec reissues twice more and asserts the displayed reissue count reaches 3

## 4. Functional Requirements

- FR-1: The new card number must reuse the customer number with the next running index.
- FR-2: The new number must become the only valid one; every earlier number for that customer must be
  invalid.
- FR-3: Presenting an old card at the counter must show "invalid card" and turn the customer away —
  it must not block or archive them, and must record nothing.
- FR-4: There must be no limit on the number of reissues, and the system must not prevent a further one.
- FR-5: The number of reissues so far must be visible, with loss-caused reissues distinguishable from
  reissues caused by changed household counts.

## 5. Non-Goals

- No enforcement or warning threshold on reissues — the judgement is entirely the staff's.
- No fee for a replacement card.
- No record of when or how the card was lost beyond the reason code and the audit timestamp.
- No printing (US-02 non-goal applies).
- No invalidation of the old card as a separate step — validity is derived from the highest index.

## 6. Technical Considerations

- This story adds almost no new mechanics: it is `issueCard` with a reason plus a count query. Resist
  the temptation to write a parallel implementation — a second issuing path is exactly how "exactly one
  valid card" invariants break.
- The counter's `OUTDATED_CARD` verdict (US-04.1) is what makes the old card stop working; no card row
  is mutated on reissue.

## 7. Success Metrics

- Reissuing takes under 30 seconds at the counter.
- No code path can leave two valid cards, however many reissues occur.

## 8. Open Questions

- Should a reissue be possible for a **blocked** customer? Assumed yes (a block is temporary and does
  not touch the card), but **confirm with FD**.
- Does FD want a free-text note attached to a reissue (e.g. "left at the bus stop")? Not in the agreed
  fields; the general notes field (US-16) covers it if needed.
