import { describe, expect, it } from "vitest";
import { formatEuros } from "./money";

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
