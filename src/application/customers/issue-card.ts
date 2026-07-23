/**
 * Issue a customer's next card — the one path by which any card comes into existence.
 *
 * First issue (US-02), a replacement for a lost card (US-09) and a replacement whose printed counts
 * a birthday has overtaken (US-13) differ only in the reason they record, so they are the same use
 * case with a different `reason` rather than three code paths that could drift apart. Issuing
 * invalidates every earlier card of that customer as a direct consequence: the new card carries the
 * highest index, and the highest index *is* what valid means (FR-4).
 */

import type { CardIssueReason, IssuedCard } from "@/domain/card/card";
import { nextCardNumber } from "@/domain/card/cardNumber";
import { CustomerArchived, CustomerNotFound } from "@/domain/errors";
import type { AuditLog, CardRepository, Clock, CustomerRepository } from "../ports";

/** The audit event name every card issue is recorded under. */
const CARD_ISSUED = "customer.card.issued";

/**
 * What the audit entry names as changed.
 *
 * A card issue changes exactly one thing about the customer — which card they hold — and the index
 * it moved to is on the card itself, so listing it here would only repeat the row.
 */
const ISSUED_FIELDS = ["card"] as const;

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
 */
export async function issueCard(
  deps: IssueCardDeps,
  { customerId, reason }: IssueCardInput,
): Promise<IssuedCard> {
  // One read of the clock for the whole issue: the card's date and the audit entry's instant are
  // the same event and would be read separately as two.
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }
  // A blocked customer is turned away at the counter but stays registered (US-08), so they may still
  // be issued a card. An archived one holds no slot at all.
  if (customer.status === "ARCHIVED") {
    throw new CustomerArchived(customerId);
  }

  // The index is asked of the card number value object rather than incremented here, so "the next
  // card is the next index" is stated in one place. A customer with no card yet starts at 1.
  const current = await deps.cards.currentCard(customerId);
  const index =
    current === null
      ? 1
      : nextCardNumber({ customerNumber: customer.customerNumber, index: current.index }).index;

  const card = await deps.cards.issue(customerId, { index, issuedAt: now, reason });
  // The reason *is* the why: it was chosen by a human from a closed set, and a sentence typed beside
  // it would say the same thing less legibly to whoever reads the log months later.
  await deps.audit.append({
    what: CARD_ISSUED,
    changedFields: [...ISSUED_FIELDS],
    when: now,
    why: reason,
  });
  return card;
}
