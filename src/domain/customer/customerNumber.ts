/**
 * Customer numbers — the slot a customer occupies in DF's register.
 *
 * A customer number is a **slot, not an identity**: DF may only serve `quotaN` households at a time
 * (US-14), and when one is archived their number returns to the pool for the next applicant. So the
 * number says "the 37th of the 240 places we have", while the row's surrogate id is what identity
 * means — see `docs/archiv/domain_analysis.md` and the schema rule in US-01.5.
 *
 * Allocation is the lowest free slot rather than the next-highest, because DF's paper cards are
 * numbered and reusing a freed number keeps the range dense: with a quota of 240, always counting
 * upwards would exhaust the numbering long before the places ran out. Picking the *lowest* also
 * makes registration reproducible — the same register plus the same quota always yields the same
 * number, which is what makes this rule testable and the use case above it deterministic.
 *
 * The module is pure: it decides nothing about persistence, and the database has the final say on
 * whether the number was still free when the write landed (US-01.4).
 */

import {
  CustomerNumberOutOfRange,
  CustomerNumberTaken,
  CustomerNumberUnchanged,
  NoFreeCustomerNumber,
} from "../errors";

/**
 * Every number in `1..quotaN` that nobody active holds, ascending.
 *
 * `takenNumbers` is the numbers held by **active** customers only; archived rows keep their number
 * as a historical record but do not occupy the slot, which is exactly how a gap appears in the
 * middle of the range. Duplicates and numbers outside `1..quotaN` are ignored rather than rejected —
 * the caller passes what the register happens to contain, and neither can make a slot inside the
 * range any more or less free.
 *
 * This is the pool, and it is defined once: the registration form offers it as a choice (US-24) and
 * {@link findLowestFreeNumber} takes its first element, so the number the screen opens on and the
 * number the rule allocates cannot come apart.
 */
export function freeNumbers(
  takenNumbers: ReadonlyArray<number>,
  quotaN: number,
): ReadonlyArray<number> {
  const taken = new Set(takenNumbers);
  const free: number[] = [];

  for (let candidate = 1; candidate <= quotaN; candidate += 1) {
    if (!taken.has(candidate)) {
      free.push(candidate);
    }
  }

  return free;
}

/**
 * The lowest number in `1..quotaN` that nobody active holds, or `null` when the register is full.
 *
 * This is the total form of the rule, for callers that only want to *show* the next number — a
 * registration screen has to render whether or not one is free. A caller that is about to allocate
 * wants {@link lowestFreeNumber}, which refuses instead of returning nothing.
 */
export function findLowestFreeNumber(
  takenNumbers: ReadonlyArray<number>,
  quotaN: number,
): number | null {
  const free = freeNumbers(takenNumbers, quotaN);

  return free.length === 0 ? null : free[0];
}

/**
 * The lowest free number, insisting there is one.
 *
 * @throws {NoFreeCustomerNumber} when every slot up to `quotaN` is taken. DF then has to archive a
 *   customer or raise the quota; guessing a number beyond it would silently break the promise the
 *   quota makes.
 */
export function lowestFreeNumber(takenNumbers: ReadonlyArray<number>, quotaN: number): number {
  const free = findLowestFreeNumber(takenNumbers, quotaN);
  if (free === null) {
    throw new NoFreeCustomerNumber(quotaN);
  }
  return free;
}

/**
 * The verdict on a number a staff member chose rather than one the rule allocated (US-24), given
 * back unchanged when it is free. The other half of {@link freeNumbers}: that says what may be
 * offered, this says whether one of them may still be written.
 *
 * Range is checked before occupancy, because a number outside `1..quotaN` is not a slot that could
 * be free or taken in the first place.
 *
 * @throws {CustomerNumberOutOfRange} when `requested` is not a whole number in `1..quotaN` — which
 *   a form that was open while staff lowered the quota (US-14) can produce without anybody
 *   tampering.
 * @throws {CustomerNumberTaken} when an active customer holds it. Deliberately the same error the
 *   repository raises from its partial unique index: it is the same fact, found earlier, and the
 *   index stays the final authority.
 */
export function assertFreeNumber(
  requested: number,
  takenNumbers: ReadonlyArray<number>,
  quotaN: number,
): number {
  if (!Number.isInteger(requested) || requested < 1 || requested > quotaN) {
    throw new CustomerNumberOutOfRange(requested, quotaN);
  }

  if (takenNumbers.includes(requested)) {
    throw new CustomerNumberTaken(requested);
  }

  return requested;
}

/**
 * Every number this household may be moved to (US-30), ascending: the whole free pool **plus the
 * number the household itself holds**.
 *
 * `currentNumber` has to be added back because `takenNumbers` **contains it** — the household is on
 * the register, so it occupies its own slot and {@link freeNumbers} rightly leaves it out. The merge
 * only looks like it is undoing a duplicate; remove it and the control would offer every number
 * except the one the household is sitting on, which is the one a form has to open on.
 *
 * Built on {@link freeNumbers} rather than beside it, so the pool a registration is offered (US-24)
 * and the pool this control offers can never come apart.
 *
 * A `currentNumber` **above `quotaN`** — which a lowered quota (US-14) produces without anybody
 * doing anything wrong — is still in the list and sorts last, because the numeric sort puts it
 * there. The household may keep that number and may move down into the quota, but is never forced
 * to move: nothing here removes a slot somebody is living on.
 */
export function choosableNumbers(
  currentNumber: number,
  takenNumbers: ReadonlyArray<number>,
  quotaN: number,
): ReadonlyArray<number> {
  const pool = new Set(freeNumbers(takenNumbers, quotaN));
  pool.add(currentNumber);

  return [...pool].sort((a, b) => a - b);
}

/**
 * The verdict on a number a staff member chose for a household already on the register (US-30),
 * given back unchanged when it may be written. The other half of {@link choosableNumbers}, exactly
 * as {@link assertFreeNumber} is the other half of {@link freeNumbers}.
 *
 * The order of the three refusals is the rule, not an implementation detail. **Unchanged is checked
 * first**, so a household parked above a lowered quota that saves the number it already holds is
 * told it already holds it, rather than that its own number is out of range — which would read as
 * an instruction to move, and there is none.
 *
 * Because unchanged comes first, the occupancy check needs **no "except my own number" special
 * case**: any `requested` still in play here is somebody else's, so delegating the remaining two
 * verdicts to {@link assertFreeNumber} is the whole of it.
 *
 * @throws {CustomerNumberUnchanged} when `requested` is the number the household already holds.
 * @throws {CustomerNumberOutOfRange} when `requested` is not a whole number in `1..quotaN`.
 * @throws {CustomerNumberTaken} when an active household holds it — the same error the partial
 *   unique index raises, for the reason {@link assertFreeNumber} reuses it: it is the same fact
 *   found earlier, and the index stays the final authority.
 */
export function assertChoosableNumber(
  requested: number,
  currentNumber: number,
  takenNumbers: ReadonlyArray<number>,
  quotaN: number,
): number {
  if (requested === currentNumber) {
    throw new CustomerNumberUnchanged(requested);
  }

  return assertFreeNumber(requested, takenNumbers, quotaN);
}
