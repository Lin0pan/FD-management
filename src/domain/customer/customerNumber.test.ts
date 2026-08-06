import { describe, expect, it } from "vitest";

import { CustomerNumberOutOfRange, CustomerNumberTaken, NoFreeCustomerNumber } from "../errors";
import {
  assertFreeNumber,
  findLowestFreeNumber,
  freeNumbers,
  lowestFreeNumber,
} from "./customerNumber";

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

/**
 * The total form of the same rule, for a screen that has to render whether or not a slot is free.
 * It is the one scan both functions share, so these tests only state what the `null` case means.
 */
describe("findLowestFreeNumber", () => {
  it("gives the lowest free slot, like the throwing form", () => {
    expect(findLowestFreeNumber([1, 2, 4], 240)).toBe(3);
  });

  it("gives null instead of refusing when the register is full", () => {
    expect(findLowestFreeNumber([1, 2], 2)).toBeNull();
  });
});

/**
 * The whole pool, for a screen that offers a choice rather than announcing one number. It is the
 * same rule {@link findLowestFreeNumber} states about the first element, so what these tests are
 * about is the *set*: which numbers belong to it, and in which order.
 */
describe("freeNumbers", () => {
  it("gives every slot inside the quota that nobody holds", () => {
    expect(freeNumbers([1, 2, 4], 5)).toEqual([3, 5]);
  });

  it("puts the gap an archived customer left back into the pool", () => {
    expect(freeNumbers([1, 3], 3)).toEqual([2]);
  });

  it("gives the pool ascending even when the taken numbers arrive in any order", () => {
    expect(freeNumbers([5, 1, 3], 6)).toEqual([2, 4, 6]);
  });

  it("ignores a number taken twice rather than counting it as two slots", () => {
    expect(freeNumbers([1, 1, 2], 4)).toEqual([3, 4]);
  });

  it("ignores numbers above the quota — they cannot free a slot inside it", () => {
    expect(freeNumbers([1, 7], 3)).toEqual([2, 3]);
  });

  it("ignores numbers below 1 — they are not slots either", () => {
    expect(freeNumbers([0, -4, 1], 3)).toEqual([2, 3]);
  });

  it("gives an empty pool when every slot up to the quota is taken", () => {
    expect(freeNumbers([1, 2, 3], 3)).toEqual([]);
  });

  it("gives an empty pool when the quota is 0, because there are no slots to be free", () => {
    expect(freeNumbers([], 0)).toEqual([]);
  });

  it("gives the whole range when nobody holds a number", () => {
    expect(freeNumbers([], 4)).toEqual([1, 2, 3, 4]);
  });

  it("agrees with the lowest free number on the first element", () => {
    expect(freeNumbers([1, 2, 4], 240)[0]).toBe(findLowestFreeNumber([1, 2, 4], 240));
  });
});

/**
 * The verdict on a number a staff member chose (US-24). The pool above says what may be offered;
 * this says whether one of them may still be written — the two halves of the same rule, so that a
 * chosen number is never quietly swapped for another.
 */
describe("assertFreeNumber", () => {
  it("gives back the number that was asked for when nobody holds it", () => {
    expect(assertFreeNumber(3, [1, 2, 4], 240)).toBe(3);
  });

  it("accepts a number an archived household left behind", () => {
    expect(assertFreeNumber(2, [1, 3], 240)).toBe(2);
  });

  it("accepts the quota itself, which is the last slot rather than one beyond it", () => {
    expect(assertFreeNumber(240, [1], 240)).toBe(240);
  });

  it("refuses a number an active customer holds", () => {
    expect(() => assertFreeNumber(2, [1, 2], 240)).toThrow(CustomerNumberTaken);
  });

  it("carries the taken number so the message can name it", () => {
    try {
      assertFreeNumber(2, [1, 2], 240);
      expect.unreachable("expected CustomerNumberTaken");
    } catch (error) {
      expect(error).toBeInstanceOf(CustomerNumberTaken);
      expect((error as CustomerNumberTaken).customerNumber).toBe(2);
    }
  });

  it("refuses 0, which is below the first slot", () => {
    expect(() => assertFreeNumber(0, [], 240)).toThrow(CustomerNumberOutOfRange);
  });

  it("refuses a negative number", () => {
    expect(() => assertFreeNumber(-1, [], 240)).toThrow(CustomerNumberOutOfRange);
  });

  it("refuses the number one above the quota", () => {
    expect(() => assertFreeNumber(241, [], 240)).toThrow(CustomerNumberOutOfRange);
  });

  it("refuses a number the quota no longer reaches after it was lowered", () => {
    expect(() => assertFreeNumber(200, [], 100)).toThrow(CustomerNumberOutOfRange);
  });

  it("refuses a number that is not whole", () => {
    expect(() => assertFreeNumber(1.5, [], 240)).toThrow(CustomerNumberOutOfRange);
  });

  it("carries the number and the quota it fell outside, so the limit can be named", () => {
    try {
      assertFreeNumber(241, [], 240);
      expect.unreachable("expected CustomerNumberOutOfRange");
    } catch (error) {
      expect(error).toBeInstanceOf(CustomerNumberOutOfRange);
      expect((error as CustomerNumberOutOfRange).customerNumber).toBe(241);
      expect((error as CustomerNumberOutOfRange).quotaN).toBe(240);
    }
  });

  it("calls a number out of range rather than taken when it is both", () => {
    expect(() => assertFreeNumber(4, [4], 3)).toThrow(CustomerNumberOutOfRange);
  });
});
