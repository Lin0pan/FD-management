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

/**
 * Why a card was issued. A closed set, because the audit log is read by people who did not make the
 * change and a free-text reason would tell them less than one of these four words.
 *
 * `FIRST_ISSUE` comes with the registration (US-02), `LOST` replaces a card the household mislaid
 * (US-09), `STALE_COUNTS` replaces one whose printed counts a birthday has overtaken (US-13), and
 * `OTHER` covers a damaged card or anything the counter meets that these do not name.
 */
export type CardIssueReason = "FIRST_ISSUE" | "LOST" | "STALE_COUNTS" | "OTHER";

/** One issued card of one customer. The card *number* is derived from it — see `cardNumber.ts`. */
export interface IssuedCard {
  /** 1 for the card handed over at registration; every reissue counts on from the highest. */
  readonly index: number;
  readonly issuedAt: Date;
  readonly reason: CardIssueReason;
}
