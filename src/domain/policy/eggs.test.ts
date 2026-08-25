import { describe, expect, it } from "vitest";
import { DuplicateEggThreshold, EggsNotIncreasing, InvalidSettings } from "../errors";
import { createEggRule, diffEggRule, eggsFor, type EggRuleRow } from "./eggs";

/** What DF hand out today: 3 persons → 6 eggs, 5 → 12, 8 → 18, and nothing below three. */
const DF_ROWS: ReadonlyArray<EggRuleRow> = [
  { minPersons: 3, eggs: 6 },
  { minPersons: 5, eggs: 12 },
  { minPersons: 8, eggs: 18 },
];

describe("createEggRule", () => {
  it("refuses two rows naming the same threshold", () => {
    const failing = () =>
      createEggRule([
        { minPersons: 3, eggs: 6 },
        { minPersons: 3, eggs: 12 },
      ]);

    expect(failing).toThrow(DuplicateEggThreshold);
    try {
      failing();
    } catch (error) {
      expect(error).toBeInstanceOf(DuplicateEggThreshold);
      if (error instanceof DuplicateEggThreshold) {
        expect(error.minPersons).toBe(3);
        expect(error.message).toContain("3");
      }
    }
  });

  it("refuses a higher threshold awarding the same eggs", () => {
    expect(() =>
      createEggRule([
        { minPersons: 3, eggs: 6 },
        { minPersons: 5, eggs: 6 },
      ]),
    ).toThrow(EggsNotIncreasing);
  });

  it("refuses a higher threshold awarding fewer eggs", () => {
    const failing = () =>
      createEggRule([
        { minPersons: 3, eggs: 12 },
        { minPersons: 5, eggs: 6 },
      ]);

    expect(failing).toThrow(EggsNotIncreasing);
    try {
      failing();
    } catch (error) {
      expect(error).toBeInstanceOf(EggsNotIncreasing);
      if (error instanceof EggsNotIncreasing) {
        expect(error.minPersons).toBe(5);
        expect(error.eggs).toBe(6);
        expect(error.lowerMinPersons).toBe(3);
        expect(error.lowerEggs).toBe(12);
      }
    }
  });

  it("refuses a threshold below one person", () => {
    expect(() => createEggRule([{ minPersons: 0, eggs: 6 }])).toThrow(
      new InvalidSettings("eggRule.0.minPersons", "must be an integer of at least 1, received 0"),
    );
  });

  it("refuses a fractional threshold", () => {
    expect(() => createEggRule([{ minPersons: 2.5, eggs: 6 }])).toThrow(InvalidSettings);
  });

  it("refuses a negative egg count", () => {
    expect(() => createEggRule([{ minPersons: 3, eggs: -1 }])).toThrow(
      new InvalidSettings("eggRule.0.eggs", "must be an integer of at least 0, received -1"),
    );
  });

  it("refuses a fractional egg count", () => {
    expect(() => createEggRule([{ minPersons: 3, eggs: 6.5 }])).toThrow(InvalidSettings);
  });

  it("names the typed row, not the sorted row, when a value is malformed", () => {
    // The bad row is typed second and would sort first: the index has to be the one on screen.
    const failing = () =>
      createEggRule([
        { minPersons: 8, eggs: 18 },
        { minPersons: 0, eggs: 6 },
      ]);

    expect(failing).toThrow(InvalidSettings);
    try {
      failing();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidSettings);
      if (error instanceof InvalidSettings) {
        expect(error.field).toBe("eggRule.1.minPersons");
      }
    }
  });

  it("accepts DF's own rule", () => {
    expect(createEggRule(DF_ROWS)).toEqual([
      { minPersons: 3, eggs: 6 },
      { minPersons: 5, eggs: 12 },
      { minPersons: 8, eggs: 18 },
    ]);
  });

  it("accepts an empty rule", () => {
    expect(createEggRule([])).toEqual([]);
  });

  it("accepts a single row", () => {
    expect(createEggRule([{ minPersons: 4, eggs: 6 }])).toEqual([{ minPersons: 4, eggs: 6 }]);
  });

  it("sorts rows typed out of order", () => {
    const rule = createEggRule([
      { minPersons: 8, eggs: 18 },
      { minPersons: 3, eggs: 6 },
      { minPersons: 5, eggs: 12 },
    ]);

    expect(rule.map((row) => row.minPersons)).toEqual([3, 5, 8]);
  });

  it("accepts an egg count that is not a multiple of six", () => {
    expect(createEggRule([{ minPersons: 3, eggs: 7 }])).toEqual([{ minPersons: 3, eggs: 7 }]);
  });

  it("accepts a threshold of one person", () => {
    expect(createEggRule([{ minPersons: 1, eggs: 0 }])).toEqual([{ minPersons: 1, eggs: 0 }]);
  });
});

