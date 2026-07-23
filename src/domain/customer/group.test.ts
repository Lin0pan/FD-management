import { describe, expect, it } from "vitest";

import { InvalidCustomerRecord } from "../errors";
import { parseGroup, suggestGroup } from "./group";

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

describe("parseGroup", () => {
  it("reads RED back from a stored row", () => {
    expect(parseGroup("RED")).toBe("RED");
  });

  it("reads BLUE back from a stored row", () => {
    expect(parseGroup("BLUE")).toBe("BLUE");
  });

  it("rejects a word that is neither group rather than defaulting to one", () => {
    expect(() => parseGroup("GREEN")).toThrow(InvalidCustomerRecord);
  });

  it("names the field and quotes the value it rejected", () => {
    try {
      parseGroup("rot");
      expect.unreachable("parseGroup should have rejected the value");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(InvalidCustomerRecord);
      expect((error as InvalidCustomerRecord).field).toBe("group");
      expect((error as InvalidCustomerRecord).value).toBe("rot");
    }
  });

  it("is case-sensitive — the stored words are the domain's, not a human's spelling", () => {
    expect(() => parseGroup("red")).toThrow(InvalidCustomerRecord);
  });
});
