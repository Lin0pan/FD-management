/**
 * The card number staff read out at the counter.
 *
 * It is **derived**, never stored: a card number is the customer's slot and the index of the card
 * they hold, so `12k1` is the first card of customer 12 and `12k2` the one issued after they lost it
 * (US-09). Storing the string would give the same fact two homes — the mistake the Excel sheet made
 * with the household counts — and a reissue would then have to keep them in step.
 *
 * The module is pure: it formats a value and knows nothing about how a card is persisted.
 */

/** The separator between the customer number and the card index, as printed on the card. */
const CARD_INDEX_MARKER = "k";

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
