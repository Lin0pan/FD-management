/**
 * Tick a household's card off as printed (US-39). A card is named by the row DF saw — household and
 * index — so a card replaced since is refused rather than a newer one ticked off in its place (D4).
 */

import { markPrinted, type IssuedCard } from "@/domain/card/card";
import { CardSuperseded, CustomerArchived, CustomerNotFound } from "@/domain/errors";
import type { AuditLog, CardRepository, Clock, CustomerRepository } from "../ports";

export const CARD_PRINTED = "customer.card.printed";

export interface CardPrintDeps {
  readonly customers: CustomerRepository;
  readonly cards: CardRepository;
  readonly clock: Clock;
  readonly audit: AuditLog;
}

export interface CardPrintInput {
  readonly customerId: number;
  readonly index: number;
}

/**
 * The card the household holds, provided it is the one at `index`. Shared with `undoCardPrinted`,
 * whose guards are the same. A blocked household passes (D6).
 *
 * @throws {CustomerNotFound} if no customer has that id.
 * @throws {CustomerArchived} if the customer has left the register.
 * @throws {CardSuperseded} if `index` is not the card they hold.
 */
export async function heldCard(
  deps: CardPrintDeps,
  { customerId, index }: CardPrintInput,
): Promise<IssuedCard> {
  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }
  if (customer.status === "ARCHIVED") {
    throw new CustomerArchived(customerId);
  }
  const card = await deps.cards.currentCard(customerId);
  if (card === null || card.index !== index) {
    throw new CardSuperseded(customerId, index);
  }
  return card;
}

/**
 * @throws {CustomerNotFound} if no customer has that id.
 * @throws {CustomerArchived} if the customer has left the register.
 * @throws {CardSuperseded} if `index` is not the card they hold.
 * @throws {CardAlreadyPrinted} if the card was ticked off already — the first date stands.
 */
export async function markCardPrinted(deps: CardPrintDeps, input: CardPrintInput): Promise<void> {
  const now = deps.clock.now();
  const card = markPrinted(await heldCard(deps, input), now);
  await deps.cards.setPrintedAt(input.customerId, card.index, card.printedAt);
  // The changed field is the whole statement, so there is no why to ask for.
  await deps.audit.append({
    what: CARD_PRINTED,
    changedFields: ["printedAt"],
    when: now,
    why: "",
  });
}