describe("eggsFor", () => {
  const rule = createEggRule(DF_ROWS);

  it("awards nothing to a household below every threshold", () => {
    expect(eggsFor(rule, 1)).toBe(0);
    expect(eggsFor(rule, 2)).toBe(0);
  });

  it("awards six from three persons", () => {
    expect(eggsFor(rule, 3)).toBe(6);
  });

  it("awards six at four persons", () => {
    expect(eggsFor(rule, 4)).toBe(6);
  });

  it("awards twelve from five persons", () => {
    expect(eggsFor(rule, 5)).toBe(12);
  });

  it("awards twelve at seven persons", () => {
    expect(eggsFor(rule, 7)).toBe(12);
  });

  it("awards eighteen from eight persons", () => {
    expect(eggsFor(rule, 8)).toBe(18);
  });

  it("awards eighteen to a very large household", () => {
    expect(eggsFor(rule, 20)).toBe(18);
  });

  it("awards nothing under an empty rule", () => {
    expect(eggsFor(createEggRule([]), 20)).toBe(0);
  });

  it("awards nothing to a household of nobody", () => {
    expect(eggsFor(rule, 0)).toBe(0);
  });
});

describe("diffEggRule", () => {
  const rule = createEggRule(DF_ROWS);

  it("reports nothing when the rule did not move", () => {
    expect(diffEggRule(rule, createEggRule(DF_ROWS))).toEqual([]);
  });

  it("reports nothing when the same rows were merely retyped in another order", () => {
    // The value is sorted, so the order staff typed the rows in is not part of it. A comparison
    // that walked the two arrays in step would call this a change to every row.
    const retyped = createEggRule([
      { minPersons: 8, eggs: 18 },
      { minPersons: 3, eggs: 6 },
      { minPersons: 5, eggs: 12 },
    ]);

    expect(diffEggRule(rule, retyped)).toEqual([]);
  });

  it("reports a row that was added", () => {
    const next = createEggRule([...DF_ROWS, { minPersons: 12, eggs: 24 }]);

    expect(diffEggRule(rule, next)).toEqual([{ kind: "added", minPersons: 12, eggs: 24 }]);
  });

  it("reports a row that was removed", () => {
    const next = createEggRule([
      { minPersons: 3, eggs: 6 },
      { minPersons: 8, eggs: 18 },
    ]);

    expect(diffEggRule(rule, next)).toEqual([{ kind: "removed", minPersons: 5, eggs: 12 }]);
  });

  it("reports a row whose egg count changed, from and to", () => {
    const next = createEggRule([
      { minPersons: 3, eggs: 6 },
      { minPersons: 5, eggs: 14 },
      { minPersons: 8, eggs: 18 },
    ]);

    expect(diffEggRule(rule, next)).toEqual([{ kind: "changed", minPersons: 5, from: 12, to: 14 }]);
  });

  it("reports several row changes at once, in threshold order", () => {
    // Rows are matched by threshold, never by position: removing the lowest row and adding a
    // higher one would look like three changed rows to a walk down two arrays in step.
    const next = createEggRule([
      { minPersons: 5, eggs: 14 },
      { minPersons: 8, eggs: 18 },
      { minPersons: 12, eggs: 24 },
    ]);

    expect(diffEggRule(rule, next)).toEqual([
      { kind: "removed", minPersons: 3, eggs: 6 },
      { kind: "changed", minPersons: 5, from: 12, to: 14 },
      { kind: "added", minPersons: 12, eggs: 24 },
    ]);
  });

  it("reports every row as removed when the rule was emptied", () => {
    expect(diffEggRule(rule, createEggRule([]))).toEqual([
      { kind: "removed", minPersons: 3, eggs: 6 },
      { kind: "removed", minPersons: 5, eggs: 12 },
      { kind: "removed", minPersons: 8, eggs: 18 },
    ]);
  });

  it("reports every row as added when the rule was filled from empty", () => {
    expect(diffEggRule(createEggRule([]), rule)).toEqual([
      { kind: "added", minPersons: 3, eggs: 6 },
      { kind: "added", minPersons: 5, eggs: 12 },
      { kind: "added", minPersons: 8, eggs: 18 },
    ]);
  });

  it("reports nothing when both rules are empty", () => {
    expect(diffEggRule(createEggRule([]), createEggRule([]))).toEqual([]);
  });
});
