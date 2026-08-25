import { describe, expect, it } from "vitest";
import type { HouseholdMember } from "@/domain/customer/householdComposition";
import { NoSettingsInForce } from "@/domain/errors";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type { Clock, SettingsRepository } from "../ports";
import { describeAllowance, describeAllowances } from "./describe-allowance";

/**
 * Hand-written fakes, per the testing standard — the application layer is tested against its ports,
 * never against a mocking library.
 */

class FakeSettingsRepository implements SettingsRepository {
  readonly versions: SettingsVersion[] = [];
  /** How often the history has been read — the many-households entry point must read it once. */
  reads = 0;

  constructor(...versions: SettingsVersion[]) {
    this.versions.push(...versions);
  }

  listVersions(): Promise<SettingsVersion[]> {
    this.reads += 1;
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
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 4,
    pricePerGrownUp: 200,
    pricePerChild: 100,
    priceCap: null,
    eggRule: [],
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
  /**
   * DF's rule as it stands today (US-28): 8+ persons 18 eggs, 5-7 twelve, 3-4 six, 1-2 none. Written
   * out in the order `createEggRule` sorts to, since that is the order every reader sees.
   */
  const DF_RULE = [
    { minPersons: 3, eggs: 6 },
    { minPersons: 5, eggs: 12 },
    { minPersons: 8, eggs: 18 },
  ];

  it("returns the counts and the price for a household at the clock's today", async () => {
    const repository = new FakeSettingsRepository(version("2026-01-01T00:00:00.000Z"));

    const allowance = await describeAllowance(
      { settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") },
      [member("1980-05-01"), member("1982-06-01"), member("2020-03-01")],
    );

    expect(allowance).toEqual({
      grownUps: 2,
      children: 1,
      // 2 * pricePerGrownUp(200) + 1 * pricePerChild(100)
      priceCents: 500,
      // The default rule is empty, which is a legitimate setting: no eggs for anyone.
      eggs: 0,
    });
  });

  it("prices a single-person household from the per-head values, never a stored column", async () => {
    const repository = new FakeSettingsRepository(
      version("2026-01-01T00:00:00.000Z", { pricePerGrownUp: 250 }),
    );

    const allowance = await describeAllowance(
      { settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") },
      [member("1980-05-01")],
    );

    expect(allowance).toEqual({ grownUps: 1, children: 0, priceCents: 250, eggs: 0 });
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

    expect(dayBefore).toMatchObject({ grownUps: 0, children: 1, priceCents: 100 });
    expect(onBirthday).toMatchObject({ grownUps: 1, children: 0, priceCents: 200 });
  });

  it("throws when no settings version had taken effect by the evaluated date", async () => {
    const repository = new FakeSettingsRepository(version("2026-08-01T00:00:00.000Z"));

    await expect(
      describeAllowance({ settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") }, [
        member("1980-05-01"),
      ]),
    ).rejects.toThrow(NoSettingsInForce);
  });
  it("counts every member of the household towards the eggs, whatever their age", async () => {
    const repository = new FakeSettingsRepository(
      version("2026-01-01T00:00:00.000Z", { eggRule: DF_RULE }),
    );

    const allowance = await describeAllowance(
      { settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") },
      // Two grown-ups and an infant: three persons, so six eggs. The infant counts for the eggs
      // even though they count as a child for the price.
      [member("1980-05-01"), member("1982-06-01"), member("2026-03-01")],
    );

    expect(allowance).toMatchObject({ grownUps: 2, children: 1, eggs: 6 });
  });

  it("gives a household that reaches no threshold no eggs, never a blank", async () => {
    const repository = new FakeSettingsRepository(
      version("2026-01-01T00:00:00.000Z", { eggRule: DF_RULE }),
    );

    const allowance = await describeAllowance(
      { settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") },
      [member("1980-05-01"), member("1982-06-01")],
    );

    expect(allowance.eggs).toBe(0);
  });

  it("leaves the eggs unchanged across a member's 13th birthday, while the counts and the price move", async () => {
    const repository = new FakeSettingsRepository(
      version("2013-01-01T00:00:00.000Z", { eggRule: DF_RULE }),
    );
    const deps = { settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") };
    const household = [member("1980-05-01"), member("1982-06-01"), member("2013-03-01")];

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

    // The rule counts heads, so the birthday moves the split and the price and nothing else.
    expect(dayBefore).toMatchObject({ grownUps: 2, children: 1, priceCents: 500, eggs: 6 });
    expect(onBirthday).toMatchObject({ grownUps: 3, children: 0, priceCents: 600, eggs: 6 });
  });

  it("counts the eggs by the rule in force on the evaluated date, not by today's", async () => {
    const repository = new FakeSettingsRepository(
      version("2026-01-01T00:00:00.000Z", { eggRule: [{ minPersons: 3, eggs: 6 }] }),
      version("2026-06-01T00:00:00.000Z", { eggRule: [{ minPersons: 3, eggs: 12 }] }),
    );

    const inMarch = await describeAllowance(
      { settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") },
      [member("1980-05-01"), member("1982-06-01"), member("2020-03-01")],
      new Date("2026-03-01T00:00:00.000Z"),
    );

    expect(inMarch.eggs).toBe(6);
  });
});

describe("describeAllowances", () => {
  it("derives the eggs for every household from one read of the settings history", async () => {
    const repository = new FakeSettingsRepository(
      version("2026-01-01T00:00:00.000Z", {
        eggRule: [
          { minPersons: 3, eggs: 6 },
          { minPersons: 5, eggs: 12 },
        ],
      }),
    );

    const allowances = await describeAllowances(
      { settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") },
      [
        [member("1980-05-01")],
        [member("1980-05-01"), member("1982-06-01"), member("2020-03-01")],
        [
          member("1980-05-01"),
          member("1982-06-01"),
          member("2020-03-01"),
          member("2021-04-01"),
          member("2022-05-01"),
        ],
      ],
      new Date("2026-07-22T09:00:00.000Z"),
    );

    expect(allowances.map((allowance) => allowance.eggs)).toEqual([0, 6, 12]);
    expect(repository.reads).toBe(1);
  });
});
