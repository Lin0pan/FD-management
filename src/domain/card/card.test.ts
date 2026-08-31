import { describe, expect, it } from "vitest";
import { DomainError, InvalidCustomerRecord } from "../errors";
import type { IssuedCard } from "./card";
import { parseCardIssueReason } from "./card";
import { formatCardNumber } from "./cardNumber";

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

  it("reads the new reason back", () => {
    expect(parseCardIssueReason("CUSTOMER_NUMBER_CHANGED")).toBe("CUSTOMER_NUMBER_CHANGED");
  });

  it("refuses a reason word that is not one of the five", () => {
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

describe("IssuedCard", () => {
  it("a card knows the slot it was printed under", () => {
    // 5k4, printed while the household still held slot 5. Moving them to 23 tomorrow issues 23k6
    // and leaves this row alone, so the card goes on naming the number it was printed with.
    const card: IssuedCard = {
      customerNumber: 5,
      index: 4,
      issuedAt: new Date("2026-08-31T09:00:00Z"),
      reason: "CUSTOMER_NUMBER_CHANGED",
      countsAtIssue: { grownUps: 2, children: 1 },
      groupAtIssue: "RED",
    };

    expect(formatCardNumber(card.customerNumber, card.index)).toBe("5k4");
  });
});
