import { describe, expect, it } from "vitest";
import { NoSettingsInForce } from "@/domain/errors";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type { Clock, SettingsRepository } from "../ports";
import { getWeekColour } from "./get-week-colour";

/** Hand-written fakes, per the testing standard — no mocking library. */

class FakeSettingsRepository implements SettingsRepository {
  readonly versions: SettingsVersion[] = [];

  constructor(...versions: SettingsVersion[]) {
    this.versions.push(...versions);
  }

  listVersions(): Promise<SettingsVersion[]> {
    return Promise.resolve([...this.versions]);
  }

  append(version: SettingsVersion): Promise<void> {
    this.versions.push(version);
    return Promise.resolve();
  }
}

function fakeClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

function settingsInput(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return {
    quotaN: 240,
    portionsPerGrownUp: 2,
    portionsPerChild: 1,
    // 2026-W02 is 5–11 January 2026; Thursday of that week is 8 January 2026.
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 4,
    pricePerGrownUp: 200,
    pricePerChild: 100,
    ...overrides,
  };
}

function version(recordedAt: string, overrides: Partial<SettingsInput> = {}): SettingsVersion {
  return {
    recordedAt: new Date(recordedAt),
    settings: createSettings(settingsInput(overrides)),
  };
}

function deps(clockIso: string, ...versions: SettingsVersion[]) {
  return {
    settings: new FakeSettingsRepository(...versions),
    clock: fakeClock(clockIso),
  };
}

describe("getWeekColour", () => {
  it("answers for the clock's today when no date is given", async () => {
    // Thursday 8 January 2026 is the anchor week itself, so it carries the anchor colour.
    const week = await getWeekColour(
      deps("2026-01-08T09:30:00.000Z", version("2026-01-01T00:00:00.000Z")),
    );

    expect(week.colour).toBe("RED");
    expect(week.isoWeek).toBe("2026-W02");
  });

  it("answers for the date it is given rather than for today", async () => {
    const week = await getWeekColour(
      deps("2026-01-08T09:30:00.000Z", version("2026-01-01T00:00:00.000Z")),
      new Date("2026-01-15T09:30:00.000Z"),
    );

    expect(week.colour).toBe("BLUE");
    expect(week.isoWeek).toBe("2026-W03");
  });

  it("reports the looked-up day as the UTC day that starts it", async () => {
    const week = await getWeekColour(
      deps("2026-01-08T22:45:00.000Z", version("2026-01-01T00:00:00.000Z")),
    );

    expect(week.date).toEqual(new Date("2026-01-08T00:00:00.000Z"));
  });

  it("uses the anchor in force on the looked-up date, not the current one", async () => {
    const versions = [
      version("2026-01-01T00:00:00.000Z", { weekAnchor: { isoWeek: "2026-W02", colour: "RED" } }),
      version("2026-06-01T00:00:00.000Z", { weekAnchor: { isoWeek: "2026-W02", colour: "BLUE" } }),
    ];

    const past = await getWeekColour(
      deps("2026-07-23T09:00:00.000Z", ...versions),
      new Date("2026-01-08T09:00:00.000Z"),
    );
    const today = await getWeekColour(deps("2026-07-23T09:00:00.000Z", ...versions));

    // Both dates fall in an even number of weeks from the anchor, so they differ only by the anchor
    // colour that was in force when each was looked up.
    expect(past.colour).toBe("RED");
    expect(today.colour).toBe("BLUE");
  });

  it("reads the distribution weekday in force on the looked-up date too", async () => {
    const week = await getWeekColour(
      deps(
        "2026-07-23T09:00:00.000Z",
        version("2026-01-01T00:00:00.000Z", { distributionWeekday: 4 }),
        version("2026-06-01T00:00:00.000Z", { distributionWeekday: 2 }),
      ),
      // Thursday 8 January 2026 — a distribution day under the version in force back then.
      new Date("2026-01-08T09:00:00.000Z"),
    );

    expect(week.isDistributionDay).toBe(true);
  });

  it("reports a distribution day as such and points at itself", async () => {
    // Thursday 23 July 2026 is the configured distribution weekday.
    const week = await getWeekColour(
      deps("2026-07-23T09:00:00.000Z", version("2026-01-01T00:00:00.000Z")),
    );

    expect(week.isDistributionDay).toBe(true);
    expect(week.nextDistribution.date).toEqual(new Date("2026-07-23T00:00:00.000Z"));
  });

  it("names the next distribution and its colour on a day that is not one", async () => {
    // Friday 24 July 2026 — the next Thursday is 30 July, which is the following week.
    const week = await getWeekColour(
      deps("2026-07-24T09:00:00.000Z", version("2026-01-01T00:00:00.000Z")),
    );

    expect(week.isDistributionDay).toBe(false);
    expect(week.nextDistribution.date).toEqual(new Date("2026-07-30T00:00:00.000Z"));
    expect(week.nextDistribution.colour).toBe(week.colour === "RED" ? "BLUE" : "RED");
  });

  it("throws when no settings had been recorded by the looked-up date", async () => {
    await expect(
      getWeekColour(
        deps("2026-07-23T09:00:00.000Z", version("2026-06-01T00:00:00.000Z")),
        new Date("2026-01-08T09:00:00.000Z"),
      ),
    ).rejects.toThrow(NoSettingsInForce);
  });
});
