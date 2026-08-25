/**
 * The one integer check the policy values share.
 *
 * It lives in a module of its own rather than in `settings.ts`, where it started, because the egg
 * rule validates its rows with it too (US-28) and `settings.ts` holds the rule as one of its
 * fields — importing the helper back out of `settings.ts` would put the two modules in a cycle for
 * the sake of six lines.
 */

import { InvalidSettings } from "../errors";

/**
 * Require `value` to be a whole number of at least `minimum`.
 *
 * @throws {InvalidSettings} naming `field`, so the form can point at the input that was typed
 *   rather than reporting that the settings as a whole are wrong.
 */
export function requireInteger(field: string, value: number, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new InvalidSettings(
      field,
      `must be an integer of at least ${minimum}, received ${value}`,
    );
  }
}
