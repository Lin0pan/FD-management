/**
 * How many households of a group have collected today, and how many were expected to (US-23).
 *
 * The counter answers one household at a time and remembers nothing between them, so "how far through
 * the group are we" is a question the screen cannot answer from what it is showing. The facts exist —
 * one distribution record per household per day (US-05) — and this is the one rule that turns them into
 * a tally, so the number in the summary and the marks in the list beneath it can never tell different
 * stories.
 *
 * The one decision worth stating is what `expected` counts:
 *
 * - **A blocked household is not expected.** It may not collect (US-08), so counting it in the
 *   denominator would put the tally permanently out of reach — `59 von 61` at the end of an afternoon
 *   in which nobody was missed.
 * - **Unless it already collected.** A household blocked at three o'clock did collect at two, and
 *   dropping it from the denominator alone would let `served` exceed `expected` — a tally reading
 *   `34 von 33`, which is the one thing a fraction may never say.
 *
 * The module is pure: no I/O, no clock, and nothing here knows what a customer is.
 */

/** A household of the group, described by the only two facts the tally reads. */
export interface ProgressEntry {
  /** Whether the household is blocked, and so may not collect today (US-08). */
  readonly blocked: boolean;
  /** Whether a distribution record exists for the household on today's Berlin day (US-05). */
  readonly servedToday: boolean;
}

/** A group's afternoon as one fraction: how many collected, out of how many could. */
export interface Progress {
  /** The households that have collected today. */
  readonly served: number;
  /** The households that were able to — never fewer than `served`. */
  readonly expected: number;
}

/**
 * The tally of `entries`, counted afresh — nothing about it is stored (§FR-8).
 *
 * An empty roster gives `{ served: 0, expected: 0 }`: a group holding no household is neither behind
 * nor finished, and the screen says so in words rather than showing `0 von 0`.
 */
export function groupProgress(entries: ReadonlyArray<ProgressEntry>): Progress {
  let served = 0;
  let expected = 0;

  for (const entry of entries) {
    if (entry.servedToday) {
      served += 1;
    }
    // Having collected is what keeps a blocked household in the denominator: the block came after.
    if (!entry.blocked || entry.servedToday) {
      expected += 1;
    }
  }

  return { served, expected };
}
