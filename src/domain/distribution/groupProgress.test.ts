import { describe, expect, it } from "vitest";
import { groupProgress, type ProgressEntry } from "./groupProgress";

/** A household of the group, described by the only two flags the tally reads. */
function entry(flags: Partial<ProgressEntry> = {}): ProgressEntry {
  return { blocked: false, servedToday: false, ...flags };
}

/** Every combination of the two flags — the whole state space a roster row can be in. */
const EVERY_COMBINATION: ReadonlyArray<ProgressEntry> = [
  entry(),
  entry({ servedToday: true }),
  entry({ blocked: true }),
  entry({ blocked: true, servedToday: true }),
];

describe("groupProgress", () => {
  it("never reports more served than expected, whatever the flags say", () => {
    for (const combination of subsets(EVERY_COMBINATION)) {
      const progress = groupProgress(combination);
      expect(progress.served).toBeLessThanOrEqual(progress.expected);
    }
  });

  it("counts nobody served when no household has collected", () => {
    expect(groupProgress([entry(), entry(), entry()])).toEqual({ served: 0, expected: 3 });
  });

  it("counts everybody served when every household has collected", () => {
    const collected = entry({ servedToday: true });
    expect(groupProgress([collected, collected, collected])).toEqual({ served: 3, expected: 3 });
  });

  it("does not expect a blocked household, because it may not collect", () => {
    expect(groupProgress([entry(), entry({ blocked: true })])).toEqual({ served: 0, expected: 1 });
  });

  it("counts a household blocked after collecting in both the served and the expected", () => {
    expect(groupProgress([entry({ blocked: true, servedToday: true })])).toEqual({
      served: 1,
      expected: 1,
    });
  });

  it("counts an empty group as nothing out of nothing", () => {
    expect(groupProgress([])).toEqual({ served: 0, expected: 0 });
  });
});

/** Every sub-roster of `entries`, so the invariant is asserted over all of them and not one sample. */
function subsets(
  entries: ReadonlyArray<ProgressEntry>,
): ReadonlyArray<ReadonlyArray<ProgressEntry>> {
  return entries.reduce<ReadonlyArray<ReadonlyArray<ProgressEntry>>>(
    (found, current) => [...found, ...found.map((subset) => [...subset, current])],
    [[]],
  );
}
