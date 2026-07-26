/**
 * Whether the counts printed on the card a household holds still match the household — and, when
 * they do not, what changed.
 *
 * The comparison exists because a card is a physical object: the two numbers on it were true when it
 * was printed and stop being true the moment a child turns 13 (US-13). Nothing here decides what a
 * household *is* — that is always `composition(members, today)`; this only reads the difference
 * between what the card claims and what the derivation says today.
 *
 * The module is pure and takes no clock: both sides are already-derived counts, so the caller owns
 * the question of *when* "today" is.
 */

import type { HouseholdComposition } from "../customer/householdComposition";

/**
 * Why a card's printed counts no longer match the household.
 *
 * `AGE_13` is the case this story exists for: nobody joined or left, a child simply came of age, and
 * the software moved the numbers without anyone asking it to. `HOUSEHOLD_CHANGE` covers every other
 * difference — a member added or removed — which staff already know about because they typed it.
 * The distinction is shown to staff so the list reads as "the software did this" rather than as an
 * accusation that a record was filled in wrongly (PRD §6).
 */
export type StaleCountsReason = "AGE_13" | "HOUSEHOLD_CHANGE";

/** How many people the counts account for. Equal sizes mean nobody joined and nobody left. */
function householdSize(counts: HouseholdComposition): number {
  return counts.grownUps + counts.children;
}

/**
 * Why the card is stale, or `null` when it still prints the truth.
 *
 * A birthday is blamed only when it is the *whole* explanation: the household is the same size and
 * grown-ups have gone up, so the same people are on the card and one or more of them crossed 13.
 * Anything else — a different size, or grown-ups going down, which no birthday can do — is a change
 * somebody made to the record, and saying `AGE_13` there would tell staff a story that did not
 * happen.
 */
export function staleCountsReason(
  printedOnCard: HouseholdComposition,
  today: HouseholdComposition,
): StaleCountsReason | null {
  if (printedOnCard.grownUps === today.grownUps && printedOnCard.children === today.children) {
    return null;
  }
  const sameHousehold = householdSize(printedOnCard) === householdSize(today);
  return sameHousehold && today.grownUps > printedOnCard.grownUps ? "AGE_13" : "HOUSEHOLD_CHANGE";
}
