/**
 * Replace the card a customer holds — the counter's answer to "I lost it" (US-09.2).
 *
 * It hands straight to {@link issueCard} rather than reimplementing it, which is the whole point of
 * the module: a parallel implementation is how the "exactly one valid card" invariant breaks
 * (`tasks/prd-us-09-reissue-card-after-loss.md` §6, FR-2).
 *
 * What it adds is the narrower {@link ReissueReason}, the one thing delegation cannot say.
 *
 * There is deliberately **no limit check** (FR-4): whether a household loses cards too often is a
 * judgement staff make from the count the card view shows them.
 */

import type { CardIssueReason, IssuedCard } from "@/domain/card/card";
import { issueCard, type IssueCardDeps } from "./issue-card";

/**
 * Why a card was *replaced* through this use case.
 *
 * The two excluded reasons belong to the act that writes them: `FIRST_ISSUE` to the registration, and
 * `CUSTOMER_NUMBER_CHANGED` to `changeCustomerNumber` (US-30), which prints inside the transaction
 * that moves the slot — so a card reaching here with that reason would claim a move that never
 * happened.
 *
 * An exclusion rather than a list, because the question is which reasons are *not* this use case's.
 */
export type ReissueReason = Exclude<CardIssueReason, "FIRST_ISSUE" | "CUSTOMER_NUMBER_CHANGED">;

export type ReissueCardDeps = IssueCardDeps;

export interface ReissueCardInput {
  readonly customerId: number;
  readonly reason: ReissueReason;
}

/**
 * Issue a replacement card and hand it back as stored. Nothing but the card run changes — a lost card
 * is an inconvenience, not a sanction.
 *
 * @throws {CustomerNotFound} if no customer has that id.
 * @throws {CustomerArchived} if they have left the register — the only status that refuses a card;
 *   a blocked household still holds their slot (US-08).
 * @throws {CardNumberTaken} if the number was printed on the slot in the meantime.
 * @throws {CardIndexTaken} if the household was issued another card at that index. Both come straight
 *   through from {@link issueCard}.
 */
export function reissueCard(
  deps: ReissueCardDeps,
  { customerId, reason }: ReissueCardInput,
): Promise<IssuedCard> {
  return issueCard(deps, { customerId, reason });
}
