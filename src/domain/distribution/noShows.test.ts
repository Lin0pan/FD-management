import { describe, expect, it } from "vitest";
import type { Group } from "../customer/group";
import { createSettings, type Settings } from "../policy/settings";
import { consecutiveNoShows } from "./noShows";

function on(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Distribution on Thursdays, anchored on the RED week `2026-W02` (Monday 5 January 2026). */
const THURSDAYS: Settings = createSettings({
  quotaN: 3,
  portionsPerGrownUp: 2,
  portionsPerChild: 1,
  weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
  distributionWeekday: 4,
  pricePerGrownUp: 200,
  pricePerChild: 100,
  priceCap: null,
});

/**
 * The Thursdays of early 2026 and the colour of the week each falls in, for reading the cases below:
 *
 * | Thursday   | ISO week | colour |
 * | ---------- | -------- | ------ |
 * | 2026-01-01 | 2026-W01 | BLUE   |
 * | 2026-01-08 | 2026-W02 | RED    |
 * | 2026-01-15 | 2026-W03 | BLUE   |
 * | 2026-01-22 | 2026-W04 | RED    |
 * | 2026-01-29 | 2026-W05 | BLUE   |
 * | 2026-02-05 | 2026-W06 | RED    |
 * | 2026-02-12 | 2026-W07 | BLUE   |
 * | 2026-02-19 | 2026-W08 | RED    |
 * | 2026-02-26 | 2026-W09 | BLUE   |
 * | 2026-03-05 | 2026-W10 | RED    |
 */
function count(options: {
  attendedOn?: ReadonlyArray<string | Date>;
  group?: Group;
  registeredOn: string;
  today: string | Date;
}): number {
  return consecutiveNoShows({
    records: (options.attendedOn ?? []).map((day) => ({
      date: typeof day === "string" ? on(day) : day,
    })),
    customerGroup: options.group ?? "RED",
    registeredOn: on(options.registeredOn),
    settings: THURSDAYS,
    today: typeof options.today === "string" ? on(options.today) : options.today,
  });
}

describe("consecutiveNoShows", () => {
  it("counts nothing for a customer who has never attended and has seen no own distribution", () => {
    // Registered on the Tuesday of their own RED week: the previous RED Thursday predates them.
    expect(count({ registeredOn: "2026-02-17", today: "2026-02-19" })).toBe(0);
  });

  it("counts nothing when the customer attended their last own distribution", () => {
    expect(
      count({ attendedOn: ["2026-02-05"], registeredOn: "2026-01-01", today: "2026-02-19" }),
    ).toBe(0);
  });

  it("counts one when the customer missed the last own distribution", () => {
    expect(
      count({ attendedOn: ["2026-01-22"], registeredOn: "2026-01-01", today: "2026-02-19" }),
    ).toBe(1);
  });

  it("counts three when the customer missed the last three own distributions", () => {
    // Attended 8 January, then missed 22 January, 5 February and 19 February.
    expect(
      count({ attendedOn: ["2026-01-08"], registeredOn: "2026-01-01", today: "2026-03-05" }),
    ).toBe(3);
  });

  it("counts every own distribution as missed when the customer has never attended", () => {
    // Registered before the RED Thursdays 8 and 22 January and 5 February; today's is in progress.
    expect(count({ registeredOn: "2026-01-01", today: "2026-02-19" })).toBe(3);
  });

  it("stops counting at the most recent attendance, not at the longest gap behind it", () => {
    expect(
      count({
        // Deliberately unsorted: the rule reads calendar days, not array order.
        attendedOn: ["2026-01-08", "2026-02-05"],
        registeredOn: "2025-01-01",
        today: "2026-03-05",
      }),
    ).toBe(1);
  });

  it("does not count the other group's weeks as misses", () => {
    // Today is a BLUE Thursday; the RED customer's last own day, 5 February, was attended.
    expect(
      count({ attendedOn: ["2026-02-05"], registeredOn: "2026-01-01", today: "2026-02-12" }),
    ).toBe(0);
  });

  it("does not count today's distribution, which may still be in progress", () => {
    // Attended 5 February, nothing recorded yet on the RED Thursday 19 February.
    expect(
      count({ attendedOn: ["2026-02-05"], registeredOn: "2026-01-01", today: "2026-02-19" }),
    ).toBe(0);
  });

  it("counts a day the customer attended before the distribution weekday came round again", () => {
    // The Saturday after a distribution: the RED Thursday 19 February is now behind us and was missed.
    expect(
      count({ attendedOn: ["2026-02-05"], registeredOn: "2026-01-01", today: "2026-02-21" }),
    ).toBe(1);
  });

  it("counts no miss for an own distribution before the customer registered", () => {
    // Registered 4 February: 5 February was theirs to attend, 22 January was not.
    expect(count({ registeredOn: "2026-02-04", today: "2026-02-19" })).toBe(1);
  });

  it("does not count the distribution day the customer registered on", () => {
    // The card is handed over at registration and whether that day's hand-out had already finished is
    // nowhere on record, so the day itself is never held against the household.
    expect(count({ registeredOn: "2026-02-05", today: "2026-02-19" })).toBe(0);
  });

  it("counts on the current group's schedule after a group change", () => {
    // Moved to BLUE; the attendance behind the move sits on RED Thursdays, which are no longer theirs.
    // Missed the BLUE Thursdays 15 and 29 January, 12 and 26 February.
    expect(
      count({
        attendedOn: ["2026-01-22", "2026-02-05"],
        group: "BLUE",
        registeredOn: "2026-01-01",
        today: "2026-03-05",
      }),
    ).toBe(4);
  });

  it("counts a distribution the customer was blocked for", () => {
    // The documented decision (PRD §US-10.1, §9): a block is DF's own pause, but excluding it would
    // hide the very pattern the count exists to show, and no block history is an input here. A
    // customer blocked across 22 January and 5 February is counted for both.
    expect(
      count({ attendedOn: ["2026-01-08"], registeredOn: "2026-01-01", today: "2026-02-19" }),
    ).toBe(2);
  });

  it("matches an attendance recorded late in the Berlin evening to its own distribution day", () => {
    // 23:45 in Berlin on the RED Thursday 5 February — still that day, so nothing is missed.
    expect(
      count({
        attendedOn: [new Date("2026-02-05T22:45:00.000Z")],
        registeredOn: "2026-01-01",
        today: "2026-02-07",
      }),
    ).toBe(0);
  });

  it("does not match an attendance recorded after Berlin midnight to the distribution day before", () => {
    // 00:30 in Berlin on 6 February: the domain's day key says the 6th, so the 5th was a no-show.
    expect(
      count({
        attendedOn: [new Date("2026-02-05T23:30:00.000Z")],
        registeredOn: "2026-02-04",
        today: "2026-02-07",
      }),
    ).toBe(1);
  });

  it("steps back over 29 February without drifting a day", () => {
    // 2028 is a leap year: the RED Thursday before 2 March is 17 February, fourteen days earlier
    // across a 29-day February.
    expect(
      count({ attendedOn: ["2028-02-17"], registeredOn: "2028-01-01", today: "2028-03-02" }),
    ).toBe(0);
  });

  it("ignores the time of day of today", () => {
    expect(
      count({
        attendedOn: ["2026-02-05"],
        registeredOn: "2026-01-01",
        today: new Date("2026-02-19T22:45:00.000Z"),
      }),
    ).toBe(0);
  });
});
