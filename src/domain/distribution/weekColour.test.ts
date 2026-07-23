import { describe, expect, it } from "vitest";
import { InvalidSettings } from "../errors";
import type { WeekAnchor } from "../policy/settings";
import { colourOf, isoWeekOf } from "./weekColour";

function on(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** The anchor used throughout: `2026-W02` runs Monday 5 January to Sunday 11 January 2026. */
const RED_ANCHOR: WeekAnchor = { isoWeek: "2026-W02", colour: "RED" };
const BLUE_ANCHOR: WeekAnchor = { isoWeek: "2026-W02", colour: "BLUE" };

const MS_PER_DAY = 86_400_000;

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

describe("colourOf", () => {
  it("gives the anchor week itself the anchor colour", () => {
    expect(colourOf(on("2026-01-05"), RED_ANCHOR)).toBe("RED");
  });

  it("flips the colour in the week after the anchor", () => {
    expect(colourOf(on("2026-01-12"), RED_ANCHOR)).toBe("BLUE");
  });

  it("flips back in the second week after the anchor", () => {
    expect(colourOf(on("2026-01-19"), RED_ANCHOR)).toBe("RED");
  });

  it("gives the week one before the anchor the other colour", () => {
    expect(colourOf(on("2025-12-29"), RED_ANCHOR)).toBe("BLUE");
  });

  it("gives the week two before the anchor the anchor colour", () => {
    expect(colourOf(on("2025-12-22"), RED_ANCHOR)).toBe("RED");
  });

  it("gives the week fifty-three before the anchor the other colour", () => {
    // 53 whole weeks before Monday 5 January 2026 is Monday 30 December 2024.
    expect(colourOf(on("2024-12-30"), RED_ANCHOR)).toBe("BLUE");
  });

  it("reads the anchor colour rather than assuming the anchor week is red", () => {
    expect(colourOf(on("2026-01-05"), BLUE_ANCHOR)).toBe("BLUE");
    expect(colourOf(on("2026-01-12"), BLUE_ANCHOR)).toBe("RED");
  });

  it("holds one colour from Monday to Sunday", () => {
    const monday = on("2026-07-20");
    const colours = [0, 1, 2, 3, 4, 5, 6].map((day) => colourOf(plusDays(monday, day), RED_ANCHOR));
    expect(new Set(colours).size).toBe(1);
  });

  it("flips on the Sunday-to-Monday boundary, not on any other night", () => {
    expect(colourOf(on("2026-07-26"), RED_ANCHOR)).toBe("RED"); // Sunday of 2026-W30
    expect(colourOf(on("2026-07-27"), RED_ANCHOR)).toBe("BLUE"); // Monday of 2026-W31
  });

  it("ignores the time of day", () => {
    const lateSunday = new Date("2026-07-26T23:59:59.999Z");
    const earlyMonday = new Date("2026-07-27T00:00:00.001Z");
    expect(colourOf(lateSunday, RED_ANCHOR)).toBe("RED");
    expect(colourOf(earlyMonday, RED_ANCHOR)).toBe("BLUE");
  });

  it("counts 1 January 2023 as part of week 52 of the previous ISO year", () => {
    expect(colourOf(on("2023-01-01"), RED_ANCHOR)).toBe(colourOf(on("2022-12-26"), RED_ANCHOR));
    expect(colourOf(on("2023-01-02"), RED_ANCHOR)).not.toBe(colourOf(on("2023-01-01"), RED_ANCHOR));
  });

  it("counts 1 January 2027 as part of week 53 of the 53-week ISO year 2026", () => {
    expect(colourOf(on("2027-01-01"), RED_ANCHOR)).toBe(colourOf(on("2026-12-28"), RED_ANCHOR));
  });

  it("keeps alternating across the 53rd week of a 53-week year", () => {
    const week52 = colourOf(on("2026-12-21"), RED_ANCHOR);
    const week53 = colourOf(on("2026-12-28"), RED_ANCHOR);
    const nextWeek01 = colourOf(on("2027-01-04"), RED_ANCHOR);
    expect(week53).not.toBe(week52);
    expect(nextWeek01).not.toBe(week53);
  });

  it("never gives two consecutive weeks the same colour, over five years of dates", () => {
    // The property that makes "two red weeks in a row" impossible by construction (FR-3).
    let date = on("2024-01-01");
    const end = on("2029-01-01");
    while (date.getTime() < end.getTime()) {
      expect(colourOf(date, RED_ANCHOR)).not.toBe(colourOf(plusDays(date, 7), RED_ANCHOR));
      date = plusDays(date, 1);
    }
  });

  it("rejects an anchor that is not an ISO week at all", () => {
    expect(() => colourOf(on("2026-01-05"), { isoWeek: "January", colour: "RED" })).toThrow(
      InvalidSettings,
    );
  });

  it("rejects an anchor naming a week the ISO calendar does not have", () => {
    // 2025 is a 52-week ISO year, so 2025-W53 passes the shape check but names nothing.
    expect(() => colourOf(on("2026-01-05"), { isoWeek: "2025-W53", colour: "RED" })).toThrow(
      InvalidSettings,
    );
  });

  it("rejects a week number of zero", () => {
    expect(() => colourOf(on("2026-01-05"), { isoWeek: "2026-W00", colour: "RED" })).toThrow(
      InvalidSettings,
    );
  });

  it("names the anchor field when it rejects an anchor", () => {
    try {
      colourOf(on("2026-01-05"), { isoWeek: "2025-W53", colour: "RED" });
      expect.unreachable("a non-existent ISO week must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidSettings);
      expect((error as InvalidSettings).field).toBe("weekAnchor.isoWeek");
    }
  });
});

describe("isoWeekOf", () => {
  it("formats the week with a leading zero", () => {
    expect(isoWeekOf(on("2026-01-05"))).toBe("2026-W02");
  });

  it("puts 1 January 2023 in week 52 of the previous ISO year", () => {
    expect(isoWeekOf(on("2023-01-01"))).toBe("2022-W52");
  });

  it("puts 1 January 2026 in the first week of 2026, which starts in December 2025", () => {
    expect(isoWeekOf(on("2025-12-29"))).toBe("2026-W01");
    expect(isoWeekOf(on("2026-01-01"))).toBe("2026-W01");
  });

  it("reports the 53rd week of a 53-week year", () => {
    expect(isoWeekOf(on("2026-12-28"))).toBe("2026-W53");
    expect(isoWeekOf(on("2027-01-03"))).toBe("2026-W53");
  });

  it("round-trips: the anchor week of a date is the week that date's colour is anchored to", () => {
    const date = on("2026-07-23");
    expect(colourOf(date, { isoWeek: isoWeekOf(date), colour: "BLUE" })).toBe("BLUE");
  });
});
