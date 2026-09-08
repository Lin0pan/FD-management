import { describe, expect, it } from "vitest";
import { CardIndexTaken, CardNumberTaken, CustomerNotFound } from "@/domain/errors";
import { customerErrorMessage } from "./registration-input";

/**
 * The sentences the two lost card races come back as. Proved here rather than in the e2e suite
 * because they cannot be provoked from a browser at all — both are two transactions colliding on a
 * unique index. What a test *can* hold is the mapping.
 *
 * Only the two card arms: the rest of `customerErrorMessage` translates rules a staff member can
 * break by typing, and those are read on the screens that raise them.
 */
describe("customerErrorMessage", () => {
  it("names the card a lost slot race spent, as staff read it off the card", () => {
    expect(customerErrorMessage(new CardNumberTaken(50, 3))).toContain("50k3");
  });

  it("names no number at all when the index was taken on the record", () => {
    const message = customerErrorMessage(new CardIndexTaken(7, 3));

    // No digit, rather than "not the id" and "not a card number" in turn: the arm returns a
    // constant, so the whole class can be asserted, and forbidding only the two values this error
    // happens to carry would pass a sentence that leaked the other one.
    expect(message).not.toBeNull();
    expect(message).not.toMatch(/\d/);
  });

  it("still answers null for an error it has no words for", () => {
    expect(customerErrorMessage(new CustomerNotFound(4))).toBeNull();
  });
});
