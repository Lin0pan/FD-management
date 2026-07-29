import { describe, expect, it } from "vitest";
import { staleCardReason } from "./staleCard";

/** The card as it was printed, so each test states only the part it is about. */
const printed = (grownUps: number, children: number, group: "RED" | "BLUE" = "RED") => ({
  counts: { grownUps, children },
  group,
});

describe("staleCardReason", () => {
  it("says nothing is stale when the card prints what the household is today", () => {
    expect(staleCardReason(printed(2, 1), printed(2, 1))).toBeNull();
  });

  it("says nothing is stale for a one-person household that has not changed", () => {
    expect(staleCardReason(printed(1, 0), printed(1, 0))).toBeNull();
  });

  it("blames a 13th birthday when a child became a grown-up and nobody joined or left", () => {
    expect(staleCardReason(printed(1, 1), printed(2, 0))).toBe("AGE_13");
  });

  it("blames a 13th birthday when two children came of age between issues", () => {
    expect(staleCardReason(printed(1, 3), printed(3, 1))).toBe("AGE_13");
  });

  it("blames the household when a member joined", () => {
    expect(staleCardReason(printed(2, 0), printed(2, 1))).toBe("HOUSEHOLD_CHANGE");
  });

  it("blames the household when a member left", () => {
    expect(staleCardReason(printed(2, 1), printed(2, 0))).toBe("HOUSEHOLD_CHANGE");
  });

  it("blames the household when a birthday happened but somebody joined as well", () => {
    expect(staleCardReason(printed(1, 1), printed(2, 1))).toBe("HOUSEHOLD_CHANGE");
  });

  it("blames the household when the size held but a grown-up gave way to a child", () => {
    expect(staleCardReason(printed(2, 0), printed(1, 1))).toBe("HOUSEHOLD_CHANGE");
  });

  it("blames the group when the household is unchanged but it moved to the other group", () => {
    expect(staleCardReason(printed(2, 1, "RED"), printed(2, 1, "BLUE"))).toBe("GROUP_CHANGE");
  });

  it("blames the group in the other direction too", () => {
    expect(staleCardReason(printed(1, 0, "BLUE"), printed(1, 0, "RED"))).toBe("GROUP_CHANGE");
  });

  it("names the counts, not the group, when both the household and the group moved", () => {
    expect(staleCardReason(printed(2, 0, "RED"), printed(2, 1, "BLUE"))).toBe("HOUSEHOLD_CHANGE");
  });

  it("names the birthday, not the group, when a child came of age and the group moved", () => {
    expect(staleCardReason(printed(1, 1, "RED"), printed(2, 0, "BLUE"))).toBe("AGE_13");
  });
});
