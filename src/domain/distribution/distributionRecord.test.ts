import { describe, expect, it } from "vitest";
import type { Cents } from "../money";
import { InvalidPaymentAmount } from "../errors";
import { requirePayment } from "./distributionRecord";

/**
 * The one rule the record carries itself: the amount handed over is whole cents, and never negative.
 *
 * The balance is derived rather than stored (ADR-015), so a bad amount here has no stored figure to
 * be corrected against — it is carried by every later reading of that household's balance. The
 * counter cannot produce one, because `parseEuros` refuses it in the text; these tests are about
 * every other caller.
 */
describe("requirePayment", () => {
  it("accepts a payment of nothing, which is an ordinary hand-out", () => {
    expect(() => requirePayment(0 as Cents)).not.toThrow();
  });

  it("accepts a whole number of cents", () => {
    expect(() => requirePayment(1250 as Cents)).not.toThrow();
  });

  it("refuses a negative amount, which no hand-out can mean", () => {
    const error = (() => {
      try {
        requirePayment(-100 as Cents);
      } catch (thrown: unknown) {
        return thrown;
      }
      return null;
    })();

    expect(error).toBeInstanceOf(InvalidPaymentAmount);
    expect((error as InvalidPaymentAmount).paidCents).toBe(-100);
  });

  it("refuses a fraction of a cent rather than rounding it", () => {
    // The same judgement `parseEuros` makes on a third decimal digit: silently dropping a tenth of
    // a cent is the floating-point sloppiness the integer-cents rule exists to prevent.
    expect(() => requirePayment(12.5 as Cents)).toThrow(InvalidPaymentAmount);
  });
});
