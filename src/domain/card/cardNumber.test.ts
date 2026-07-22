import { describe, expect, it } from "vitest";
import { formatCardNumber } from "./cardNumber";

describe("formatCardNumber", () => {
  it("joins the customer number and the card index with a k", () => {
    expect(formatCardNumber(12, 1)).toBe("12k1");
  });

  it("gives the first card of a registration the index 1", () => {
    expect(formatCardNumber(240, 1)).toBe("240k1");
  });

  it("counts a reissued card on rather than reusing the first number", () => {
    expect(formatCardNumber(7, 2)).toBe("7k2");
  });

  it("does not pad the customer number — the card says what staff type", () => {
    expect(formatCardNumber(1, 1)).toBe("1k1");
  });
});
