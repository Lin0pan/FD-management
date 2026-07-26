import { describe, expect, it } from "vitest";
import { staleCountsReason } from "./staleCounts";

describe("staleCountsReason", () => {
  it("says nothing is stale when the card prints what the household is today", () => {
    expect(
      staleCountsReason({ grownUps: 2, children: 1 }, { grownUps: 2, children: 1 }),
    ).toBeNull();
  });

  it("says nothing is stale for a one-person household that has not changed", () => {
    expect(
      staleCountsReason({ grownUps: 1, children: 0 }, { grownUps: 1, children: 0 }),
    ).toBeNull();
  });

  it("blames a 13th birthday when a child became a grown-up and nobody joined or left", () => {
    expect(staleCountsReason({ grownUps: 1, children: 1 }, { grownUps: 2, children: 0 })).toBe(
      "AGE_13",
    );
  });

  it("blames a 13th birthday when two children came of age between issues", () => {
    expect(staleCountsReason({ grownUps: 1, children: 3 }, { grownUps: 3, children: 1 })).toBe(
      "AGE_13",
    );
  });

  it("blames the household when a member joined", () => {
    expect(staleCountsReason({ grownUps: 2, children: 0 }, { grownUps: 2, children: 1 })).toBe(
      "HOUSEHOLD_CHANGE",
    );
  });

  it("blames the household when a member left", () => {
    expect(staleCountsReason({ grownUps: 2, children: 1 }, { grownUps: 2, children: 0 })).toBe(
      "HOUSEHOLD_CHANGE",
    );
  });

  it("blames the household when a birthday happened but somebody joined as well", () => {
    expect(staleCountsReason({ grownUps: 1, children: 1 }, { grownUps: 2, children: 1 })).toBe(
      "HOUSEHOLD_CHANGE",
    );
  });

  it("blames the household when the size held but a grown-up gave way to a child", () => {
    expect(staleCountsReason({ grownUps: 2, children: 0 }, { grownUps: 1, children: 1 })).toBe(
      "HOUSEHOLD_CHANGE",
    );
  });
});
