/**
 * The card number staff read out at the counter.
 *
 * It is **derived**, never stored: a card number is a customer number and a card index, so `12k1`
 * is the first card printed under slot 12 and `12k2` the second. Storing the string would give the
 * same fact two homes — the mistake the Excel sheet made with the household counts — and a reissue
 * would then have to keep them in step.
 *
 * The index counts the **slot's** cards, across every household that has ever held it — not the
 * cards of the household holding it today. A customer number is a slot an archived household
 * releases (US-10, US-11, US-24), and the household walks away still carrying its card, so a run
 * that restarted at `k1` for each new holder would put two different pieces of card in the world
 * bearing one number, and the counter would answer for whichever of them it happened to resolve.
 * Counting on from the highest index ever issued on the slot means a card number names one physical
 * card for good: an old one presented at the counter is simply out of date (US-25).
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
 * {@link formatCardNumber} only ever writes the lowercase one: what DF prints has to be a single
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
  const query = counterQueryOrNull(text);
  if (query === null) {
    throw new InvalidCardNumber(text);
  }
  return query;
}

/**
 * The same reading as {@link parseCounterQuery}, answering `null` where that one throws.
 *
 * It exists for the one box that accepts *either* kind of input: the customer list searches by name
 * as well as by number (US-15.1), so "this is not a number" is an ordinary answer there rather than
 * a mistake — `Meier` is a perfectly good thing to have typed. The rules are not relaxed for it:
 * `050` is still not customer 50, it is simply a name that will match nobody.
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
 * `0` is a perfectly good argument and is the whole point of the function: it is what a slot nobody
 * has ever held answers, and it yields `1`, so a first card is still `k1` without anybody writing
 * that constant down. A slot whose last card was `k3` yields `4`, whether that `k3` is held by the
 * household registering today or by one that left the register years ago.
 *
 * Registration and reissue both ask this question, so the counting rule is stated once. Which
 * number the highest is remains the application layer's to find out — it is the only one that can
 * see the slot's whole run.
 *
 * @throws {InvalidCardNumber} for a negative or fractional highest index. Neither can come off a
 * card the register issued, so it means a caller has computed the run wrongly, and counting on from
 * a nonsense number would print a card nobody could read back.
 */
export function nextCardIndex(highestIssuedOnSlot: number): number {
  if (!Number.isInteger(highestIssuedOnSlot) || highestIssuedOnSlot < 0) {
    throw new InvalidCardNumber(String(highestIssuedOnSlot));
  }
  return highestIssuedOnSlot + 1;
}

/**
 * The index the card carries that is printed when a household **moves to another slot** (US-30),
 * given the highest index ever issued on the slot they are moving to and the highest they hold
 * themselves.
 *
 * A move asks the same counting question a registration does — what has this slot been through? —
 * and one more that only a move can raise: the household is carrying cards of their own, and the
 * card they hold is *the highest-indexed one they have been issued*. A household carrying `5k4`
 * that moved onto a fresh slot as `99k1` would be holding two cards whose indexes say the old one
 * is still the current one, and no read of their run could tell which piece of card is in their
 * pocket. So the new card outranks both runs, and the answer is the later of the two next indexes.
 *
 * In the ordinary case the slot decides it: a household carrying `5k4` moving onto a slot whose
 * last card was `23k5` is printed `23k6`, and the jump is the slot's history rather than theirs.
 * The household's own run only decides it where the slot has been round fewer times — a fresh slot
 * above all — and the indexes it skips on that slot are skipped for good, exactly as an archived
 * household's are. Nothing is ever printed twice, which is the guarantee that matters (US-25).
 *
 * Both arguments are validated by {@link nextCardIndex}, not just the larger: an index that could
 * never have come off a card means a run was computed wrongly, and taking the maximum first would
 * hide it whenever the other side happened to win.
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
 * The card number that replaces `card` — the same slot, the next index.
 *
 * Issuing it invalidates every earlier card on that slot, because validity is *being the highest
 * index* rather than a flag somebody has to remember to clear (US-02.2, FR-4). This function only
 * says what the next index is; deciding that a new card is due belongs to the application layer,
 * which is the only one that knows what the highest issued index actually is.
 */
export function nextCardNumber(card: CardNumber): CardNumber {
  return { customerNumber: card.customerNumber, index: nextCardIndex(card.index) };
}
