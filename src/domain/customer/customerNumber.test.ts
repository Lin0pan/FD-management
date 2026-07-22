import { describe, expect, it } from "vitest";

import { NoFreeCustomerNumber } from "../errors";
import { lowestFreeNumber } from "./customerNumber";

describe("lowestFreeNumber", () => {
  it("gives the first customer number 1 when nothing is taken", () => {
    expect(lowestFreeNumber([], 240)).toBe(1);
  });

  it("fills the gap an archived customer left before handing out a higher number", () => {
    expect(lowestFreeNumber([1, 2, 4], 240)).toBe(3);
  });

  it("hands out the number after the highest when the range is contiguous", () => {
    expect(lowestFreeNumber([1, 2, 3], 240)).toBe(4);
  });

  it("does not care in which order the taken numbers arrive", () => {
    expect(lowestFreeNumber([4, 1, 2], 240)).toBe(3);
  });

  it("ignores a number taken twice rather than counting it as two slots", () => {
    expect(lowestFreeNumber([1, 1, 2], 240)).toBe(3);
  });

  it("hands out 1 when the quota is 1 and nobody holds it", () => {
    expect(lowestFreeNumber([], 1)).toBe(1);
  });

  it("rejects when the quota is 1 and that single number is taken", () => {
    expect(() => lowestFreeNumber([1], 1)).toThrow(NoFreeCustomerNumber);
  });

  it("rejects when every number up to the quota is taken", () => {
    expect(() => lowestFreeNumber([1, 2, 3], 3)).toThrow(NoFreeCustomerNumber);
  });

  it("ignores numbers above the quota — they cannot free a slot inside it", () => {
    expect(() => lowestFreeNumber([1, 2, 3, 7], 3)).toThrow(NoFreeCustomerNumber);
  });

  it("carries the quota it exhausted so the UI can name the limit", () => {
    try {
      lowestFreeNumber([1, 2], 2);
      expect.unreachable("expected NoFreeCustomerNumber");
    } catch (error) {
      expect(error).toBeInstanceOf(NoFreeCustomerNumber);
      expect((error as NoFreeCustomerNumber).quotaN).toBe(2);
    }
  });
});
