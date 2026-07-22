# PRD: US-08 — Block and Unblock a Customer

> Source story: `docs/user_stories_mvp.md` §US-08 (Tier 2). Depends on **US-01**. Surfaces on the
> counter screen via **US-04**.

## 1. Introduction

Sometimes a customer needs to be paused without losing their place — a dispute, suspected misuse, a
situation staff want to resolve before the next hand-out. FD handles this today as a purely manual
decision with a free-text reason, lifted manually whenever staff judge the matter settled.

The block is temporary and keeps everything: the customer number, the card and the record. It does
**not** free a slot. The reason text is the only account of a block that exists — there is no history,
no duration, no automatic expiry, and (since there is no login) no record of who set it.

## 2. Goals

- Block a customer in one action, with a mandatory written reason.
- Make the reason unmissable at the counter, so any colleague understands why.
- Lift a block in one action, returning the customer to active.
- Never trigger a block automatically, and never expire one automatically.

## 3. User Stories

### US-08.1: Status transitions (domain)

**Description:** As a developer, I need customer status transitions modelled as a small state machine
so illegal transitions are impossible rather than merely unlikely.

**Acceptance Criteria:**

- [ ] `src/domain/customer/status.ts` defines `Status = 'ACTIVE' | 'BLOCKED' | 'ARCHIVED'` and
      `transition(from, to)` returning the new status or a typed `IllegalStatusTransition` error
- [ ] Allowed: `ACTIVE → BLOCKED`, `BLOCKED → ACTIVE`, `ACTIVE → ARCHIVED`, `BLOCKED → ARCHIVED`
- [ ] Refused: any transition **out of** `ARCHIVED` (re-registration creates a new customer — US-11),
      and any no-op transition (`ACTIVE → ACTIVE`)
- [ ] `blockReason` is required for `→ BLOCKED`: an empty or whitespace-only reason yields
      `MissingAuditReason("customer.blocked")` — the existing error from `errors.ts`, not a new class.
      A block is one of the changes where the reason _is_ the record (a settings edit is not, and
      accepts an empty one)
- [ ] Every transition pair, legal and illegal, has a test

### US-08.2: `blockCustomer` / `unblockCustomer` use cases (application)

**Acceptance Criteria:**

- [ ] `blockCustomer(deps, { customerId, reason })` sets status `BLOCKED` and stores the reason
- [ ] The reason is trimmed; an empty result rejects with `MissingAuditReason`
- [ ] `unblockCustomer(deps, { customerId })` returns the customer to `ACTIVE` and clears the reason
- [ ] Neither use case changes the customer number, the card, or any distribution record
- [ ] Blocking does **not** free the customer's slot — asserted by a test that the taken-numbers query
      still includes it
- [ ] Both write audit entries carrying the reason (what/when/why, never who)
- [ ] Tested with fakes, including blocking an already-blocked customer (rejected) and unblocking an
      active one (rejected)

### US-08.3: Block fields (infrastructure)

**Acceptance Criteria:**

- [ ] `Customer.status` and `Customer.blockReason String?` on the existing model
- [ ] A check-style guarantee — enforced in the repository or by a Prisma-level invariant test — that
      `blockReason` is non-null exactly when `status = 'BLOCKED'`
- [ ] The **active-number** partial unique index (US-01.5) treats `BLOCKED` as occupying the slot,
      exactly like `ACTIVE`; only `ARCHIVED` is exempt. Integration test proves it
- [ ] Migration committed

### US-08.4: Block and unblock UI (presentation)

**Acceptance Criteria:**

- [ ] The customer record (US-16) and the counter screen offer "Sperren" with a required multi-line
      reason field; the save control is disabled until the reason is non-empty
- [ ] A blocked customer's counter screen shows the reason verbatim in the verdict banner (US-04),
      visually dominant
- [ ] "Sperre aufheben" is available from the same places and asks for a confirmation before lifting
- [ ] The customer list (US-15) shows blocked status as a filterable badge
- [ ] All strings from `src/i18n/de.ts`
- [ ] Verify in browser using dev-browser skill

### US-08.5: E2E — blocked customer at the counter

**Acceptance Criteria:**

- [ ] Playwright spec: block a customer with a reason → look them up at the counter → assert the
      reason is displayed and no serve action is offered
- [ ] Spec asserts an empty reason cannot be submitted
- [ ] Spec lifts the block and asserts the customer becomes servable again with the same customer
      number and the same card number as before

## 4. Functional Requirements

- FR-1: Blocking must require a free-text reason and must be impossible to save empty.
- FR-2: There must be no automatic triggers — a block is always a manual decision.
- FR-3: A blocked customer must keep their customer number, card and record, and must not free a slot.
- FR-4: The block and its reason must be shown prominently on the lookup screen.
- FR-5: Any staff member must be able to lift the block; there is no fixed duration and no automatic
  expiry.
- FR-6: Lifting a block must return the customer to active.
- FR-7: A blocked customer must not be servable at the counter.

## 5. Non-Goals

- **No block history** — FD is explicit that nothing beyond the current reason is tracked today.
  Earlier blocks are not retained or listed.
- No record of who blocked or when (no login; the audit log records what/when/why only).
- No block duration, scheduled expiry or reminder to review.
- No rule-based or automatic blocking of any kind.
- No block categories or reason templates — free text is deliberate.

## 6. Design Considerations

- The reason is the entire institutional memory of a block. Give it a generous multi-line field and
  show it in full at the counter — never truncate it behind a "more" link.
- Avoid enforcing a format on the reason; the story is explicit that this argues for staff writing
  useful reasons, not for the software policing them.

## 7. Technical Considerations

- Blocking is a status transition, not a soft delete: the row stays queryable and the slot stays taken.
- Because the block reason is cleared on unblock, the audit log is the only place the text survives.
  That is consistent with "no block history" for the user-facing product while keeping the append-only
  trail intact.

## 8. Success Metrics

- Any staff member at the counter can state why a customer is blocked, without asking a colleague.
- Zero blocks saved without a reason.

## 9. Open Questions

- On unblocking, should the previous reason be shown one last time as a confirmation ("lifting: …")?
  Assumed yes — it costs nothing and prevents lifting the wrong block.
- If FD later wants block history, the audit log already carries it; surfacing it is an additive change.
