/**
 * Customer numbers — the slot a customer occupies in FD's register.
 *
 * A customer number is a **slot, not an identity**: FD may only serve `quotaN` households at a time
 * (US-14), and when one is archived their number returns to the pool for the next applicant. So the
 * number says "the 37th of the 240 places we have", while the row's surrogate id is what identity
 * means — see `docs/domain_analysis.md` and the schema rule in US-01.5.
 *
 * Allocation is the lowest free slot rather than the next-highest, because FD's paper cards are
 * numbered and reusing a freed number keeps the range dense: with a quota of 240, always counting
 * upwards would exhaust the numbering long before the places ran out. Picking the *lowest* also
 * makes registration reproducible — the same register plus the same quota always yields the same
 * number, which is what makes this rule testable and the use case above it deterministic.
 *
 * The module is pure: it decides nothing about persistence, and the database has the final say on
 * whether the number was still free when the write landed (US-01.4).
 */

import { NoFreeCustomerNumber } from "../errors";

/**
 * The lowest number in `1..quotaN` that nobody active holds.
 *
 * `takenNumbers` is the numbers held by **active** customers only; archived rows keep their number
 * as a historical record but do not occupy the slot, which is exactly how a gap appears in the
 * middle of the range. Duplicates and numbers above `quotaN` are ignored rather than rejected — the
 * caller passes what the register happens to contain, and neither can make a slot inside the range
 * any more or less free.
 *
 * @throws {NoFreeCustomerNumber} when every slot up to `quotaN` is taken. FD then has to archive a
 *   customer or raise the quota; guessing a number beyond it would silently break the promise the
 *   quota makes.
 */
export function lowestFreeNumber(takenNumbers: ReadonlyArray<number>, quotaN: number): number {
  const taken = new Set(takenNumbers);

  for (let candidate = 1; candidate <= quotaN; candidate += 1) {
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new NoFreeCustomerNumber(quotaN);
}
