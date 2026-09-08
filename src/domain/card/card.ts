/**
 * A card as it was issued: its number in the run, when it was handed over and why.
 *
 * There is deliberately no `valid` flag. A card is current *because* it carries the highest index the
 * slot has issued (FR-4), so validity cannot drift away from the cards that actually exist.
 */

import type { HouseholdComposition } from "../customer/householdComposition";
import { InvalidCustomerRecord } from "../errors";

/**
 * Why a card was issued — a closed set, because the audit log is read by people who did not make the
 * change and free text would tell them less than one of these words.
 *
 * `FIRST_ISSUE` with the registration (US-02), `LOST` for a mislaid card (US-09), `STALE_COUNTS` for
 * counts a birthday overtook (US-13), `CUSTOMER_NUMBER_CHANGED` for a move (US-30), `OTHER` for a
 * damaged card. A move has a word of its own so the log does not report a damaged card instead.
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
 * Read a stored reason word back as a {@link CardIssueReason} — SQLite has no enum type, so the word
 * is checked rather than trusted.
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
   * The customer number this card was **printed under** — a fact about a physical object, never the
   * household's current number, which is always `Customer.customerNumber` (ADR-016). The two part
   * company the moment a household moves (US-30): a card printed `5k4` goes on saying `5k4`, and
   * relabelling it `23k4` would name a card that never existed. It also names the card's own week,
   * since a group follows from a number (`groupOf`, ADR-017).
   *
   * **Never update it**, and note the second job it does: it is the key
   * `@@unique([customerNumber, index])` rests on, so a vacated slot's run survives the household that
   * left it and no card number is ever printed twice (US-25). The cards left behind on slot 5 are
   * what make slot 5 safe to hand out again.
   */
  readonly customerNumber: number;
  /** 1 for the card handed over at registration; every reissue counts on from the highest. */
  readonly index: number;
  readonly issuedAt: Date;
  readonly reason: CardIssueReason;
  /**
   * The household counts **printed on this piece of card** — an argued exception to "derive, don't
   * store" (ADR-007), because the card is a real object with two numbers written on it that stop
   * being true the moment a child turns 13.
   *
   * Never read as what the household *is* — that is always `composition(members, today)` — only as
   * what the card in the customer's pocket claims, so a reissue can be proposed (US-13.2). Never
   * updated: issuing a new card is how the change is recorded.
   */
  readonly countsAtIssue: HouseholdComposition;
}

/**
 * A card as a **writer** passes it: an {@link IssuedCard} without the slot.
 *
 * The customer number is the store's to fill in, off the customer row inside the write's own
 * transaction — a caller that could pass it could pass the wrong one, and a card filed under a slot
 * its household does not hold is invisible to every query in the system.
 */
export type NewCard = Omit<IssuedCard, "customerNumber">;
