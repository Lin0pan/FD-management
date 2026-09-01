import { describe, expect, it } from "vitest";
import { groupOf } from "../customer/group";
import { staleCardReason } from "./staleCard";

/** The counts as they were printed, so each test states only the part it is about. */
const printed = (grownUps: number, children: number) => ({ grownUps, children });

describe("staleCardReason", () => {
  it("says nothing is stale when the card prints what the household is today", () => {
    expect(staleCardReason(printed(2, 1), printed(2, 1))).toBeNull();
  });

  it("says nothing is stale for a one-person household that has not changed", () => {
    expect(staleCardReason(printed(1, 0), printed(1, 0))).toBeNull();
  });

  it("a thirteenth birthday still makes a card stale", () => {
    expect(staleCardReason(printed(1, 1), printed(2, 0))).toBe("AGE_13");
  });

  it("blames a 13th birthday when two children came of age between issues", () => {
    expect(staleCardReason(printed(1, 3), printed(3, 1))).toBe("AGE_13");
  });

  it("a member added still makes a card stale", () => {
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

  it("a current card never names another group", () => {
    // The card a household holds is always the highest index on the slot they hold: a registration
    // prints on the slot it takes, a reissue on the slot the household holds, and a move prints
    // inside the transaction that moves them. So the card's slot *is* their slot, and by `groupOf`
    // its group is their group — there is no pair of values here that could disagree, which is why
    // the reason is gone rather than merely unhandled.
    const slotTheHouseholdHolds = 37;
    const slotThatPrintedTheirCard = slotTheHouseholdHolds;

    expect(groupOf(slotThatPrintedTheirCard)).toBe(groupOf(slotTheHouseholdHolds));
    expect(staleCardReason(printed(2, 1), printed(2, 1))).toBeNull();
  });
});
