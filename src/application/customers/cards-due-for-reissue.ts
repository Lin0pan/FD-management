/**
 * Which households hold a card whose printed counts no longer match them (US-13.2).
 *
 * Nothing here reclassifies anybody. A child becomes a grown-up on their 13th birthday because the
 * counts are derived from the birthdates every time they are read — there is no job, no trigger and
 * no event, and this query writes nothing (PRD §5). What it adds is the *consequence*: the piece of
 * card in the household's pocket still shows the old numbers, so somebody should print a new one.
 *
 * The tone matters as much as the result. This is a to-do list, not an alert queue: a stale card is
 * never grounds to turn anyone away (FR-5), and nothing downstream of this list may act on its own.
 */

import { formatCardNumber } from "@/domain/card/cardNumber";
import { staleCountsReason, type StaleCountsReason } from "@/domain/card/staleCounts";
import { composition, type HouseholdComposition } from "@/domain/customer/householdComposition";
import type { Clock, CustomerRepository } from "../ports";

export interface CardsDueForReissueDeps {
  readonly customers: CustomerRepository;
  readonly clock: Clock;
}

/** One household whose card has fallen behind, with both count sets so staff see what changed. */
export interface CardDueForReissue {
  /** The surrogate id, which is what a reissue is written against — never the customer number. */
  readonly customerId: number;
  readonly customerNumber: number;
  readonly firstName: string;
  readonly lastName: string;
  /** The number of the card they hold today, e.g. `50k3` — the one to be replaced. */
  readonly cardNumber: string;
  /** What is printed on that piece of card. Read for comparison only, never as the household. */
  readonly countsOnCard: HouseholdComposition;
  /** What the household is today, derived from the birthdates like everywhere else. */
  readonly countsToday: HouseholdComposition;
  readonly reason: StaleCountsReason;
}

/**
 * The households due a new card, lowest customer number first.
 *
 * **Only active households.** A blocked one is not collecting (US-08), so putting them on a to-do
 * list would ask staff to print a card nobody is coming for; they will need one when the block is
 * lifted, and their record will say so then. An archived one holds no slot at all and may not even
 * be issued a card (US-10). Neither exclusion loses anything: the list is derived on every read, so
 * a household returning to `ACTIVE` reappears on it by itself.
 *
 * The whole active register is read and compared here rather than filtered in SQL, because the
 * comparison is not expressible as a query: one side of it is `composition(members, today)`, a rule
 * over birthdates that lives in the domain and changes answer as the clock moves without any row
 * changing. At FD's ~240 customers that is one query and a few hundred date comparisons — the
 * deliberate choice US-13.3 asks to be documented rather than a limitation to work around.
 *
 * @throws {EmptyHousehold} if a stored household has no members — a record that cannot be counted.
 * @throws {BirthDateInFuture} if a stored birthdate lies after today.
 */
export async function listCardsDueForReissue(
  deps: CardsDueForReissueDeps,
): Promise<ReadonlyArray<CardDueForReissue>> {
  const today = deps.clock.now();
  const active = await deps.customers.listWithStatus("ACTIVE");

  const due: CardDueForReissue[] = [];
  for (const customer of active) {
    const countsOnCard = customer.card.countsAtIssue;
    const countsToday = composition(customer.details.householdMembers, today);
    const reason = staleCountsReason(countsOnCard, countsToday);
    if (reason === null) {
      continue;
    }
    due.push({
      customerId: customer.id,
      customerNumber: customer.customerNumber,
      firstName: customer.details.firstName,
      lastName: customer.details.lastName,
      cardNumber: formatCardNumber(customer.customerNumber, customer.card.index),
      countsOnCard,
      countsToday,
      reason,
    });
  }
  // The repository's order is handed on untouched: it sorted by customer number in the query, and
  // sorting again here would be a second, quietly diverging statement of how the screen reads.
  return due;
}
