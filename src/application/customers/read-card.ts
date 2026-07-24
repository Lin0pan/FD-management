/**
 * Read one customer's card as the card view shows it.
 *
 * The card is what staff transcribe onto the physical card at the counter, so everything on it is
 * worked out here and nothing is left for the screen to decide: the card number from the slot and
 * the index, the household counts from the birthdates as of today, and the numbers this card
 * replaced from the run of cards on file (tasks/prd-us-02-issue-customer-card.md §US-02.4).
 *
 * Which card is current is read off the run rather than a flag — the highest index *is* the valid
 * card (FR-4) — so a view can never show a number the household no longer holds.
 */

import type { IssuedCard } from "@/domain/card/card";
import { formatCardNumber } from "@/domain/card/cardNumber";
import type { Group } from "@/domain/customer/group";
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
  /** The number printed on the card the customer holds today, e.g. `50k3`. */
  readonly cardNumber: string;
  /** The card behind that number — when it was issued and why. */
  readonly card: IssuedCard;
  /** Derived from the birthdates as of today; there is no stored count to fall behind them. */
  readonly composition: HouseholdComposition;
  /**
   * The standard portions and price for this household as of today — derived through the same seam
   * the counter reads (`describeAllowance`), so the card and the counter can never disagree. The
   * counts above are a slice of it.
   */
  readonly allowance: Allowance;
  /** The numbers this card replaced, newest first. Empty for a household's first card. */
  readonly superseded: ReadonlyArray<SupersededCard>;
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

  // The whole run in one read: the head is the card in the household's hand and the tail is the
  // history it replaced. Asking twice — once for the current card, once for the rest — would let the
  // two answers come from different moments.
  const [current, ...replaced] = await deps.cards.listCards(id);
  if (current === undefined) {
    throw new InvalidCustomerRecord("card", String(id));
  }

  const numberOf = (card: IssuedCard): string =>
    formatCardNumber(customer.customerNumber, card.index);

  const allowance = await describeAllowance(deps, customer.details.householdMembers);

  return {
    customerId: customer.id,
    firstName: customer.details.firstName,
    lastName: customer.details.lastName,
    group: customer.group,
    cardNumber: numberOf(current),
    card: current,
    composition: { grownUps: allowance.grownUps, children: allowance.children },
    allowance,
    superseded: replaced.map((card) => ({ number: numberOf(card), card })),
  };
}
