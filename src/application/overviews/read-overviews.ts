/**
 * The figure on every tile of the Übersichten tab (`tasks/prd-us-38-overviews-and-to-dos.md`
 * §US-38.1). An overview is looked up rather than acted on, so 0 is an answer and is returned.
 */

import {
  countCardsDueForReissue,
  type CardsDueForReissueDeps,
} from "../customers/cards-due-for-reissue";
import { countCardsToPrint, type CardsToPrintDeps } from "../customers/cards-to-print";
import {
  countDistributionSessions,
  type ListDistributionSessionsDeps,
} from "../distribution/list-distribution-sessions";

export type ReadOverviewsDeps = CardsDueForReissueDeps &
  CardsToPrintDeps &
  ListDistributionSessionsDeps;

export interface Overviews {
  readonly cardsDue: number;
  readonly cardsToPrint: number;
  readonly pastSessions: number;
}

/**
 * Each figure is the count its own list is measured with, never a second derivation.
 *
 * @throws {EmptyHousehold} if a stored household has no members — a record that cannot be counted.
 * @throws {BirthDateInFuture} if a stored birthdate lies after today.
 */
export async function readOverviews(deps: ReadOverviewsDeps): Promise<Overviews> {
  const [cardsDue, cardsToPrint, pastSessions] = await Promise.all([
    countCardsDueForReissue(deps),
    countCardsToPrint(deps),
    countDistributionSessions(deps),
  ]);
  return { cardsDue, cardsToPrint, pastSessions };
}
