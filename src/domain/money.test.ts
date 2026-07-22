import { describe, expect, it } from "vitest";
import { InvalidEuroAmount } from "./errors";
import { formatEuroAmount, formatEuros, parseEuros } from "./money";

describe("formatEuros", () => {
  it("formats whole euros", () => {
    expect(formatEuros(100)).toBe("1,00 €");
  });

  it("formats euros with cents", () => {
    expect(formatEuros(150)).toBe("1,50 €");
  });

  it("pads a single-digit cents remainder", () => {
    expect(formatEuros(5)).toBe("0,05 €");
  });

  it("formats zero", () => {
    expect(formatEuros(0)).toBe("0,00 €");
  });

  it("formats negative amounts", () => {
    expect(formatEuros(-100)).toBe("-1,00 €");
  });

  it("rejects non-integer cents", () => {
    expect(() => formatEuros(1.5)).toThrow(RangeError);
  });
});

describe("formatEuroAmount", () => {
  it("omits the currency symbol, so the text can go straight into an input field", () => {
    expect(formatEuroAmount(150)).toBe("1,50");
  });

  it("pads a single-digit cents remainder", () => {
    expect(formatEuroAmount(5)).toBe("0,05");
  });

  it("rejects non-integer cents", () => {
    expect(() => formatEuroAmount(1.5)).toThrow(RangeError);
  });

  it("round-trips through parseEuros", () => {
    expect(parseEuros(formatEuroAmount(1234))).toBe(1234);
  });
});

describe("parseEuros", () => {
  it("reads a comma as the decimal separator, as German input writes it", () => {
    expect(parseEuros("2,50")).toBe(250);
  });

  it("accepts a full stop too, because a numeric keypad offers one", () => {
    expect(parseEuros("2.50")).toBe(250);
  });

  it("treats a single decimal digit as tenths of a euro", () => {
    expect(parseEuros("2,5")).toBe(250);
  });

  it("reads a whole euro amount without a separator", () => {
    expect(parseEuros("7")).toBe(700);
  });

  it("reads an amount below one euro", () => {
    expect(parseEuros("0,05")).toBe(5);
  });

  it("ignores surrounding whitespace", () => {
    expect(parseEuros("  2,50  ")).toBe(250);
  });

  it("rejects a third decimal digit rather than rounding money away", () => {
    expect(() => parseEuros("2,555")).toThrow(InvalidEuroAmount);
  });

  it("rejects a negative amount — a price is never below zero", () => {
    expect(() => parseEuros("-2,50")).toThrow(InvalidEuroAmount);
  });

  it("rejects an empty input", () => {
    expect(() => parseEuros("   ")).toThrow(InvalidEuroAmount);
  });

  it("rejects text that is not a number", () => {
    expect(() => parseEuros("zwei Euro")).toThrow(InvalidEuroAmount);
  });

  it("names the offending text in the error", () => {
    expect(() => parseEuros("1,2,3")).toThrow(/1,2,3/);
  });

  it("round-trips through formatEuros", () => {
    expect(formatEuros(parseEuros("12,34"))).toBe("12,34 €");
  });
});
