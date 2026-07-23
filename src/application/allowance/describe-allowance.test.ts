import { describe, expect, it } from "vitest";
import type { HouseholdMember } from "@/domain/customer/householdComposition";
import { NoSettingsInForce } from "@/domain/errors";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type { Clock, SettingsRepository } from "../ports";
import { describeAllowance } from "./describe-allowance";

/**
 * Hand-written fakes, per the testing standard — the application layer is tested against its ports,
 * never against a mocking library.
 */

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

function member(birthDate: string): HouseholdMember {
  return { birthDate: new Date(birthDate) };
}

describe("describeAllowance", () => {
  it("returns counts, portions and price for a household at the clock's today", async () => {
    const repository = new FakeSettingsRepository(version("2026-01-01T00:00:00.000Z"));

    const allowance = await describeAllowance(
      { settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") },
      [member("1980-05-01"), member("1982-06-01"), member("2020-03-01")],
    );

    expect(allowance).toEqual({
      grownUps: 2,
      children: 1,
      // 2 * portionsPerGrownUp(2) + 1 * portionsPerChild(1)
      portions: 5,
      // 2 * pricePerGrownUp(200) + 1 * pricePerChild(100)
      priceCents: 500,
    });
  });

  it("prices a single-person household from the per-head values, never a stored column", async () => {
    const repository = new FakeSettingsRepository(
      version("2026-01-01T00:00:00.000Z", { pricePerGrownUp: 250, portionsPerGrownUp: 3 }),
    );

    const allowance = await describeAllowance(
      { settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") },
      [member("1980-05-01")],
    );

    expect(allowance).toEqual({ grownUps: 1, children: 0, portions: 3, priceCents: 250 });
  });

  it("prices a household with the settings version in force on the evaluated date, not today", async () => {
    const repository = new FakeSettingsRepository(
      version("2026-01-01T00:00:00.000Z", { pricePerGrownUp: 200, pricePerChild: 100 }),
      version("2026-06-01T00:00:00.000Z", { pricePerGrownUp: 250, pricePerChild: 150 }),
    );

    const onOldVersion = await describeAllowance(
      { settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") },
      [member("1980-05-01"), member("1982-06-01"), member("2020-03-01")],
      new Date("2026-03-01T00:00:00.000Z"),
    );

    // The older version (200/100) was in force in March, so the March distribution is priced with it
    // even though a newer version applies today: 2 * 200 + 1 * 100.
    expect(onOldVersion.priceCents).toBe(500);
  });

  it("derives the counts as of the evaluated date, so a birthday changes the allowance", async () => {
    const repository = new FakeSettingsRepository(version("2013-01-01T00:00:00.000Z"));
    const deps = { settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") };
    const household = [member("2013-03-01")];

    const dayBefore = await describeAllowance(
      deps,
      household,
      new Date("2026-02-28T00:00:00.000Z"),
    );
    const onBirthday = await describeAllowance(
      deps,
      household,
      new Date("2026-03-01T00:00:00.000Z"),
    );

    expect(dayBefore).toMatchObject({ grownUps: 0, children: 1, portions: 1, priceCents: 100 });
    expect(onBirthday).toMatchObject({ grownUps: 1, children: 0, portions: 2, priceCents: 200 });
  });

  it("throws when no settings version had taken effect by the evaluated date", async () => {
    const repository = new FakeSettingsRepository(version("2026-08-01T00:00:00.000Z"));

    await expect(
      describeAllowance({ settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") }, [
        member("1980-05-01"),
      ]),
    ).rejects.toThrow(NoSettingsInForce);
  });
});
