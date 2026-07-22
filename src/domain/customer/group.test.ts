import { describe, expect, it } from "vitest";

import { suggestGroup } from "./group";

describe("suggestGroup", () => {
  it("suggests BLUE when red already holds more active customers", () => {
    expect(suggestGroup({ red: 12, blue: 9 })).toBe("BLUE");
  });

  it("suggests RED when blue already holds more active customers", () => {
    expect(suggestGroup({ red: 9, blue: 12 })).toBe("RED");
  });

  it("suggests RED on a tie, so the same register always yields the same advice", () => {
    expect(suggestGroup({ red: 10, blue: 10 })).toBe("RED");
  });

  it("suggests RED for the very first customer, when both groups are empty", () => {
    expect(suggestGroup({ red: 0, blue: 0 })).toBe("RED");
  });

  it("suggests the smaller group by one customer, not by a margin", () => {
    expect(suggestGroup({ red: 10, blue: 9 })).toBe("BLUE");
  });
});
