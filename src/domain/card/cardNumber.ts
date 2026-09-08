/**
 * The card number staff read out at the counter: a customer number and a card index, so `12k1` is
 * the first card printed under slot 12. Derived, never stored (ADR-007).
 *
 * **The index counts the slot's cards, across every household that has ever held it** — not the
 * cards of today's holder. A slot is released on archiving (ADR-008) and the household walks away
 * still carrying its card, so a run restarting at `k1` per holder would put two pieces of card in
 * the world bearing one number. Counting on from the highest index ever issued means a card number
 * names one physical card for good, and an old one is simply out of date (US-25).
 */

import { InvalidCardNumber } from "../errors";

/** The separator between the customer number and the card index, as printed on the card. */
const CARD_INDEX_MARKER = "k";

/**
 * The two numbers a card number is made of. Both are whole and start at 1: there is no customer 0,
 * and the first card a registration produces is `k1` rather than `k0` (US-02.1).
 */
export interface CardNumber {
  readonly customerNumber: number;
  readonly index: number;
}

/**
 * `<customer number>k<index>`, neither part padded. Matched case-insensitively, but
 * {@link formatCardNumber} only ever writes the lowercase form — what DF prints is one spelling.
 */
const CARD_NUMBER_PATTERN = new RegExp(`^([1-9][0-9]*)${CARD_INDEX_MARKER}([1-9][0-9]*)$`, "i");

/**
 * The card number for a customer's `index`-th card, e.g. `12k1`. Neither argument is validated —
 * both come off a persisted card, so a check here would be an unreachable branch.
 */
export function formatCardNumber(customerNumber: number, index: number): string {
  return `${customerNumber}${CARD_INDEX_MARKER}${index}`;
}

/**
 * Read a card number a staff member typed back into its two parts.
 *
 * Forgiving where forgiveness cannot change which card is meant — an uppercase `K`, surrounding
 * whitespace — and strict where it can: a **leading zero is rejected**, since the register never
 * pads and reading `050k3` as customer 50 would teach staff that padding carries meaning. Counting
 * starts at 1, so neither part may be 0.
 *
 * @throws {InvalidCardNumber} for anything that is not `<customer number>k<index>`.
 */
export function parseCardNumber(text: string): CardNumber {
  const match = CARD_NUMBER_PATTERN.exec(text.trim());
  if (match === null) {
    throw new InvalidCardNumber(text);
  }
  const [, customerNumber, index] = match;
  return { customerNumber: Number(customerNumber), index: Number(index) };
}

/**
 * A number a staff member types at the counter: either a full card number (`50k3`) or the bare
 * customer number (`50`) that names whichever card the customer holds today.
 */
export interface CounterQuery {
  readonly customerNumber: number;
  /**
   * The card index that was presented, or `null` for a bare customer number. Only a presented index
   * can be *outdated*; a bare number always means the current card (counterVerdict.ts, US-04.1).
   */
  readonly cardIndex: number | null;
}

/** The same pattern with `k<index>` optional, so both forms of counter query read in one pass. */
const COUNTER_QUERY_PATTERN = new RegExp(
  `^([1-9][0-9]*)(?:${CARD_INDEX_MARKER}([1-9][0-9]*))?$`,
  "i",
);

/**
 * Read what a staff member typed at the counter — {@link parseCardNumber}'s rules with the index
 * optional, because the counter accepts a bare customer number too (US-04.2, FR-1). A bare number
 * means the current card, so its `cardIndex` is `null` rather than a guessed `1`.
 *
 * @throws {InvalidCardNumber} for anything that is not `<customer number>` or `<customer number>k<index>`.
 */
export function parseCounterQuery(text: string): CounterQuery {
  const query = counterQueryOrNull(text);
  if (query === null) {
    throw new InvalidCardNumber(text);
  }
  return query;
}

/**
 * {@link parseCounterQuery}, answering `null` where that one throws — for the customer list's box,
 * which searches by name as well as by number (US-15.1), so "not a number" is an ordinary answer.
 * The rules are not relaxed: `050` is simply a name that will match nobody.
 */
export function counterQueryOrNull(text: string): CounterQuery | null {
  const match = COUNTER_QUERY_PATTERN.exec(text.trim());
  if (match === null) {
    return null;
  }
  const [, customerNumber, index] = match;
  return {
    customerNumber: Number(customerNumber),
    cardIndex: index === undefined ? null : Number(index),
  };
}

/**
 * The index the next card printed on a slot carries, given the highest index **ever issued on that
 * customer number** — archived holders included (US-25).
 *
 * `0` is the point of the function, not an edge case: a slot nobody has held answers it, and yields
 * `1`, so a first card is `k1` without that constant being written anywhere. Finding the highest
 * index stays the application layer's job — only it can see the slot's whole run.
 *
 * @throws {InvalidCardNumber} for a negative or fractional index. Neither can come off an issued
 * card, so it means a caller computed the run wrongly.
 */
export function nextCardIndex(highestIssuedOnSlot: number): number {
  if (!Number.isInteger(highestIssuedOnSlot) || highestIssuedOnSlot < 0) {
    throw new InvalidCardNumber(String(highestIssuedOnSlot));
  }
  return highestIssuedOnSlot + 1;
}

/**
 * The index printed when a household **moves to another slot** (US-30): the later of the two next
 * indexes, so the new card outranks the slot's run *and* the household's own.
 *
 * A move raises a question a registration cannot — the household is carrying cards, and the one they
 * hold is their highest-indexed. A household carrying `5k4` moved onto a fresh slot as `99k1` would
 * hold two cards whose indexes say the old one is current, and no read of their run could tell which
 * is in their pocket. Indexes skipped on the new slot are skipped for good; nothing is ever printed
 * twice (US-25).
 *
 * Both arguments go through {@link nextCardIndex}, not just the larger: taking the maximum first
 * would hide a wrongly computed run whenever the other side happened to win.
 *
 * @throws {InvalidCardNumber} for a negative or fractional index on either side.
 */
export function nextCardIndexOnMove(
  highestIssuedOnSlot: number,
  highestHeldByHousehold: number,
): number {
  return Math.max(nextCardIndex(highestIssuedOnSlot), nextCardIndex(highestHeldByHousehold));
}

/**
 * The card number that replaces `card` — the same slot, the next index. Issuing it invalidates every
 * earlier card on that slot, because validity is *being the highest index* rather than a flag
 * somebody must remember to clear (US-02.2, FR-4).
 */
export function nextCardNumber(card: CardNumber): CardNumber {
  return { customerNumber: card.customerNumber, index: nextCardIndex(card.index) };
}
