/**
 * Take back a tick on „Karten drucken" — offered only right after it was made, a mis-click being the
 * one thing it exists for, so no reason is asked (US-39, D7). The audit log keeps both events.
 */

import { unmarkPrinted } from "@/domain/card/card";
import { heldCard, type CardPrintDeps, type CardPrintInput } from "./mark-card-printed";

export const CARD_PRINT_UNDONE = "customer.card.printUndone";

/**
 * @throws {CustomerNotFound} if no customer has that id.
 * @throws {CustomerArchived} if the customer has left the register.
 * @throws {CardSuperseded} if `index` is not the card they hold.
 * @throws {CardNotPrinted} if the card carries no tick to take back.
 */
export async function undoCardPrinted(deps: CardPrintDeps, input: CardPrintInput): Promise<void> {
  const now = deps.clock.now();
  const card = unmarkPrinted(await heldCard(deps, input));
  await deps.cards.setPrintedAt(input.customerId, card.index, card.printedAt);
  await deps.audit.append({
    what: CARD_PRINT_UNDONE,
    changedFields: ["printedAt"],
    when: now,
    why: "",
  });
}
