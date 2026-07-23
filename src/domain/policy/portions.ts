/**
 * The portion allowance a household receives at a distribution: so many portions per grown-up plus
 * so many per child (US-07.1).
 *
 * Like the price (see `priceFor` in `settings.ts`) the allowance is derived per head from the
 * configured per-head values, never stored — the Excel sheet FD is replacing kept a typed-in number
 * that drifted with every birthday. The per-head values are settings, so this module bakes in no
 * defaults: the configuration is a parameter (CLAUDE.md, "Policy values are data, not constants").
 *
 * The allowance shown is always the standard one; day-to-day supply or occasion adjustments happen
 * physically at the counter and are out of scope (tasks/prd-us-07-portions-and-price.md §3).
 *
 * This module is pure: it does no I/O and never reads the clock.
 */

import type { HouseholdComposition } from "../customer/householdComposition";
import type { Settings } from "./settings";

/** The two configured per-head portion values this derivation reads. */
export type PortionValues = Pick<Settings, "portionsPerGrownUp" | "portionsPerChild">;

/**
 * How many portions a household of `grownUps` grown-ups and `children` children receives.
 *
 * The per-head values are validated as non-negative integers upstream (US-14.1, `createSettings`),
 * and the counts are whole people, so the sum is a whole number.
 */
export function portionsFor(
  { grownUps, children }: HouseholdComposition,
  { portionsPerGrownUp, portionsPerChild }: PortionValues,
): number {
  return grownUps * portionsPerGrownUp + children * portionsPerChild;
}
