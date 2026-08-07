import { describe, expect, it } from "vitest";
import {
  CardIndexTaken,
  CardNumberTaken,
  CustomerNotFound,
  CustomerNumberOutOfRange,
  CustomerNumberTaken,
  GroupUnchanged,
  MissingRequiredField,
  NoSettingsInForce,
  NotesTooLong,
} from "@/domain/errors";
import { tierOf } from "./notice-tier";

/**
 * Which colour a failure comes back in. The table itself is proved by the compiler — a
 * `Record<DomainErrorCode, NoticeTier>` cannot miss a code — so what is worth a test is the
 * *reading* of it: that a rule saying no is not the same answer as a record that is gone, and that
 * an unnamed throw falls to the safe side of the two.
 */
describe("tierOf", () => {
  it("calls a rule saying no a refusal, not an error", () => {
    expect(tierOf(new GroupUnchanged("RED"))).toBe("refusal");
  });

  it("calls a field the staff member can fix a refusal", () => {
    expect(tierOf(new MissingRequiredField("lastName"))).toBe("refusal");
    expect(tierOf(new NotesTooLong(1200, 1000))).toBe("refusal");
  });

  it("calls a record that is no longer there an error", () => {
    expect(tierOf(new CustomerNotFound(42))).toBe("error");
  });

  it("calls an unconfigured application an error", () => {
    expect(tierOf(new NoSettingsInForce(new Date("2026-08-05T00:00:00.000Z")))).toBe("error");
  });

  it("tiers the two lost races apart: a taken number is retryable, a taken card index is not", () => {
    expect(tierOf(new CustomerNumberTaken(118))).toBe("refusal");
    expect(tierOf(new CardIndexTaken(7, 3))).toBe("error");
  });

  it("calls a card number already issued on the slot an error — the run was read stale", () => {
    expect(tierOf(new CardNumberTaken(66, 1))).toBe("error");
  });

  it("calls a chosen number outside the quota a refusal — the form is right there", () => {
    expect(tierOf(new CustomerNumberOutOfRange(241, 240))).toBe("refusal");
  });

  it("calls anything untyped an error, because nobody has named it", () => {
    expect(tierOf(new Error("boom"))).toBe("error");
    expect(tierOf(undefined)).toBe("error");
    expect(tierOf("a string that was thrown")).toBe("error");
  });
});
