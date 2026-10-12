import { describe, expect, it } from "vitest";
import { germanDate, germanDateTime, germanDayOf, germanSessionDay } from "./format";

describe("germanDate", () => {
  it("writes a date the German way, with both parts padded", () => {
    expect(germanDate(new Date("2026-07-03T00:00:00.000Z"))).toBe("03.07.2026");
  });

  it("shows the stored day itself, not the day it is in the server's time zone", () => {
    expect(germanDate(new Date("2026-01-01T00:00:00.000Z"))).toBe("01.01.2026");
  });

  it("writes the 29th of February of a leap year", () => {
    expect(germanDate(new Date("2028-02-29T00:00:00.000Z"))).toBe("29.02.2028");
  });
});

describe("germanDateTime", () => {
  it("writes the moment on the Berlin clock, not on UTC", () => {
    expect(germanDateTime(new Date("2026-01-08T17:30:00.000Z"))).toBe("08.01.2026, 18:30");
  });

  it("names the next day for an afternoon ended after midnight in Berlin", () => {
    expect(germanDateTime(new Date("2026-01-08T23:10:00.000Z"))).toBe("09.01.2026, 00:10");
  });

  it("follows the summer offset, an hour further from UTC than the winter one", () => {
    expect(germanDateTime(new Date("2026-07-02T17:30:00.000Z"))).toBe("02.07.2026, 19:30");
  });
});

describe("germanDayOf", () => {
  it("names the day an afternoon fell on, without its clock time", () => {
    expect(germanDayOf(new Date("2026-01-08T17:30:00.000Z"))).toBe("08.01.2026");
  });

  it("names the Berlin day, not the UTC one, for an afternoon started after midnight", () => {
    expect(germanDayOf(new Date("2026-07-02T23:30:00.000Z"))).toBe("03.07.2026");
  });

  it("writes the 29th of February of a leap year", () => {
    expect(germanDayOf(new Date("2028-02-29T12:00:00.000Z"))).toBe("29.02.2028");
  });
});

describe("germanSessionDay", () => {
  it("names the weekday, the day and the calendar week an afternoon started in", () => {
    expect(germanSessionDay(new Date("2026-10-12T12:00:00.000Z"))).toBe("Mo 12.10.2026 · KW 42");
  });

  it("keeps a Sunday-night start in the Berlin day and week, not the UTC one", () => {
    // 22:30 UTC on Sunday 11 October is already Monday in Berlin, and KW 42 rather than 41.
    expect(germanSessionDay(new Date("2026-10-11T22:30:00.000Z"))).toBe("Mo 12.10.2026 · KW 42");
  });

  it("gives 1 January 2027 the week of the year that holds its Thursday", () => {
    expect(germanSessionDay(new Date("2027-01-01T12:00:00.000Z"))).toBe("Fr 01.01.2027 · KW 53");
  });
});
