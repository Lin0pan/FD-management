/**
 * Whether what is printed on the card a household holds still matches the household — and, when it
 * does not, what changed.
 *
 * The comparison exists because a card is a physical object: everything on it was true when it was
 * printed and stops being true the moment a child turns 13 or staff move the household to the other
 * group. Nothing here decides what a household *is* — that is always `composition(members, today)`
 * and the `group` column; this only reads the difference between what the card claims and what the
 * record says today.
 *
 * The module is pure and takes no clock: both sides are already-derived facts, so the caller owns
 * the question of *when* "today" is.
 */

import type { Group } from "../customer/group";
import type { HouseholdComposition } from "../customer/householdComposition";

/**
 * Why what a card prints no longer matches the household.
 *
 * `AGE_13` is the case this comparison exists for: nobody joined or left, a child simply came of
 * age, and the software moved the numbers without anyone asking it to. `HOUSEHOLD_CHANGE` covers
 * every other difference in the counts — a member added or removed — and `GROUP_CHANGE` the week
 * the household collects in (US-16.4). The last two staff already know about, because they typed
 * them. The distinction is shown to staff so the list reads as "the software did this" rather than
 * as an accusation that a record was filled in wrongly (PRD §6).
 */
export type StaleCardReason = "AGE_13" | "HOUSEHOLD_CHANGE" | "GROUP_CHANGE";

/**
 * The parts of a card that can fall behind: the two counts and the group, which the card prints
 * because it is what tells the household which week to come in.
 *
 * The same shape describes both sides of the comparison — what the card was printed with, and what
 * the record says today — so neither side can quietly grow a field the other does not have.
 */
export interface CardFacts {
  readonly counts: HouseholdComposition;
  readonly group: Group;
}

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
 *
 * The counts answer first and the group only when they agree. A reissue replaces the whole card at
 * once, so the reason is not a work list — it is the sentence that explains the row, and when both
 * moved the counts are the difference worth naming: they decide the portions and the price, while
 * the group decides only which week the household is expected in.
 */
export function staleCardReason(
  printedOnCard: CardFacts,
  today: CardFacts,
): StaleCardReason | null {
  const onCard = printedOnCard.counts;
  const now = today.counts;
  if (onCard.grownUps === now.grownUps && onCard.children === now.children) {
    return printedOnCard.group === today.group ? null : "GROUP_CHANGE";
  }
  const sameHousehold = householdSize(onCard) === householdSize(now);
  return sameHousehold && now.grownUps > onCard.grownUps ? "AGE_13" : "HOUSEHOLD_CHANGE";
}
