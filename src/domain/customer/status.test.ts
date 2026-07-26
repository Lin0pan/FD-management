import { describe, expect, it } from "vitest";

import { IllegalStatusTransition, MissingAuditReason } from "../errors";
import { type Status, transition } from "./status";

/**
 * The status state machine (US-08.1). Every ordered pair of the three states is exercised here —
 * the legal moves return the target, the illegal ones throw — so an illegal transition is
 * impossible rather than merely unlikely. The reason a block and an archive each carry is the one
 * piece of extra data the machine asks for; its absence is a `MissingAuditReason`, not an illegal
 * move, and the error names the event rather than the class so the two moves stay distinguishable.
 */
describe("customer status transition", () => {
  const reason = "Wiederholt fremde Karten benutzt";

  it("activates a blocked customer", () => {
    expect(transition("BLOCKED", "ACTIVE")).toBe("ACTIVE");
  });

  it("blocks an active customer given a reason", () => {
    expect(transition("ACTIVE", "BLOCKED", reason)).toBe("BLOCKED");
  });

  it("archives an active customer given a reason", () => {
    expect(transition("ACTIVE", "ARCHIVED", reason)).toBe("ARCHIVED");
  });

  it("archives a blocked customer given a reason", () => {
    expect(transition("BLOCKED", "ARCHIVED", reason)).toBe("ARCHIVED");
  });

  it("refuses to block without a reason", () => {
    expect(() => transition("ACTIVE", "BLOCKED")).toThrowError(MissingAuditReason);
  });

  it("refuses to block with a whitespace-only reason", () => {
    expect(() => transition("ACTIVE", "BLOCKED", "   ")).toThrowError(MissingAuditReason);
  });

  it("names the blocked event on a reason-less block", () => {
    try {
      transition("ACTIVE", "BLOCKED", "");
      expect.unreachable("a reason-less block must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingAuditReason);
      expect((error as MissingAuditReason).what).toBe("customer.blocked");
    }
  });

  it("refuses to archive without a reason", () => {
    expect(() => transition("ACTIVE", "ARCHIVED")).toThrowError(MissingAuditReason);
  });

  it("refuses to archive with a whitespace-only reason", () => {
    expect(() => transition("BLOCKED", "ARCHIVED", "   ")).toThrowError(MissingAuditReason);
  });

  it("names the archived event on a reason-less archive", () => {
    try {
      transition("ACTIVE", "ARCHIVED", "");
      expect.unreachable("a reason-less archive must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingAuditReason);
      expect((error as MissingAuditReason).what).toBe("customer.archived");
    }
  });

  it("refuses any move out of archived", () => {
    expect(() => transition("ARCHIVED", "ACTIVE")).toThrowError(IllegalStatusTransition);
    expect(() => transition("ARCHIVED", "BLOCKED", reason)).toThrowError(IllegalStatusTransition);
    expect(() => transition("ARCHIVED", "ARCHIVED")).toThrowError(IllegalStatusTransition);
  });

  it("refuses every no-op transition", () => {
    const states: ReadonlyArray<Status> = ["ACTIVE", "BLOCKED", "ARCHIVED"];
    for (const state of states) {
      expect(() => transition(state, state, reason)).toThrowError(IllegalStatusTransition);
    }
  });

  it("carries both states on an illegal move", () => {
    try {
      transition("ARCHIVED", "ACTIVE");
      expect.unreachable("moving out of archived must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalStatusTransition);
      expect((error as IllegalStatusTransition).from).toBe("ARCHIVED");
      expect((error as IllegalStatusTransition).to).toBe("ACTIVE");
    }
  });
});
