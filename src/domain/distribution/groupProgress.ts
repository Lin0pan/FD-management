/**
 * How many households of a group have collected today, and how many were expected to (US-23).
 *
 * The counter answers one household at a time, so the screen cannot tally from what it is showing.
 * One rule turns the distribution records into the fraction, so the summary and the marks in the
 * list beneath it can never tell different stories.
 *
 * What `expected` counts is the one decision here: a blocked household may not collect (US-08) and
 * is left out of the denominator — unless it already collected, because a household blocked at three
 * o'clock did collect at two, and dropping it alone would let the fraction read `34 von 33`.
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
