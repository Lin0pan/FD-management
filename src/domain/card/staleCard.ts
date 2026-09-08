/**
 * Whether the counts printed on the card a household holds still match the household, and what
 * changed if not. A card is a physical object: what it says was true when it was printed and stops
 * being true the moment a child turns 13.
 *
 * Nothing here decides what a household *is* — that is always `composition(members, today)`.
 */

import type { HouseholdComposition } from "../customer/householdComposition";

/**
 * Why what a card prints no longer matches the household.
 *
 * `AGE_13` is the case this exists for — the software moved the numbers without anyone asking it to
 * — while `HOUSEHOLD_CHANGE` is a member added or removed, which staff typed themselves. Told apart
 * so the list reads as "the software did this" rather than as an accusation (PRD §6).
 *
 * There is deliberately no third reason for a group: a household's current card is always the
 * highest index on the slot they hold, so its group is theirs (US-30, US-31) and a card naming
 * another week cannot arise.
 */
export type StaleCardReason = "AGE_13" | "HOUSEHOLD_CHANGE";

/** How many people the counts account for. Equal sizes mean nobody joined and nobody left. */
function householdSize(counts: HouseholdComposition): number {
  return counts.grownUps + counts.children;
}

/**
 * Why the card is stale, or `null` when it still prints the truth.
 *
 * A birthday is blamed only when it is the *whole* explanation: same household size, grown-ups up.
 * Anything else is a change somebody made, and saying `AGE_13` there would tell a story that did
 * not happen.
 */
export function staleCardReason(
  printedOnCard: HouseholdComposition,
  today: HouseholdComposition,
): StaleCardReason | null {
  if (printedOnCard.grownUps === today.grownUps && printedOnCard.children === today.children) {
    return null;
  }
  const sameHousehold = householdSize(printedOnCard) === householdSize(today);
  return sameHousehold && today.grownUps > printedOnCard.grownUps ? "AGE_13" : "HOUSEHOLD_CHANGE";
}
