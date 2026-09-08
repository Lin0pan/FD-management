/**
 * Read one customer's card as the card view shows it. Staff transcribe this onto the physical card,
 * so everything is worked out here and nothing is left for the screen
 * (`tasks/prd-us-02-issue-customer-card.md` §US-02.4).
 *
 * Which card is current comes off the run rather than a flag — the highest index *is* the valid card
 * (FR-4) — so a view can never show a number the household no longer holds.
 */

import type { IssuedCard } from "@/domain/card/card";
import { formatCardNumber, nextCardNumber } from "@/domain/card/cardNumber";
import type { CustomerStatus } from "@/domain/customer/customer";
import { groupOf, type Group } from "@/domain/customer/group";
import type { HouseholdComposition } from "@/domain/customer/householdComposition";
import { CustomerNotFound, InvalidCustomerRecord } from "@/domain/errors";
import { describeAllowance, type Allowance } from "../allowance/describe-allowance";
import type { CardRepository, Clock, CustomerRepository, SettingsRepository } from "../ports";

export interface ReadCardDeps {
  readonly customers: CustomerRepository;
  readonly cards: CardRepository;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
}

/** A card the current one replaced: its number and why it was handed out. */
export interface SupersededCard {
  /** The number as it was printed, e.g. `50k1`. */
  readonly number: string;
  readonly card: IssuedCard;
}

export interface CardView {
  readonly customerId: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly group: Group;
  /**
   * The card is not a permission — a blocked household still holds theirs — so this is here for one
   * reason: an archived household is offered no replacement, and the screen must not show a button
   * the use case would refuse.
   */
  readonly status: CustomerStatus;
  /**
   * The number printed on the card held today, e.g. `50k3` — off the card's own slot, like every
   * other number here. It agrees with the household's number (US-30.3), but is derived from the card
   * so it cannot state that agreement as a fact it has not checked.
   */
  readonly cardNumber: string;
  /**
   * The number a replacement would carry, e.g. `50k4`, named so a reissue can be confirmed against
   * what it will hand out before anything is written
   * (`tasks/prd-us-09-reissue-card-after-loss.md` §US-09.3). Nothing holds it.
   */
  readonly nextCardNumber: string;
  /** The card behind that number — when it was issued and why. */
  readonly card: IssuedCard;
  /** Derived from the birthdates as of today; there is no stored count to fall behind them. */
  readonly composition: HouseholdComposition;
  /**
   * The standard price today, through the same seam the counter reads (`describeAllowance`), so the
   * card and the counter cannot disagree. The counts above are a slice of it.
   */
  readonly allowance: Allowance;
  /** The numbers this card replaced, newest first. Empty for a household's first card. */
  readonly superseded: ReadonlyArray<SupersededCard>;
  /**
   * How many cards this household has been through (US-09.2) — a count of their own rows, deliberately
   * not the index they have reached: an index counts the slot's whole history, so a household
   * registered on a freed number can hold `66k4` as their first card (US-25).
   */
  readonly cardsIssued: number;
  /**
   * How many of those replaced a card the household lost — apart from the total, so a reissue the
   * software asked for (US-13) is not read as one more loss. Stated and no more: nothing turns a high
   * count into a warning (`tasks/prd-us-09-reissue-card-after-loss.md` §FR-4, §FR-5).
   */
  readonly reissuesForLoss: number;
}

/**
 * The card a customer currently holds, with the counts on it derived as of today.
 *
 * @throws {CustomerNotFound} if no customer has that id.
 * @throws {InvalidCustomerRecord} if the customer holds no card at all. Registration writes the
 *   first card in the same transaction as the customer, so an empty run can only come from a
 *   hand-edited database — and a card view inventing a number would be worse than refusing.
 */
export async function readCard(deps: ReadCardDeps, id: number): Promise<CardView> {
  const customer = await deps.customers.findById(id);
  if (customer === null) {
    throw new CustomerNotFound(id);
  }

  // The whole run in one read — head is the card in hand, tail is what it replaced. Asking twice
  // would let the two answers come from different moments.
  const [current, ...replaced] = await deps.cards.listCards(id);
  if (current === undefined) {
    throw new InvalidCustomerRecord("card", String(id));
  }

  // Counted by the store rather than off `replaced`: filtering here would state a second time which
  // reason counts as a loss, and the two would drift the day a reason is added (§US-09.2).
  const counts = await deps.cards.issueCounts(id);

  // The card's **own** slot, never the household's (ADR-016). A household that moved carries `23k6`
  // over a run of `5k4`…`5k1`, and those four cards are what make slot 5 safe to hand out again.
  // Relabelling them would put `5k1` back into the pool while that card is out in the world (US-25).
  const numberOf = (card: IssuedCard): string => formatCardNumber(card.customerNumber, card.index);

  const allowance = await describeAllowance(deps, customer.details.householdMembers);

  // The one number derived from the household rather than a card: a replacement is printed on the
  // slot they hold *today*.
  const next = nextCardNumber({ customerNumber: customer.customerNumber, index: current.index });

  return {
    customerId: customer.id,
    firstName: customer.details.firstName,
    lastName: customer.details.lastName,
    group: groupOf(customer.customerNumber),
    status: customer.status,
    cardNumber: numberOf(current),
    nextCardNumber: formatCardNumber(next.customerNumber, next.index),
    card: current,
    composition: { grownUps: allowance.grownUps, children: allowance.children },
    allowance,
    superseded: replaced.map((card) => ({ number: numberOf(card), card })),
    cardsIssued: counts.cardsIssued,
    reissuesForLoss: counts.reissuesForLoss,
  };
}
