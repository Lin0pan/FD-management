import { describe, expect, it } from "vitest";
import { InvalidCalendarDay } from "./errors";
import {
  formatCalendarDay,
  isBlankDay,
  isoCalendarDay,
  isoWeek,
  parseCalendarDay,
  startOfUtcDay,
} from "./calendarDay";

/**
 * A calendar day as DF type it: `TT.MM.JJJJ`. The native `<input type="date">` was withdrawn in
 * ADR-013; this module is the one place text becomes a day, and it fails loudly rather than guessing.
 */
describe("parseCalendarDay", () => {
  it("reads a German day as the UTC day it names", () => {
    expect(parseCalendarDay("11.02.1985")).toEqual(new Date("1985-02-11T00:00:00.000Z"));
  });

  it("accepts the day the native input got wrong", () => {
    // The regression DF hit. In German order 15.03.1985 is simply the 15th of March; it was only
    // ever a problem because a US-ordered widget read the 15 as a month. Under our own format the
    // day DF typed is the day they get.
    expect(parseCalendarDay("15.03.1985")).toEqual(new Date("1985-03-15T00:00:00.000Z"));
  });

  it("refuses a month that does not exist rather than clamping it to December", () => {
    // The Chromium behaviour this module exists to prevent: asked for month 15 it answered with the
    // 12th and reported nothing. Here 15 is not a month, and the answer is an error.
    expect(() => parseCalendarDay("03.15.1985")).toThrow(InvalidCalendarDay);
  });

  it("refuses month zero", () => {
    expect(() => parseCalendarDay("11.00.1985")).toThrow(InvalidCalendarDay);
  });

  it("refuses day zero", () => {
    expect(() => parseCalendarDay("00.02.1985")).toThrow(InvalidCalendarDay);
  });

  it("refuses a day the month does not have", () => {
    expect(() => parseCalendarDay("31.04.2026")).toThrow(InvalidCalendarDay);
  });

  it("refuses the 29th of February in a common year", () => {
    expect(() => parseCalendarDay("29.02.2027")).toThrow(InvalidCalendarDay);
  });

  it("accepts the 29th of February in a leap year", () => {
    expect(parseCalendarDay("29.02.2028")).toEqual(new Date("2028-02-29T00:00:00.000Z"));
  });

  it("accepts the 29th of February in a leap year divisible by 400", () => {
    expect(parseCalendarDay("29.02.2000")).toEqual(new Date("2000-02-29T00:00:00.000Z"));
  });

  it("refuses the 29th of February in a century that is not a leap year", () => {
    expect(() => parseCalendarDay("29.02.1900")).toThrow(InvalidCalendarDay);
  });

  it("refuses an empty field, so that missing and malformed stay different answers", () => {
    // The app tells these two apart: a blank field is not a badly typed one, and saying "wrong
    // format" to somebody who typed nothing is what sent DF looking for a formatting mistake.
    expect(() => parseCalendarDay("")).toThrow(InvalidCalendarDay);
    expect(isBlankDay("")).toBe(true);
    expect(isBlankDay("   ")).toBe(true);
    expect(isBlankDay("11.02.1985")).toBe(false);
  });

  it("ignores surrounding whitespace, because a paste carries it", () => {
    expect(parseCalendarDay("  11.02.1985  ")).toEqual(new Date("1985-02-11T00:00:00.000Z"));
  });

  it("requires two-digit day and month and a four-digit year", () => {
    // A two-digit year is ambiguous for exactly the people this register is about: "11.02.35" could
    // be a grandmother or a child, so it is refused rather than guessed at.
    expect(() => parseCalendarDay("1.2.1985")).toThrow(InvalidCalendarDay);
    expect(() => parseCalendarDay("11.02.85")).toThrow(InvalidCalendarDay);
  });

  it("refuses an ISO day, which is what the old input submitted", () => {
    // Not a courtesy: accepting both would mean two formats in the register's one input, and a
    // spec that fed the old format would pass while DF's screen did something else.
    expect(() => parseCalendarDay("1985-02-11")).toThrow(InvalidCalendarDay);
  });

  it("refuses anything that is not digits and dots", () => {
    expect(() => parseCalendarDay("11/02/1985")).toThrow(InvalidCalendarDay);
    expect(() => parseCalendarDay("gestern")).toThrow(InvalidCalendarDay);
    expect(() => parseCalendarDay("11.02.1985x")).toThrow(InvalidCalendarDay);
  });

  it("names the text it refused, so the field can say what it read", () => {
    expect(() => parseCalendarDay("03.15.1985")).toThrow(
      expect.objectContaining({ code: "InvalidCalendarDay", text: "03.15.1985" }),
    );
  });
});

