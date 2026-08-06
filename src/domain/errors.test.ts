import { describe, expect, it } from "vitest";
import { CardNumberTaken, DomainError, MissingAuditReason } from "./errors";

/**
 * `MissingAuditReason` is raised by the state changes that turn on a human judgement — blocking
 * (US-08) and archiving (US-10), neither of which exists yet; `updateSettings` deliberately no
 * longer uses it. It is covered here so the rule it stands for stays stated while its callers are
 * still to be written.
 */
describe("MissingAuditReason", () => {
  it("names the change that arrived without a reason", () => {
    const error = new MissingAuditReason("customer.archived");

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("MissingAuditReason");
    expect(error.what).toBe("customer.archived");
    expect(error.message).toContain("customer.archived");
  });
});

/**
 * `CardNumberTaken` is raised by the repository that owns the `(customerNumber, index)` constraint
 * (US-25.3), which is still to be written. It is covered here so the rule it stands for — a card
 * number names one physical card for good — stays stated while its caller is on its way.
 */
describe("CardNumberTaken", () => {
  it("names the card number that was already issued on the slot", () => {
    const error = new CardNumberTaken(66, 1);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("CardNumberTaken");
    expect(error.customerNumber).toBe(66);
    expect(error.index).toBe(1);
    expect(error.message).toContain("66k1");
  });
});
