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
import { formatCardNumber, nextCardNumber } from "@/domain/card/cardNumber";
import type { CustomerStatus } from "@/domain/customer/customer";
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
  /**
   * Where the household stands on the register. The card is not a permission — a blocked household
   * still holds theirs — so this is here for one reason: an archived household is offered no
   * replacement card, and the screen should not put a button in front of staff that the use case
   * would refuse.
   */
  readonly status: CustomerStatus;
  /**
   * The number printed on the card the customer holds today, e.g. `50k3` — read off the card's own
   * slot like every other number here. It agrees with the household's number, because a move issues
   * the new card in the same transaction as the move (US-30.3), and it is derived from the card so
   * that it cannot state that agreement as a fact it has not checked.
   */
  readonly cardNumber: string;
  /**
   * The number a replacement would carry, e.g. `50k4` — the same slot, the next index. The view
   * names it so a reissue can be confirmed against the number it will hand out before anything is
   * written (tasks/prd-us-09-reissue-card-after-loss.md §US-09.3). Nothing holds it: it is only what
   * the next issue would produce, worked out from the card on file.
   */
  readonly nextCardNumber: string;
  /** The card behind that number — when it was issued and why. */
  readonly card: IssuedCard;
  /** Derived from the birthdates as of today; there is no stored count to fall behind them. */
  readonly composition: HouseholdComposition;
  /**
   * The standard price for this household as of today — derived through the same seam
   * the counter reads (`describeAllowance`), so the card and the counter can never disagree. The
   * counts above are a slice of it.
   */
  readonly allowance: Allowance;
  /** The numbers this card replaced, newest first. Empty for a household's first card. */
  readonly superseded: ReadonlyArray<SupersededCard>;
  /**
   * How many cards this household has been through, the one in their hand included (US-09.2). It is
   * a count of the cards on their record and deliberately not the index they have reached: an index
   * counts the slot's whole history, so a household registered on a freed number can hold `66k4` as
   * their first card (US-25).
   */
  readonly cardsIssued: number;
  /**
   * How many of those replaced a card the household lost, reported apart from the total so a reissue
   * the software asked for — a birthday overtaking the printed counts (US-13) — is not read as one
   * more loss. The view states the number and stops there: nothing here or downstream turns a high
   * count into a warning or a refusal, because whether it means anything is the staff's judgement
   * (tasks/prd-us-09-reissue-card-after-loss.md §FR-4, §FR-5).
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

  // The whole run in one read: the head is the card in the household's hand and the tail is the
  // history it replaced. Asking twice — once for the current card, once for the rest — would let the
  // two answers come from different moments.
  const [current, ...replaced] = await deps.cards.listCards(id);
  if (current === undefined) {
    throw new InvalidCustomerRecord("card", String(id));
  }

  // Counted by the store rather than off `replaced`: filtering the run here would state a second
  // time which reason counts as a loss, and the two statements would drift the day US-13 adds one
  // (tasks/prd-us-09-reissue-card-after-loss.md §US-09.2).
  const counts = await deps.cards.issueCounts(id);

  // The card's **own** slot, never the household's. A household that has moved (US-30) carries
  // `23k6` over a run of `5k4`, `5k3`, `5k2`, `5k1`, and those four cards are exactly what makes
  // slot 5 safe to hand out again: the next household on it asks the slot for its highest index
  // and is printed `5k5`. Labelling them under the number the household holds today would put
  // `5k1` back into the pool while the piece of card bearing it is still out in the world (US-25).
  const numberOf = (card: IssuedCard): string => formatCardNumber(card.customerNumber, card.index);

  const allowance = await describeAllowance(deps, customer.details.householdMembers);

  // The one number derived from the household rather than from a card: a replacement is printed on
  // the slot they hold *today*, so a slot they have left has no say in it.
  const next = nextCardNumber({ customerNumber: customer.customerNumber, index: current.index });

  return {
    customerId: customer.id,
    firstName: customer.details.firstName,
    lastName: customer.details.lastName,
    group: customer.group,
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
