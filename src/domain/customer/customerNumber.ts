/**
 * Customer numbers — the slot a customer occupies in DF's register. A slot, not an identity: it says
 * "the 37th of the 240 places we have", and returns to the pool when a household is archived
 * (ADR-008).
 *
 * Allocation takes the **lowest** free slot, not the next-highest: reusing freed numbers keeps the
 * range dense, and picking the lowest makes registration reproducible — the same register and quota
 * always yield the same number.
 *
 * The database has the final say on whether a number was still free when the write landed (US-01.4).
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
 * `takenNumbers` holds **active** customers' numbers only — archived rows keep theirs as history
 * without occupying the slot, which is how a gap appears mid-range. Duplicates and out-of-range
 * numbers are ignored rather than rejected; neither changes whether a slot inside the range is free.
 *
 * The pool, defined once: the registration form offers it (US-24) and {@link findLowestFreeNumber}
 * takes its first element, so the number the screen opens on and the one allocated cannot differ.
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
 * The lowest number in `1..quotaN` that nobody active holds, or `null` when the register is full —
 * the total form, for callers that only *show* the next number. A caller about to allocate wants
 * {@link lowestFreeNumber}, which refuses instead.
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
 * @throws {NoFreeCustomerNumber} when every slot up to `quotaN` is taken — guessing a number beyond
 *   it would silently break the promise the quota makes.
 */
export function lowestFreeNumber(takenNumbers: ReadonlyArray<number>, quotaN: number): number {
  const free = findLowestFreeNumber(takenNumbers, quotaN);
  if (free === null) {
    throw new NoFreeCustomerNumber(quotaN);
  }
  return free;
}

/**
 * The verdict on a number a staff member chose (US-24), given back unchanged when it is free — the
 * other half of {@link freeNumbers}. Range is checked before occupancy, since a number outside
 * `1..quotaN` is not a slot that could be free or taken.
 *
 * @throws {CustomerNumberOutOfRange} when `requested` is not a whole number in `1..quotaN` — a form
 *   left open while staff lowered the quota (US-14) produces one without anybody tampering.
 * @throws {CustomerNumberTaken} when an active customer holds it. Deliberately the same error the
 *   repository's partial unique index raises: the same fact found earlier, and the index stays the
 *   final authority.
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
 * Every number this household may be moved to (US-30), ascending: the free pool **plus the number
 * the household itself holds**.
 *
 * Adding `currentNumber` back only looks like undoing a duplicate — `takenNumbers` contains it, so
 * {@link freeNumbers} rightly leaves it out, and without the merge the control would offer every
 * number except the one the form has to open on.
 *
 * A `currentNumber` above `quotaN`, which a lowered quota (US-14) produces, stays in the list and
 * sorts last: the household may move down into the quota but is never forced to.
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
 * The verdict on a number chosen for a household already on the register (US-30) — the other half of
 * {@link choosableNumbers}.
 *
 * **The order of the refusals is the rule.** Unchanged is checked first, so a household parked above
 * a lowered quota that re-saves its own number is told it already holds it, rather than that the
 * number is out of range — which would read as an instruction to move, and there is none. That order
 * is also why occupancy needs no "except my own number" case: anything still in play is somebody
 * else's.
 *
 * @throws {CustomerNumberUnchanged} when `requested` is the number the household already holds.
 * @throws {CustomerNumberOutOfRange} when `requested` is not a whole number in `1..quotaN`.
 * @throws {CustomerNumberTaken} when an active household holds it.
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
