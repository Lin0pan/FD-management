import { describe, expect, it } from "vitest";
import { AlreadyServedInSession } from "../errors";
import { canCorrect, canRecord, recordForSession, type AttendanceRecord } from "./attendance";
import { createSessionGroups, type DistributionSession } from "./session";

/** A hand-out belongs to exactly one session, and that is the whole of what the rules read. */
function recordIn(sessionId: number): AttendanceRecord {
  return { sessionId };
}

function session(overrides: Partial<DistributionSession> = {}): DistributionSession {
  return {
    id: 7,
    startedAt: new Date("2026-07-23T13:00:00Z"),
    endedAt: null,
    groups: createSessionGroups(["RED"]),
    ...overrides,
  };
}

describe("recordForSession", () => {
  it("returns null when the household has no records at all", () => {
    expect(recordForSession([], 7)).toBeNull();
  });

  it("returns the record made in this session, picked out from other sessions", () => {
    const here = recordIn(7);
    const records = [recordIn(5), here, recordIn(6)];
    expect(recordForSession(records, 7)).toBe(here);
  });

  it("returns null when every record belongs to an earlier session", () => {
    expect(recordForSession([recordIn(5), recordIn(6)], 7)).toBeNull();
  });
});

describe("canRecord", () => {
  it("serves a household once per session, however long it runs", () => {
    expect(canRecord([], 7)).toBe("OK");

    const refusal = canRecord([recordIn(7)], 7);
    expect(refusal).toBeInstanceOf(AlreadyServedInSession);
    expect((refusal as AlreadyServedInSession).sessionId).toBe(7);
  });

  it("serves the same household again at a second session on the same day", () => {
    // Two sessions one afternoon apart: the morning's hand-out says nothing about the evening's,
    // which is the whole reason the rule stopped counting calendar days (US-34, FR-13).
    expect(canRecord([recordIn(7)], 8)).toBe("OK");
  });
});

describe("canCorrect", () => {
  it("keeps a record correctable while its session runs", () => {
    expect(canCorrect(session({ endedAt: null }))).toBe(true);
  });

  it("refuses to correct a record whose session has ended", () => {
    expect(canCorrect(session({ endedAt: new Date("2026-07-23T17:00:00Z") }))).toBe(false);
  });
});
