/**
 * Replace the card a customer holds — the counter's answer to "I lost it" (US-09.2).
 *
 * A reissue is not a second kind of card issue, so this is not a second implementation: it hands
 * straight to {@link issueCard}, which is the one path by which any card comes into existence. That
 * is the whole point of the module. A parallel implementation is exactly how the "exactly one valid
 * card" invariant breaks (tasks/prd-us-09-reissue-card-after-loss.md §6): the new card carries the
 * next index, and the highest index *is* what valid means, so every earlier number stops working as
 * a consequence of the write rather than through a second step that could be forgotten (FR-2).
 *
 * What the narrower {@link ReissueReason} adds is the one thing delegation alone cannot say: a
 * replacement can never be recorded as a `FIRST_ISSUE`. The reason a card was reissued is what makes
 * the count of losses readable later (FR-5), and a replacement filed as a first issue would be lost
 * from that count for good.
 *
 * There is deliberately **no limit check** (FR-4). The tenth reissue is written exactly like the
 * second; whether a household is losing cards too often is a judgement staff make from the count the
 * card view shows them, not one the software makes for them.
 */

import type { CardIssueReason, IssuedCard } from "@/domain/card/card";
import { issueCard, type IssueCardDeps } from "./issue-card";

/**
 * Why a card was *replaced*. Every reason a card can carry except `FIRST_ISSUE`, which belongs to
 * the registration and to nothing else: `LOST` for a mislaid card (US-09), `STALE_COUNTS` for one a
 * birthday has overtaken (US-13), `CUSTOMER_NUMBER_CHANGED` for the card a move to another customer
 * number prints (US-30) and `OTHER` for a damaged card.
 *
 * It is stated as an exclusion rather than a list so a new reason is a replacement reason by
 * default. Only the loss count draws a line through the set — it counts `LOST` alone, so a card a
 * household never asked for is not held against them.
 */
export type ReissueReason = Exclude<CardIssueReason, "FIRST_ISSUE">;

export type ReissueCardDeps = IssueCardDeps;

export interface ReissueCardInput {
  readonly customerId: number;
  readonly reason: ReissueReason;
}

/**
 * Issue a replacement card and hand it back as it was stored. The customer's status, number, group,
 * reminder count and distribution history are untouched — a lost card is an inconvenience, not a
 * sanction, and nothing but the card run changes.
 *
 * @throws {CustomerNotFound} if no customer has that id.
 * @throws {CustomerArchived} if the customer has left the register — the only status that refuses a
 *   card. A blocked household is turned away at the counter but still holds their slot (US-08).
 */
export function reissueCard(
  deps: ReissueCardDeps,
  { customerId, reason }: ReissueCardInput,
): Promise<IssuedCard> {
  return issueCard(deps, { customerId, reason });
}
