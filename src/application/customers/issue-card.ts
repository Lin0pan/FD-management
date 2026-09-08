/**
 * Issue a customer's next card. First issue (US-02), a lost card (US-09) and counts a birthday
 * overtook (US-13) differ only in the reason they record, so they are one use case rather than three
 * paths that could drift apart.
 *
 * Issuing invalidates every earlier card as a consequence: the new card carries the highest index,
 * and the highest index *is* what valid means (FR-4).
 */

import type { CardIssueReason, IssuedCard } from "@/domain/card/card";
import { nextCardIndex } from "@/domain/card/cardNumber";
import { composition } from "@/domain/customer/householdComposition";
import { CustomerArchived, CustomerNotFound } from "@/domain/errors";
import type { AuditLog, CardRepository, Clock, CustomerRepository } from "../ports";

/**
 * The audit event name every card issue is recorded under. Exported because a number change prints a
 * card inside its own transaction and so cannot go through this use case (US-30) — sharing the
 * constant makes the two entries identical by construction rather than by two literals agreeing.
 */
export const CARD_ISSUED = "customer.card.issued";

/** Which card they hold, and no more — the index it moved to is on the card row itself. */
export const ISSUED_FIELDS = ["card"] as const;

export interface IssueCardDeps {
  readonly customers: CustomerRepository;
  readonly cards: CardRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
}

export interface IssueCardInput {
  readonly customerId: number;
  readonly reason: CardIssueReason;
}

/**
 * Issue the next card for a customer and hand it back as it was stored.
 *
 * @throws {CustomerNotFound} if no customer has that id.
 * @throws {CustomerArchived} if the customer has left the register.
 * @throws {CardNumberTaken} if the index was taken on the *slot* between the read of its run and the
 *   write (US-25).
 * @throws {CardIndexTaken} if the *record's* run went stale the same way. The store raises both
 *   races and only the screens tell them apart (`registration-input.ts`).
 */
export async function issueCard(
  deps: IssueCardDeps,
  { customerId, reason }: IssueCardInput,
): Promise<IssuedCard> {
  // One read of the clock: the card's date and the audit entry's instant are the same event.
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }
  // A blocked customer stays registered (US-08) and may be issued a card; an archived one holds no
  // slot at all.
  if (customer.status === "ARCHIVED") {
    throw new CustomerArchived(customerId);
  }

  // The run belongs to the *slot*, not to this record: a household that took over a number counts on
  // from the card the previous holder walked away with, so no card number is printed twice (US-25). A
  // slot nobody has held answers 0, so a first card needs no branch of its own.
  const index = nextCardIndex(await deps.cards.highestIndexForNumber(customer.customerNumber));

  // Written *with* the card because the card leaves the building: from here the household can change
  // and this snapshot cannot, which is what makes a stale card detectable (US-13.3).
  const countsAtIssue = composition(customer.details.householdMembers, now);

  const card = await deps.cards.issue(customerId, {
    index,
    issuedAt: now,
    reason,
    countsAtIssue,
  });
  // The reason *is* the why — chosen by a human from a closed set, and more legible months later
  // than a sentence typed beside it.
  await deps.audit.append({
    what: CARD_ISSUED,
    changedFields: [...ISSUED_FIELDS],
    when: now,
    why: reason,
  });
  return card;
}
