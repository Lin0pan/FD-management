import { describe, expect, it } from "vitest";

import { countByGroup, GROUPS, groupOf, inGroup, suggestGroup } from "./group";

describe("groupOf", () => {
  it("an even number is BLUE", () => {
    expect(groupOf(106)).toBe("BLUE");
  });

  it("an odd number is RED", () => {
    expect(groupOf(37)).toBe("RED");
  });

  it("one is RED and two is BLUE, so the register opens on RED", () => {
    expect(groupOf(1)).toBe("RED");
    expect(groupOf(2)).toBe("BLUE");
  });
});

describe("inGroup", () => {
  it("keeps the order of the numbers it filters", () => {
    expect(inGroup([9, 4, 7, 2, 5], "RED")).toEqual([9, 7, 5]);
    expect(inGroup([9, 4, 7, 2, 5], "BLUE")).toEqual([4, 2]);
  });

  it("answers with nothing when no number belongs to the group", () => {
    expect(inGroup([1, 3, 5], "BLUE")).toEqual([]);
  });
});

describe("countByGroup", () => {
  it("counts a register by parity", () => {
    expect(countByGroup([1, 2, 3, 4, 5, 8])).toEqual({ red: 3, blue: 3 });
  });

  it("counts an empty register as nothing", () => {
    expect(countByGroup([])).toEqual({ red: 0, blue: 0 });
  });
});

describe("suggestGroup", () => {
  it("recommends the smaller group", () => {
    expect(suggestGroup([1, 2], { red: 12, blue: 9 })).toBe("BLUE");
    expect(suggestGroup([1, 2], { red: 9, blue: 12 })).toBe("RED");
  });

  it("recommends the smaller group by one household, not by a margin", () => {
    expect(suggestGroup([1, 2], { red: 10, blue: 9 })).toBe("BLUE");
  });

  it("recommends RED on a tie, so the same register always yields the same advice", () => {
    expect(suggestGroup([1, 2], { red: 10, blue: 10 })).toBe("RED");
  });

  it("recommends RED for the very first household, when both groups are empty", () => {
    expect(suggestGroup([1, 2], { red: 0, blue: 0 })).toBe("RED");
  });

  it("recommends the larger group when the smaller one is full", () => {
    // BLUE is smaller and would win on balance alone, but nothing even is free.
    expect(suggestGroup([1, 3, 5], { red: 12, blue: 9 })).toBe("RED");
    // And the mirror image: RED is smaller, and every odd slot is taken.
    expect(suggestGroup([2, 4, 6], { red: 9, blue: 12 })).toBe("BLUE");
  });

  it("recommends the only group with a free number even when it is much larger", () => {
    expect(suggestGroup([4], { red: 1, blue: 118 })).toBe("BLUE");
  });

  it("recommends nothing when the register is full", () => {
    expect(suggestGroup([], { red: 120, blue: 120 })).toBeNull();
  });

  it("says nothing beyond the recommendation — no warning, no threshold, no second output", () => {
    // The whole answer is a group or nothing: a drift of 100 households reads exactly like a drift
    // of one, because DF read the balance off the figures already on screen (US-31.1).
    expect(suggestGroup([1, 2], { red: 111, blue: 11 })).toBe("BLUE");
    expect(suggestGroup([1, 2], { red: 12, blue: 11 })).toBe("BLUE");
  });
});

describe("GROUPS", () => {
  it("is the two options a form renders, RED first", () => {
    expect(GROUPS).toEqual(["RED", "BLUE"]);
  });
});
