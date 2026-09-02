/**
 * Whether the counts printed on the card a household holds still match the household — and, when
 * they do not, what changed.
 *
 * The comparison exists because a card is a physical object: everything on it was true when it was
 * printed and stops being true the moment a child turns 13. Nothing here decides what a household
 * *is* — that is always `composition(members, today)`; this only reads the difference between what
 * the card claims and what the record says today.
 *
 * The module is pure and takes no clock: both sides are already-derived facts, so the caller owns
 * the question of *when* "today" is.
 */

import type { HouseholdComposition } from "../customer/householdComposition";

/**
 * Why what a card prints no longer matches the household.
 *
 * `AGE_13` is the case this comparison exists for: nobody joined or left, a child simply came of
 * age, and the software moved the numbers without anyone asking it to. `HOUSEHOLD_CHANGE` covers
 * every other difference in the counts — a member added or removed — which staff already know
 * about, because they typed it. The distinction is shown to staff so the list reads as "the
 * software did this" rather than as an accusation that a record was filled in wrongly (PRD §6).
 *
 * There is deliberately no third reason for the group. The group is not a value of its own any
 * more: it follows from the customer number (`groupOf`), and a household's **current** card is
 * always the highest index on the slot they currently hold — a registration prints on the slot it
 * takes, a reissue on the slot the household holds, and a move prints inside the transaction that
 * moves them (US-30, US-31). So the card's number is their number and its group is their group,
 * and a card naming another week is not a case this function declines to report but one that
 * cannot arise.
 */
export type StaleCardReason = "AGE_13" | "HOUSEHOLD_CHANGE";

/** How many people the counts account for. Equal sizes mean nobody joined and nobody left. */
function householdSize(counts: HouseholdComposition): number {
  return counts.grownUps + counts.children;
}

/**
 * Why the card is stale, or `null` when it still prints the truth.
 *
 * A birthday is blamed only when it is the *whole* explanation for the counts: the household is the
 * same size and grown-ups have gone up, so the same people are on the card and one or more of them
 * crossed 13. Anything else — a different size, or grown-ups going down, which no birthday can do —
 * is a change somebody made to the record, and saying `AGE_13` there would tell staff a story that
 * did not happen.
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
