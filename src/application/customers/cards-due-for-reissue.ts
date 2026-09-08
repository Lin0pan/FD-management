/**
 * Which households hold a card that no longer prints the counts their record says (US-13.2).
 *
 * Nothing here reclassifies anybody — a child becomes a grown-up because the counts are derived from
 * the birthdates every time they are read, with no job and no trigger (PRD §5). What this adds is the
 * *consequence*: the card in their pocket still shows the old numbers.
 *
 * A to-do list, not an alert queue: a stale card is never grounds to turn anyone away (FR-5).
 */

import { formatCardNumber } from "@/domain/card/cardNumber";
import { staleCardReason, type StaleCardReason } from "@/domain/card/staleCard";
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
  /**
   * The number a reissue would hand out, e.g. `50k4` — derived here because it is a rule, and named
   * before anything is issued because the row disappears the moment the new card exists.
   */
  readonly nextCardNumber: string;
  /** What is printed on that piece of card. Read for comparison only, never as the household. */
  readonly countsOnCard: HouseholdComposition;
  /** What the household is today, derived from the birthdates like everywhere else. */
  readonly countsToday: HouseholdComposition;
  readonly reason: StaleCardReason;
}

/**
 * The households due a new card, lowest customer number first.
 *
 * **Only active households**: a blocked one is not collecting (US-08) and an archived one holds no
 * slot (US-10). Neither exclusion loses anything, since the list is derived on every read.
 *
 * The whole active register is read and compared here rather than filtered in SQL, because one side
 * of the comparison is `composition(members, today)` — a rule over birthdates that changes answer as
 * the clock moves without any row changing. At ~240 customers that is one query and a few hundred
 * date comparisons; the deliberate choice US-13.3 asks to be documented.
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
    // Only the counts. A household's current card is always the highest index on the slot they hold,
    // so its group is theirs by construction (ADR-017).
    const reason = staleCardReason(countsOnCard, countsToday);
    if (reason === null) {
      continue;
    }
    due.push({
      customerId: customer.id,
      customerNumber: customer.customerNumber,
      firstName: customer.details.firstName,
      lastName: customer.details.lastName,
      cardNumber: formatCardNumber(customer.card.customerNumber, customer.card.index),
      nextCardNumber: formatCardNumber(customer.customerNumber, customer.card.index + 1),
      countsOnCard,
      countsToday,
      reason,
    });
  }
  // The repository's order, untouched — sorting again would be a second statement of how it reads.
  return due;
}

/**
 * How many households are due a new card — the badge beside the home-screen link (US-13.4).
 *
 * Built from the list and measured, so no arrangement of birthdates can make the badge promise a row
 * the list does not show. There is no cheaper way: the difference is a rule over birthdates, not a
 * `COUNT(*)` (see {@link listCardsDueForReissue}).
 *
 * @throws {EmptyHousehold} if a stored household has no members — a record that cannot be counted.
 * @throws {BirthDateInFuture} if a stored birthdate lies after today.
 */
export async function countCardsDueForReissue(deps: CardsDueForReissueDeps): Promise<number> {
  return (await listCardsDueForReissue(deps)).length;
}
