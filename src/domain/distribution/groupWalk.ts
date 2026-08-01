/**
 * Which customer number comes before a given one, and which after, within a set of numbers (US-21).
 *
 * The counter is driven by a typed number (US-04), which is the right control when a household hands
 * over a card and the wrong one when nobody has: the group a number belongs to is the software's
 * decision (US-01), not something staff memorise. Walking a group therefore needs a rule for "the next
 * one", and it lives here so the screen, the use case and any later report share it rather than each
 * stating the order again.
 *
 * Two choices decide what the answers mean:
 *
 * - **The comparison is numeric, not positional.** `from` need not be a member of `numbers` — it may
 *   belong to the other group, or to nobody at all, because the staff member typed it. Such a number
 *   still has a place between two members of the walk, so a mistyped lookup does not strand the
 *   buttons.
 * - **`numbers` is not assumed to be sorted.** The register happens to order its answers by customer
 *   number, and a function that silently required that would state the list's order in a second
 *   place; the extremes are scanned for instead.
 *
 * `from === null` is "nothing looked up yet", not an error: every number is above it, so `next` is the
 * smallest member — the entry point for a freshly opened screen.
 *
 * The module is pure: no I/O, no clock, and nothing here knows what a customer is.
 */

/** Where a walk can go from where it stands. `null` on a side means that side has been walked out. */
export interface Neighbours {
  /** The largest number strictly below `from`, or `null` when none is. */
  readonly previous: number | null;
  /** The smallest number strictly above `from`, or `null` when none is. */
  readonly next: number | null;
}

/**
 * The numbers immediately around `from` in `numbers`.
 *
 * `from` itself is never an answer: a walk moves. An empty `numbers` gives `null` on both sides at
 * every `from` — a group holding no household can be walked in neither direction.
 */
export function neighbours(numbers: ReadonlyArray<number>, from: number | null): Neighbours {
  let previous: number | null = null;
  let next: number | null = null;

  for (const number of numbers) {
    // `from === null` stands before every number, so nothing is ever below it and the first member is
    // the whole answer.
    if (from !== null && number < from && (previous === null || number > previous)) {
      previous = number;
    }
    if ((from === null || number > from) && (next === null || number < next)) {
      next = number;
    }
  }

  return { previous, next };
}
