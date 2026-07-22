/**
 * Money handling for FD-Management.
 *
 * Prices are money and are stored and computed as integer **cents**, never floats
 * (SQLite has no decimal type — see docs/tech_stack_architecture_sketch.md §3). This module is the
 * pure-domain seam for that rule; it is also the walking-skeleton's proof-of-life for the TDD
 * harness. Richer policy/price-table logic arrives in a later session.
 */

import { InvalidEuroAmount } from "./errors";

/** A monetary amount in whole euro cents. */
export type Cents = number;

/**
 * Format an integer amount of cents as a German amount without a currency symbol,
 * e.g. `150` → `"1,50"`. This is the form an editable input field wants: what it renders is
 * exactly what {@link parseEuros} reads back.
 *
 * Formatting is done by hand (not via `Intl`) so the output is deterministic across environments.
 *
 * @throws {RangeError} if `cents` is not an integer.
 */
export function formatEuroAmount(cents: Cents): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`cents must be an integer, received: ${cents}`);
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${euros},${fraction}`;
}

/**
 * Format an integer amount of cents as a German euro string, e.g. `150` → `"1,50 €"`.
 *
 * @throws {RangeError} if `cents` is not an integer.
 */
export function formatEuros(cents: Cents): string {
  return `${formatEuroAmount(cents)} €`;
}

/** Euros, then optionally a comma or full stop and one or two cent digits. Nothing else. */
const EURO_AMOUNT = /^(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Read a euro amount as a human types it — `2,50`, `2.5`, `7` — as whole cents.
 *
 * Prices reach the system as text from a form, and this is the one place that text becomes money.
 * Parsing is deliberately strict: a third decimal digit is rejected rather than rounded, because
 * silently dropping a tenth of a cent is exactly the floating-point sloppiness the integer-cents
 * rule exists to prevent.
 *
 * @throws {InvalidEuroAmount} if the text is not a non-negative amount with at most two decimals.
 */
export function parseEuros(text: string): Cents {
  const match = EURO_AMOUNT.exec(text.trim());
  if (match === null) {
    throw new InvalidEuroAmount(text);
  }
  const [, euros, fraction = ""] = match;
  return Number(euros) * 100 + Number(fraction.padEnd(2, "0"));
}
