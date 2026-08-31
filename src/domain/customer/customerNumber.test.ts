import { describe, expect, it } from "vitest";

import {
  CustomerNumberOutOfRange,
  CustomerNumberTaken,
  CustomerNumberUnchanged,
  NoFreeCustomerNumber,
} from "../errors";
import {
  assertChoosableNumber,
  assertFreeNumber,
  choosableNumbers,
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

/**
 * The same question from the other end of a household's life (US-30): not which slot to give a new
 * registration, but which slots this household may be *moved* to. The pool is `freeNumbers` plus
 * the household's own number, because a household that is on the register holds a slot and is
 * allowed to keep it.
 */
describe("choosableNumbers", () => {
  it("offers every free number and the household's own", () => {
    expect(choosableNumbers(2, [1, 2, 4], 5)).toEqual([2, 3, 5]);
  });

  it("offers the household's own number first when it is the lowest", () => {
    expect(choosableNumbers(1, [1, 3], 4)).toEqual([1, 2, 4]);
  });

  it("offers a current number above the quota, last", () => {
    expect(choosableNumbers(9, [1, 9], 4)).toEqual([2, 3, 4, 9]);
  });

  it("offers only the current number when the register is otherwise full", () => {
    expect(choosableNumbers(2, [1, 2, 3], 3)).toEqual([2]);
  });

  it("never offers a number another active household holds", () => {
    expect(choosableNumbers(2, [1, 2, 3], 4)).not.toContain(1);
  });

  it("offers the household's own number once, not twice", () => {
    expect(choosableNumbers(3, [1, 3], 4)).toEqual([2, 3, 4]);
  });

  it("agrees with the pool a registration is offered on every other number", () => {
    expect(choosableNumbers(2, [1, 2, 4], 6).filter((n) => n !== 2)).toEqual(
      freeNumbers([1, 2, 4], 6),
    );
  });
});

/**
 * The verdict on a number a staff member chose for a household already on the register. The
 * unchanged check comes first on purpose: a household parked above a lowered quota that saves its
 * own number is told it already holds it, rather than that the number is out of range.
 */
describe("assertChoosableNumber", () => {
  it("accepts the lowest free number", () => {
    expect(assertChoosableNumber(2, 5, [1, 5], 240)).toBe(2);
  });

  it("accepts a number an archived household once held", () => {
    expect(assertChoosableNumber(3, 5, [1, 5], 240)).toBe(3);
  });

  it("refuses the number the household already holds", () => {
    expect(() => assertChoosableNumber(5, 5, [1, 5], 240)).toThrow(CustomerNumberUnchanged);
  });

  it("refuses the household's own number even when it is above the quota", () => {
    expect(() => assertChoosableNumber(300, 300, [300], 240)).toThrow(CustomerNumberUnchanged);
  });

  it("carries the number it already holds, so the message can name it", () => {
    try {
      assertChoosableNumber(5, 5, [1, 5], 240);
      expect.unreachable("expected CustomerNumberUnchanged");
    } catch (error) {
      expect(error).toBeInstanceOf(CustomerNumberUnchanged);
      expect((error as CustomerNumberUnchanged).customerNumber).toBe(5);
    }
  });

  it("refuses a number outside the quota", () => {
    expect(() => assertChoosableNumber(241, 5, [5], 240)).toThrow(CustomerNumberOutOfRange);
  });

  it("refuses a number an active household holds", () => {
    expect(() => assertChoosableNumber(1, 5, [1, 5], 240)).toThrow(CustomerNumberTaken);
  });
});
