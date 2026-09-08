/**
 * Money as integer cents, never floats — SQLite has no decimal type
 * (`docs/architecture/08-crosscutting-concepts.md` §Money).
 */

import { InvalidEuroAmount } from "./errors";

/** A monetary amount in whole euro cents. */
export type Cents = number;

/**
 * `150` → `"1,50"` — the form an editable input wants, since {@link parseEuros} reads back exactly
 * what this renders. Formatted by hand rather than via `Intl`, so the output is deterministic across
 * environments.
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
 * `150` → `"1,50 €"`.
 *
 * @throws {RangeError} if `cents` is not an integer.
 */
export function formatEuros(cents: Cents): string {
  return `${formatEuroAmount(cents)} €`;
}

/** Euros, then optionally a comma or full stop and one or two cent digits. Nothing else. */
const EURO_AMOUNT = /^(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Read a euro amount as a human types it — `2,50`, `2.5`, `7` — as whole cents. The one place form
 * text becomes money.
 *
 * A third decimal digit is rejected rather than rounded: silently dropping a tenth of a cent is the
 * sloppiness the integer-cents rule exists to prevent.
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
