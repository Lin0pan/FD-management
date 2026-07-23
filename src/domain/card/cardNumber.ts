/**
 * The card number staff read out at the counter.
 *
 * It is **derived**, never stored: a card number is the customer's slot and the index of the card
 * they hold, so `12k1` is the first card of customer 12 and `12k2` the one issued after they lost it
 * (US-09). Storing the string would give the same fact two homes — the mistake the Excel sheet made
 * with the household counts — and a reissue would then have to keep them in step.
 *
 * The module is pure: it formats and reads a value and knows nothing about how a card is persisted.
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
 * `<customer number>k<index>`, neither part padded.
 *
 * Matched case-insensitively so an uppercase `K` is read as the same card, but
 * {@link formatCardNumber} only ever writes the lowercase one: what FD prints has to be a single
 * form, and which case a staff member happened to hold shift for is not a property of the card.
 */
const CARD_NUMBER_PATTERN = new RegExp(`^([1-9][0-9]*)${CARD_INDEX_MARKER}([1-9][0-9]*)$`, "i");

/**
 * The card number for a customer's `index`-th card, e.g. `12k1`.
 *
 * Neither argument is validated: both come off a persisted card, which the register already
 * guarantees is a positive whole number, and a second check here would only be an unreachable
 * branch.
 */
export function formatCardNumber(customerNumber: number, index: number): string {
  return `${customerNumber}${CARD_INDEX_MARKER}${index}`;
}

/**
 * Read a card number a staff member typed back into its two parts.
 *
 * Input is forgiving where forgiveness cannot change which card is meant, and strict where it can.
 * An uppercase `K` and surrounding whitespace are accepted, because someone copying a number off a
 * card at the counter produces both and neither names a different card. A **leading zero is
 * rejected**: `050k3` is a slip of the hand, and reading it as customer 50 would teach staff that
 * the padding carries meaning — the register never pads, so the two forms would drift apart on
 * screen. Index 0 and customer number 0 are refused for the reason neither is ever written:
 * counting starts at 1.
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

/**
 * The same `<customer number>[k<index>]`, with the `k<index>` optional — so it reads both forms of
 * counter query in one pass. Matched case-insensitively for the reason {@link parseCardNumber} is,
 * and just as strict about leading zeros: `050` is a slip of the hand, not customer 50.
 */
const COUNTER_QUERY_PATTERN = new RegExp(
  `^([1-9][0-9]*)(?:${CARD_INDEX_MARKER}([1-9][0-9]*))?$`,
  "i",
);

/**
 * Read what a staff member typed at the counter into a customer number and, when a full card number
 * was given, the card index it presented.
 *
 * The rules are exactly {@link parseCardNumber}'s — positive whole numbers, no padding, an optional
 * uppercase `K` — with the index made optional, because the counter accepts a bare customer number
 * too (US-04.2, FR-1). A bare number resolves to the customer's current card, so its `cardIndex` is
 * `null` rather than a guessed `1`.
 *
 * @throws {InvalidCardNumber} for anything that is not `<customer number>` or `<customer number>k<index>`.
 */
export function parseCounterQuery(text: string): CounterQuery {
  const match = COUNTER_QUERY_PATTERN.exec(text.trim());
  if (match === null) {
    throw new InvalidCardNumber(text);
  }
  const [, customerNumber, index] = match;
  return {
    customerNumber: Number(customerNumber),
    cardIndex: index === undefined ? null : Number(index),
  };
}

/**
 * The card number that replaces `card` — the same customer, the next index.
 *
 * Issuing it invalidates every earlier card of that customer, because validity is *being the highest
 * index* rather than a flag somebody has to remember to clear (US-02.2, FR-4). This function only
 * says what the next index is; deciding that a new card is due belongs to the application layer,
 * which is the only one that knows what the highest issued index actually is.
 */
export function nextCardNumber(card: CardNumber): CardNumber {
  return { customerNumber: card.customerNumber, index: card.index + 1 };
}
