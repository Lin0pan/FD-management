import { describe, expect, it } from "vitest";
import { DomainError, InvalidCustomerRecord } from "../errors";
import { parseCardIssueReason } from "./card";

describe("parseCardIssueReason", () => {
  it("reads back the reason a registration's first card carries", () => {
    expect(parseCardIssueReason("FIRST_ISSUE")).toBe("FIRST_ISSUE");
  });

  it("reads back the reason of a card replaced after a loss", () => {
    expect(parseCardIssueReason("LOST")).toBe("LOST");
  });

  it("reads back the reason of a card a birthday made stale", () => {
    expect(parseCardIssueReason("STALE_COUNTS")).toBe("STALE_COUNTS");
  });

  it("reads back the catch-all reason", () => {
    expect(parseCardIssueReason("OTHER")).toBe("OTHER");
  });

  it("refuses a word the domain does not know rather than defaulting to OTHER", () => {
    try {
      parseCardIssueReason("VERLOREN");
      expect.unreachable("parseCardIssueReason should have rejected the value");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(InvalidCustomerRecord);
      expect((error as DomainError).message).toContain("VERLOREN");
    }
  });

  it("refuses an empty reason — every card was issued for some reason", () => {
    expect(() => parseCardIssueReason("")).toThrow(InvalidCustomerRecord);
  });
});
