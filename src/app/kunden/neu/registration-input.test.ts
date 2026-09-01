import { describe, expect, it } from "vitest";
import { CardIndexTaken, CardNumberTaken, CustomerNotFound } from "@/domain/errors";
import { customerErrorMessage } from "./registration-input";

/**
 * The sentences the two lost card races come back as.
 *
 * They are proved here rather than in the e2e suite because they cannot be provoked from a browser
 * at all: both are two transactions colliding on a unique index, and no sequence of clicks arranges
 * that. What a test *can* hold is the mapping — the same argument `src/app/notice-tier.test.ts`
 * makes for the other pure table in this layer.
 *
 * Only the two card arms are covered. The rest of `customerErrorMessage` translates rules a staff
 * member can break by typing, and those are read on the screens that raise them.
 */
describe("customerErrorMessage", () => {
  it("names the card a lost slot race spent, as staff read it off the card", () => {
    expect(customerErrorMessage(new CardNumberTaken(50, 3))).toContain("50k3");
  });

  it("names no card number when the index was taken on the record", () => {
    const message = customerErrorMessage(new CardIndexTaken(7, 3));

    // Neither a card number composed from what the error happens to carry, nor the surrogate id it
    // carries instead of a slot: the card that took the index may have been printed under a number
    // this household has since left, so any number here would name a card nobody printed.
    expect(message).not.toBeNull();
    expect(message).not.toMatch(/\dk\d/);
    expect(message).not.toContain("7");
  });

  it("still answers null for an error it has no words for", () => {
    expect(customerErrorMessage(new CustomerNotFound(4))).toBeNull();
  });
});
