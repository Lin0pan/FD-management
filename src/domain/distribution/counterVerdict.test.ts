import { describe, expect, it } from "vitest";
import type { CounterCustomer } from "./counterVerdict";
import { evaluateAtCounter } from "./counterVerdict";

function on(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** A clear-to-serve customer; each test overrides only the fields its rule turns on. */
function customer(overrides: Partial<CounterCustomer> = {}): CounterCustomer {
  return {
    customerNumber: 50,
    status: "ACTIVE",
    group: "RED",
    blockReason: null,
    currentCardIndex: 3,
    certificateValidUntil: on("2027-01-01"),
    reminderCount: 0,
    ...overrides,
  };
}

/** The counter is worked on a RED distribution day; the bare-number happy path is a match. */
const TODAY = on("2026-07-23");

describe("evaluateAtCounter precedence", () => {
  it("reports NOT_FOUND for a missing customer, before any status is read", () => {
    const verdict = evaluateAtCounter({
      customer: null,
      presentedCardIndex: null,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("NOT_FOUND");
  });

  it("reports ARCHIVED before WRONG_GROUP for an archived customer in the wrong group", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ status: "ARCHIVED", group: "BLUE" }),
      presentedCardIndex: null,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("ARCHIVED");
  });

  it("reports BLOCKED before WRONG_GROUP for a blocked customer in the wrong group", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ status: "BLOCKED", blockReason: "Hausverbot", group: "BLUE" }),
      presentedCardIndex: null,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict).toEqual({ kind: "BLOCKED", reason: "Hausverbot" });
  });

  it("reports WRONG_GROUP before OUTDATED_CARD for a wrong-group customer holding an old card", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ group: "BLUE" }),
      presentedCardIndex: 2,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict).toEqual({ kind: "WRONG_GROUP", group: "BLUE", weekColour: "RED" });
  });

  it("reports OUTDATED_CARD before the certificate check for an old card and a lapsed certificate", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ currentCardIndex: 3, certificateValidUntil: on("2020-01-01") }),
      presentedCardIndex: 2,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict).toEqual({
      kind: "OUTDATED_CARD",
      presented: { customerNumber: 50, index: 2 },
      current: { customerNumber: 50, index: 3 },
    });
  });

  it("reports CLEAR_TO_SERVE_CERTIFICATE_EXPIRED before CLEAR_TO_SERVE for a lapsed certificate", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ certificateValidUntil: on("2020-01-01"), reminderCount: 2 }),
      presentedCardIndex: null,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict).toEqual({
      kind: "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED",
      validUntil: on("2020-01-01"),
      reminderCount: 2,
    });
  });

  it("reports CLEAR_TO_SERVE for the right group, the current card and a valid certificate", () => {
    const verdict = evaluateAtCounter({
      customer: customer(),
      presentedCardIndex: 3,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("CLEAR_TO_SERVE");
  });
});

describe("evaluateAtCounter card matching", () => {
  it("does not report OUTDATED_CARD for a bare customer number with no index presented", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ currentCardIndex: 3 }),
      presentedCardIndex: null,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("CLEAR_TO_SERVE");
  });

  it("does not report OUTDATED_CARD when the presented index equals the current one", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ currentCardIndex: 3 }),
      presentedCardIndex: 3,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("CLEAR_TO_SERVE");
  });

  it("reports OUTDATED_CARD naming the presented and the current card number", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ customerNumber: 12, currentCardIndex: 4 }),
      presentedCardIndex: 1,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict).toEqual({
      kind: "OUTDATED_CARD",
      presented: { customerNumber: 12, index: 1 },
      current: { customerNumber: 12, index: 4 },
    });
  });
});

describe("evaluateAtCounter wrong group", () => {
  it("sends a BLUE customer away in a RED week", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ group: "BLUE" }),
      presentedCardIndex: null,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict).toEqual({ kind: "WRONG_GROUP", group: "BLUE", weekColour: "RED" });
  });

  it("serves a BLUE customer in a BLUE week", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ group: "BLUE" }),
      presentedCardIndex: null,
      today: TODAY,
      weekColour: "BLUE",
    });
    expect(verdict.kind).toBe("CLEAR_TO_SERVE");
  });
});

describe("evaluateAtCounter certificate boundary", () => {
  it("serves on the last day the certificate is valid, not before", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ certificateValidUntil: on("2026-07-23") }),
      presentedCardIndex: null,
      today: on("2026-07-23"),
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("CLEAR_TO_SERVE");
  });

  it("serves the day before the certificate lapses", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ certificateValidUntil: on("2026-07-23") }),
      presentedCardIndex: null,
      today: on("2026-07-22"),
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("CLEAR_TO_SERVE");
  });

  it("prompts a reminder the day after the certificate lapses", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ certificateValidUntil: on("2026-07-23") }),
      presentedCardIndex: null,
      today: on("2026-07-24"),
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("CLEAR_TO_SERVE_CERTIFICATE_EXPIRED");
  });

  it("ignores the time of day, treating a same-day expiry as still valid", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ certificateValidUntil: new Date("2026-07-23T06:00:00.000Z") }),
      presentedCardIndex: null,
      today: new Date("2026-07-23T22:45:00.000Z"),
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("CLEAR_TO_SERVE");
  });

  it("holds a 29 February certificate valid on the leap day itself", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ certificateValidUntil: on("2024-02-29") }),
      presentedCardIndex: null,
      today: on("2024-02-29"),
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("CLEAR_TO_SERVE");
  });

  it("expires a 29 February certificate on 1 March", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ certificateValidUntil: on("2024-02-29") }),
      presentedCardIndex: null,
      today: on("2024-03-01"),
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("CLEAR_TO_SERVE_CERTIFICATE_EXPIRED");
  });

  it("never produces a blocking verdict from an expired certificate", () => {
    const verdict = evaluateAtCounter({
      customer: customer({ certificateValidUntil: on("2020-01-01"), reminderCount: 5 }),
      presentedCardIndex: null,
      today: TODAY,
      weekColour: "RED",
    });
    expect(verdict.kind).toBe("CLEAR_TO_SERVE_CERTIFICATE_EXPIRED");
  });
});
