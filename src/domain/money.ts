/**
 * Money handling for FD-Management.
 *
 * Prices are money and are stored and computed as integer **cents**, never floats
 * (SQLite has no decimal type — see docs/tech_stack_architecture_sketch.md §3). This module is the
 * pure-domain seam for that rule; it is also the walking-skeleton's proof-of-life for the TDD
 * harness. Richer policy/price-table logic arrives in a later session.
 */

/** A monetary amount in whole euro cents. */
export type Cents = number;

/**
 * Format an integer amount of cents as a German euro string, e.g. `150` → `"1,50 €"`.
 * Formatting is done by hand (not via `Intl`) so the output is deterministic across environments.
 *
 * @throws {RangeError} if `cents` is not an integer.
 */
export function formatEuros(cents: Cents): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`cents must be an integer, received: ${cents}`);
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${euros},${fraction} €`;
}
