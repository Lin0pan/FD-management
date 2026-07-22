import { describe, expect, it } from "vitest";
import { DomainError, MissingAuditReason } from "./errors";

/**
 * `MissingAuditReason` is raised by the state changes that turn on a human judgement — blocking,
 * archiving — none of which exist yet; `updateSettings` deliberately no longer uses it. It is
 * covered here so the rule it stands for stays stated while its callers are still to be written.
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
