/**
 * A card as it was issued: which number in the customer's run it is, when it was handed over and
 * why it was needed.
 *
 * There is deliberately no `valid` flag. A card is the current one *because* it carries the highest
 * index the customer has been issued (FR-4), so validity cannot drift away from the cards that
 * actually exist — the same reason the household counts are derived rather than typed.
 *
 * The module is pure: it says what a card is, not how one is stored or when a new one falls due.
 */

import type { Group } from "../customer/group";
import type { HouseholdComposition } from "../customer/householdComposition";
import { InvalidCustomerRecord } from "../errors";

/**
 * Why a card was issued. A closed set, because the audit log is read by people who did not make the
 * change and a free-text reason would tell them less than one of these five words.
 *
 * `FIRST_ISSUE` comes with the registration (US-02), `LOST` replaces a card the household mislaid
 * (US-09), `STALE_COUNTS` replaces one whose printed counts a birthday has overtaken (US-13),
 * `CUSTOMER_NUMBER_CHANGED` is the card a move to another customer number prints (US-30), and
 * `OTHER` covers a damaged card or anything the counter meets that these do not name.
 *
 * A number change has a word of its own rather than being filed as `OTHER` because the card view
 * and the audit log would then tell whoever reads them that a damaged card was replaced, which is
 * not what happened.
 */
export type CardIssueReason =
  "FIRST_ISSUE" | "LOST" | "STALE_COUNTS" | "CUSTOMER_NUMBER_CHANGED" | "OTHER";

/** Every reason a stored card can carry. */
const CARD_ISSUE_REASONS: ReadonlyArray<CardIssueReason> = [
  "FIRST_ISSUE",
  "LOST",
  "STALE_COUNTS",
  "CUSTOMER_NUMBER_CHANGED",
  "OTHER",
];

/**
 * Read a stored reason word back as a {@link CardIssueReason}. SQLite has no enum type, so the word
 * is checked rather than trusted — the same treatment `group` and `status` get on the way in.
 *
 * @throws {InvalidCustomerRecord} for anything that is not one of the five known words.
 */
export function parseCardIssueReason(value: string): CardIssueReason {
  const reason = CARD_ISSUE_REASONS.find((candidate) => candidate === value);
  if (reason === undefined) {
    throw new InvalidCustomerRecord("card reason", value);
  }
  return reason;
}

/** One issued card of one customer. The card *number* is derived from it — see `cardNumber.ts`. */
export interface IssuedCard {
  /**
   * The customer number this card was **printed under** — the slot the household held when it was
   * handed over.
   *
   * The fourth snapshot beside the three `AtIssue` fields below, and read under the same rule: a
   * fact about a physical object, never the household's customer number, which is always
   * `Customer.customerNumber`. The two part company the moment a household is moved to another
   * number (US-30): a card printed as `5k4` goes on saying `5k4` while its household holds 23, and
   * showing it as `23k4` would name a card that either never existed or belongs to somebody else.
   *
   * Never update it. A card printed under another number is a different card, and issuing one is
   * how the change is recorded — which is why a move issues a card in the same act.
   *
   * It also does a second job the other three do not: it is the key that
   * `@@unique([customerNumber, index])` rests on, so the run of a **vacated** slot survives the
   * household that left it and no card number is printed twice (US-25). The four cards left behind
   * on slot 5 are exactly what makes slot 5 safe to hand out again — the next household asks the
   * slot for its highest index, gets 4, and is printed `5k5`.
   */
  readonly customerNumber: number;
  /** 1 for the card handed over at registration; every reissue counts on from the highest. */
  readonly index: number;
  readonly issuedAt: Date;
  readonly reason: CardIssueReason;
  /**
   * The household counts as they were **printed on this piece of card** when it was handed over.
   *
   * This is the one place a count is kept rather than derived, and it is not an exception to
   * "derive, don't store" but the reason that rule needs a counterpart: the physical card is a real
   * object out in the world with two numbers written on it, and those numbers stop being true the
   * moment a child turns 13. Nothing reads this to answer *what the household is* — that is always
   * `composition(members, today)`. It is read only to answer *what the card in the customer's pocket
   * claims*, so the two can be compared and a reissue proposed (US-13.2).
   *
   * Never update it. A card whose printed counts changed is a different card, and issuing one is how
   * the change is recorded.
   */
  readonly countsAtIssue: HouseholdComposition;
  /**
   * The group as it was **printed on this piece of card** when it was handed over.
   *
   * The card tells the household which week to come in, so the group is on it in the same sense the
   * counts are: a fact about a printed object rather than about the household. It is stored for the
   * same single purpose and read under the same rule — never as the household's group, which is
   * always `customer.group`, and only to answer what the card in their pocket claims, so a move
   * between groups can put them on the cards-due list (US-16.4).
   *
   * Never update it, for the same reason: a card printed with the other group is a different card.
   */
  readonly groupAtIssue: Group;
}

/**
 * A card as a **writer** passes it: everything an {@link IssuedCard} is except the slot.
 *
 * The customer number is the store's to fill in, read off the customer row inside the write's own
 * transaction, because a caller that could pass it is a caller that could pass the wrong one — and
 * a card filed under a slot its household does not hold is invisible to every query in the system.
 * `CardRepository.issue` and `CustomerRepository.changeCustomerNumber` both take one of these and
 * hand back the {@link IssuedCard} that was stored.
 */
export type NewCard = Omit<IssuedCard, "customerNumber">;