describe("formatCalendarDay", () => {
  it("writes a day the way it is typed", () => {
    expect(formatCalendarDay(new Date("1985-02-11T00:00:00.000Z"))).toBe("11.02.1985");
  });

  it("pads a single-digit day and month", () => {
    expect(formatCalendarDay(new Date("2026-01-08T00:00:00.000Z"))).toBe("08.01.2026");
  });

  it("reads the day in UTC, so a day typed in Germany does not slip backwards", () => {
    // The trap the old code documented: a Date rendered in a local zone lands on the day before.
    expect(formatCalendarDay(new Date("2026-01-08T23:30:00.000Z"))).toBe("08.01.2026");
  });

  it("round-trips whatever the parser produced", () => {
    for (const day of ["01.01.1900", "29.02.2028", "31.12.2099", "08.01.2026"]) {
      expect(formatCalendarDay(parseCalendarDay(day))).toBe(day);
    }
  });
});

describe("isoCalendarDay", () => {
  it("writes the ISO day the database and the domain compare on", () => {
    expect(isoCalendarDay(new Date("1985-02-11T00:00:00.000Z"))).toBe("1985-02-11");
  });

  it("pads a single-digit month and day", () => {
    expect(isoCalendarDay(new Date("2026-01-08T00:00:00.000Z"))).toBe("2026-01-08");
  });
});

describe("startOfUtcDay", () => {
  it("answers the same day for the last minute of a day and the first minute of it", () => {
    const early = startOfUtcDay(new Date("2026-03-12T00:01:00.000Z"));
    const late = startOfUtcDay(new Date("2026-03-12T23:59:00.000Z"));
    expect(early.toISOString()).toBe("2026-03-12T00:00:00.000Z");
    expect(late.getTime()).toBe(early.getTime());
  });

  it("leaves a day that is already midnight UTC where it is", () => {
    const day = parseCalendarDay("29.02.2028");
    expect(startOfUtcDay(day).getTime()).toBe(day.getTime());
  });
});

/** The week the header names („KW 2"): ISO 8601, a week belonging to the year that holds its Thursday. */
describe("isoWeek", () => {
  it("counts the Thursday rule: 1 January 2026 is in week 1", () => {
    expect(isoWeek(parseCalendarDay("01.01.2026"))).toEqual({ week: 1, year: 2026 });
  });

  it("puts 31 December 2026 in week 53", () => {
    expect(isoWeek(parseCalendarDay("31.12.2026"))).toEqual({ week: 53, year: 2026 });
  });

  it("puts 1 January 2027 in week 53 of 2026", () => {
    expect(isoWeek(parseCalendarDay("01.01.2027"))).toEqual({ week: 53, year: 2026 });
  });

  it("puts 4 January 2027 in week 1 of 2027", () => {
    expect(isoWeek(parseCalendarDay("04.01.2027"))).toEqual({ week: 1, year: 2027 });
  });

  it("puts 29 December 2025 in week 1 of 2026", () => {
    // The other direction across the year: a Monday whose Thursday is already in January.
    expect(isoWeek(parseCalendarDay("29.12.2025"))).toEqual({ week: 1, year: 2026 });
  });

  it("handles 29 February 2028", () => {
    expect(isoWeek(parseCalendarDay("29.02.2028"))).toEqual({ week: 9, year: 2028 });
  });

  it("reads a Sunday as the end of its week, not the start of the next", () => {
    expect(isoWeek(parseCalendarDay("11.01.2026"))).toEqual({ week: 2, year: 2026 });
    expect(isoWeek(parseCalendarDay("12.01.2026"))).toEqual({ week: 3, year: 2026 });
  });
});
