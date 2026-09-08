/**
 * The integer check the policy values share.
 *
 * Its own module rather than part of `settings.ts` because the egg rule validates its rows with it
 * too (US-28), and `settings.ts` holds that rule as a field — importing it back out would put the
 * two modules in a cycle.
 */

import { InvalidSettings } from "../errors";

/**
 * Require `value` to be a whole number of at least `minimum`.
 *
 * @throws {InvalidSettings} naming `field`, so the form can point at the input that was typed.
 */
export function requireInteger(field: string, value: number, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new InvalidSettings(
      field,
      `must be an integer of at least ${minimum}, received ${value}`,
    );
  }
}
