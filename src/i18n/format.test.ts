import { describe, expect, it } from "vitest";
import { germanDate, germanDateTime, germanDayOf } from "./format";

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
