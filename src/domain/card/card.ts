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

import type { HouseholdComposition } from "../customer/householdComposition";
import { InvalidCustomerRecord } from "../errors";

/**
 * Why a card was issued. A closed set, because the audit log is read by people who did not make the
 * change and a free-text reason would tell them less than one of these four words.
 *
 * `FIRST_ISSUE` comes with the registration (US-02), `LOST` replaces a card the household mislaid
 * (US-09), `STALE_COUNTS` replaces one whose printed counts a birthday has overtaken (US-13), and
 * `OTHER` covers a damaged card or anything the counter meets that these do not name.
 */
export type CardIssueReason = "FIRST_ISSUE" | "LOST" | "STALE_COUNTS" | "OTHER";

/** Every reason a stored card can carry. */
const CARD_ISSUE_REASONS: ReadonlyArray<CardIssueReason> = [
  "FIRST_ISSUE",
  "LOST",
  "STALE_COUNTS",
  "OTHER",
];

/**
 * Read a stored reason word back as a {@link CardIssueReason}. SQLite has no enum type, so the word
 * is checked rather than trusted — the same treatment `group` and `status` get on the way in.
 *
 * @throws {InvalidCustomerRecord} for anything that is not one of the four known words.
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
}
