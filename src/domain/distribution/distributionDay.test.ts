import { describe, expect, it } from "vitest";
import { createSettings, type IsoWeekday, type Settings } from "../policy/settings";
import { isDistributionDay, nextDistribution } from "./distributionDay";

function on(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Distribution on Thursdays, anchored on the RED week `2026-W02` (Monday 5 January 2026). */
function settings(distributionWeekday: IsoWeekday): Settings {
  return createSettings({
    quotaN: 3,
    portionsPerGrownUp: 2,
    portionsPerChild: 1,
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday,
    pricePerGrownUp: 200,
    pricePerChild: 100,
  });
}

const THURSDAYS = settings(4);
const SUNDAYS = settings(7);

describe("isDistributionDay", () => {
  it("is true on the configured weekday", () => {
    expect(isDistributionDay(on("2026-07-23"), 4)).toBe(true); // a Thursday
  });

  it("is false on the day before the configured weekday", () => {
    expect(isDistributionDay(on("2026-07-22"), 4)).toBe(false);
  });

  it("is false on the day after the configured weekday", () => {
    expect(isDistributionDay(on("2026-07-24"), 4)).toBe(false);
  });

  it("recognises Sunday, the weekday ISO numbers last", () => {
    expect(isDistributionDay(on("2026-07-26"), 7)).toBe(true); // a Sunday
    expect(isDistributionDay(on("2026-07-20"), 7)).toBe(false); // the Monday after
  });

  it("ignores the time of day", () => {
    expect(isDistributionDay(new Date("2026-07-23T22:45:00.000Z"), 4)).toBe(true);
  });
});

describe("nextDistribution", () => {
  it("returns today on a distribution day, not next week", () => {
    expect(nextDistribution(on("2026-07-23"), THURSDAYS).date).toEqual(on("2026-07-23"));
  });

  it("returns tomorrow on the day before a distribution day", () => {
    expect(nextDistribution(on("2026-07-22"), THURSDAYS).date).toEqual(on("2026-07-23"));
  });

  it("returns the following week on the day after a distribution day", () => {
    expect(nextDistribution(on("2026-07-24"), THURSDAYS).date).toEqual(on("2026-07-30"));
  });

  it("normalises the time of day away, so the answer is a calendar day", () => {
    expect(nextDistribution(new Date("2026-07-23T22:45:00.000Z"), THURSDAYS).date).toEqual(
      on("2026-07-23"),
    );
  });

  it("finds the next Sunday when Sunday is the configured weekday", () => {
    expect(nextDistribution(on("2026-07-20"), SUNDAYS).date).toEqual(on("2026-07-26"));
  });

  it("reports the colour of the week the next distribution falls in", () => {
    // 2026-W30 (20–26 July) is RED: it is 28 weeks after the RED anchor 2026-W02.
    expect(nextDistribution(on("2026-07-23"), THURSDAYS).colour).toBe("RED");
  });

  it("reports the next week's colour once this week's distribution has passed", () => {
    // Friday of the RED week 2026-W30 — the next distribution is in the BLUE week 2026-W31.
    expect(nextDistribution(on("2026-07-24"), THURSDAYS)).toEqual({
      date: on("2026-07-30"),
      colour: "BLUE",
    });
  });

  it("answers for a date before the anchor week as readily as after it", () => {
    // Thursday 25 December 2025 is in 2025-W52, two weeks before the RED anchor: RED again.
    expect(nextDistribution(on("2025-12-24"), THURSDAYS)).toEqual({
      date: on("2025-12-25"),
      colour: "RED",
    });
  });
});
