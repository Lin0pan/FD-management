import { describe, expect, it } from "vitest";
import { AlreadyServedToday } from "../errors";
import { canCorrect, canRecord, type AttendanceRecord } from "./attendance";

/** A record made at a precise UTC instant — the fixture reasons in UTC and asserts the Berlin day. */
function recordAt(iso: string): AttendanceRecord {
  return { date: new Date(iso) };
}

describe("canRecord", () => {
  it("permits recording when the customer has no records at all", () => {
    expect(canRecord([], new Date("2026-07-23T09:00:00Z"))).toBe("OK");
  });

  it("permits recording when the only record is from an earlier day", () => {
    const lastWeek = [recordAt("2026-07-16T09:00:00Z")];
    expect(canRecord(lastWeek, new Date("2026-07-23T09:00:00Z"))).toBe("OK");
  });

  it("refuses a second record on the same Berlin day, carrying the existing record's date", () => {
    const existing = recordAt("2026-07-23T07:30:00Z");
    const result = canRecord([existing], new Date("2026-07-23T14:00:00Z"));
    expect(result).toBeInstanceOf(AlreadyServedToday);
    expect((result as AlreadyServedToday).existingDate).toBe(existing.date);
  });

  it("finds the same-day record among several from other days", () => {
    const today = recordAt("2026-07-23T08:00:00Z");
    const records = [recordAt("2026-07-02T08:00:00Z"), today, recordAt("2026-07-09T08:00:00Z")];
    const result = canRecord(records, new Date("2026-07-23T18:00:00Z"));
    expect(result).toBeInstanceOf(AlreadyServedToday);
    expect((result as AlreadyServedToday).existingDate).toBe(today.date);
  });

  // 21:59Z is 23:59 Berlin (summer, UTC+2) and 22:01Z is 00:01 the next Berlin day — two minutes
  // apart yet different calendar days, though both fall on the same UTC day. A UTC comparison would
  // wrongly treat them as one day; the rule counts the Berlin wall-clock day the hand-out happened on.
  it("treats a record just before Berlin midnight as a different day from just after", () => {
    const beforeMidnight = recordAt("2026-07-15T21:59:00Z");
    expect(canRecord([beforeMidnight], new Date("2026-07-15T22:01:00Z"))).toBe("OK");
  });
});

describe("canCorrect", () => {
  it("allows correcting a record made earlier the same Berlin day", () => {
    const record = recordAt("2026-07-23T07:30:00Z");
    expect(canCorrect(record, new Date("2026-07-23T15:00:00Z"))).toBe(true);
  });

  it("refuses correcting a record made on an earlier day", () => {
    const record = recordAt("2026-07-16T09:00:00Z");
    expect(canCorrect(record, new Date("2026-07-23T09:00:00Z"))).toBe(false);
  });

  // Same Berlin-midnight boundary as above: a record entered at 23:59 Berlin is immutable by 00:01
  // the next morning, even though only two minutes and no UTC-day boundary separate them.
  it("refuses correcting once the Berlin day has rolled over", () => {
    const record = recordAt("2026-07-15T21:59:00Z");
    expect(canCorrect(record, new Date("2026-07-15T22:01:00Z"))).toBe(false);
  });

  // Across the autumn fall-back (2026-10-25, clocks 03:00 → 02:00, offset +2 → +1): the record at
  // 23:30Z the previous day is 01:30 Berlin on the 25th (+2) and "today" at 22:30Z is 23:30 Berlin on
  // the same 25th (+1). A fixed offset would misplace one across midnight; the Berlin day holds them
  // together, so a correction made late on the distribution day still lands on the same calendar day.
  it("keeps a record correctable across a DST change on the same Berlin day", () => {
    const record = recordAt("2026-10-24T23:30:00Z");
    expect(canCorrect(record, new Date("2026-10-25T22:30:00Z"))).toBe(true);
  });

  // Across the spring-forward (2026-03-29, clocks 02:00 → 03:00): 00:30Z is 01:30 Berlin (+1) and
  // 20:00Z is 22:00 Berlin (+2) — both the 29th despite the hour that never existed between them.
  it("recognises the same Berlin day spanning the spring-forward gap", () => {
    const record = recordAt("2026-03-29T00:30:00Z");
    expect(canCorrect(record, new Date("2026-03-29T20:00:00Z"))).toBe(true);
  });
});
