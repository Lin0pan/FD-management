import { describe, expect, it } from "vitest";
import { InvalidSettings, NoPriceForHousehold, NoSettingsInForce } from "../errors";
import {
  changedSettingsFields,
  createSettings,
  parseWeekColour,
  priceFor,
  resolveSettingsAt,
  type SettingsInput,
  type SettingsVersion,
} from "./settings";

/** A valid baseline; each test overrides only the field whose rule it is about. */
function settingsInput(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return {
    quotaN: 240,
    portionsPerGrownUp: 2,
    portionsPerChild: 1,
    reminderThreshold: 3,
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 4,
    priceTable: [
      { grownUps: 1, children: 0, cents: 200 },
      { grownUps: 2, children: 1, cents: 500 },
    ],
    ...overrides,
  };
}

function version(effectiveFrom: string, overrides: Partial<SettingsInput> = {}): SettingsVersion {
  return {
    effectiveFrom: new Date(effectiveFrom),
    settings: createSettings(settingsInput(overrides)),
  };
}

describe("createSettings", () => {
  it("keeps the values it was given", () => {
    const settings = createSettings(settingsInput());
    expect(settings.quotaN).toBe(240);
    expect(settings.portionsPerGrownUp).toBe(2);
    expect(settings.portionsPerChild).toBe(1);
    expect(settings.reminderThreshold).toBe(3);
    expect(settings.weekAnchor).toEqual({ isoWeek: "2026-W02", colour: "RED" });
    expect(settings.distributionWeekday).toBe(4);
    expect(settings.priceTable).toHaveLength(2);
  });

  it("accepts a quota of exactly one", () => {
    expect(createSettings(settingsInput({ quotaN: 1 })).quotaN).toBe(1);
  });

  it("rejects a quota below one", () => {
    expect(() => createSettings(settingsInput({ quotaN: 0 }))).toThrow(InvalidSettings);
  });

  it("rejects a non-integer quota", () => {
    expect(() => createSettings(settingsInput({ quotaN: 1.5 }))).toThrow(InvalidSettings);
  });

  it("accepts zero portions per grown-up", () => {
    expect(createSettings(settingsInput({ portionsPerGrownUp: 0 })).portionsPerGrownUp).toBe(0);
  });

  it("rejects negative portions per grown-up", () => {
    expect(() => createSettings(settingsInput({ portionsPerGrownUp: -1 }))).toThrow(
      InvalidSettings,
    );
  });

  it("rejects negative portions per child", () => {
    expect(() => createSettings(settingsInput({ portionsPerChild: -1 }))).toThrow(InvalidSettings);
  });

  it("rejects a reminder threshold below one", () => {
    expect(() => createSettings(settingsInput({ reminderThreshold: 0 }))).toThrow(InvalidSettings);
  });

  it("accepts Monday and Sunday as distribution weekdays", () => {
    expect(createSettings(settingsInput({ distributionWeekday: 1 })).distributionWeekday).toBe(1);
    expect(createSettings(settingsInput({ distributionWeekday: 7 })).distributionWeekday).toBe(7);
  });

  it("rejects a distribution weekday outside ISO 1-7", () => {
    expect(() => createSettings(settingsInput({ distributionWeekday: 0 }))).toThrow(
      InvalidSettings,
    );
    expect(() => createSettings(settingsInput({ distributionWeekday: 8 }))).toThrow(
      InvalidSettings,
    );
  });

  it("rejects a fractional distribution weekday", () => {
    expect(() => createSettings(settingsInput({ distributionWeekday: 3.5 }))).toThrow(
      InvalidSettings,
    );
  });

  it("rejects a week anchor that is not an ISO week", () => {
    expect(() =>
      createSettings(settingsInput({ weekAnchor: { isoWeek: "2026-02", colour: "RED" } })),
    ).toThrow(InvalidSettings);
  });

  it("rejects an ISO week number above 53", () => {
    expect(() =>
      createSettings(settingsInput({ weekAnchor: { isoWeek: "2026-W54", colour: "BLUE" } })),
    ).toThrow(InvalidSettings);
  });

  it("rejects ISO week zero", () => {
    expect(() =>
      createSettings(settingsInput({ weekAnchor: { isoWeek: "2026-W00", colour: "BLUE" } })),
    ).toThrow(InvalidSettings);
  });

  it("rejects an empty price table", () => {
    expect(() => createSettings(settingsInput({ priceTable: [] }))).toThrow(InvalidSettings);
  });

  it("rejects a fractional price", () => {
    expect(() =>
      createSettings(settingsInput({ priceTable: [{ grownUps: 1, children: 0, cents: 200.5 }] })),
    ).toThrow(InvalidSettings);
  });

  it("rejects a negative price", () => {
    expect(() =>
      createSettings(settingsInput({ priceTable: [{ grownUps: 1, children: 0, cents: -1 }] })),
    ).toThrow(InvalidSettings);
  });

  it("accepts a free household", () => {
    const settings = createSettings(
      settingsInput({ priceTable: [{ grownUps: 1, children: 0, cents: 0 }] }),
    );
    expect(priceFor(settings, 1, 0)).toBe(0);
  });

  it("rejects a negative household size in the price table", () => {
    expect(() =>
      createSettings(settingsInput({ priceTable: [{ grownUps: -1, children: 0, cents: 200 }] })),
    ).toThrow(InvalidSettings);
    expect(() =>
      createSettings(settingsInput({ priceTable: [{ grownUps: 1, children: -1, cents: 200 }] })),
    ).toThrow(InvalidSettings);
  });

  it("rejects two price rows for the same household size", () => {
    expect(() =>
      createSettings(
        settingsInput({
          priceTable: [
            { grownUps: 1, children: 0, cents: 200 },
            { grownUps: 1, children: 0, cents: 300 },
          ],
        }),
      ),
    ).toThrow(InvalidSettings);
  });

  it("names the offending field in the error", () => {
    expect(() => createSettings(settingsInput({ quotaN: 0 }))).toThrow(/quotaN/);
  });
});

describe("resolveSettingsAt", () => {
  const versions: readonly SettingsVersion[] = [
    version("2026-01-01T00:00:00.000Z", { quotaN: 200 }),
    version("2026-06-01T00:00:00.000Z", { quotaN: 240 }),
  ];

  it("returns the version effective on that very day", () => {
    expect(resolveSettingsAt(versions, new Date("2026-06-01T00:00:00.000Z")).quotaN).toBe(240);
  });

  it("returns the earlier version the day before the later one starts", () => {
    expect(resolveSettingsAt(versions, new Date("2026-05-31T23:59:59.999Z")).quotaN).toBe(200);
  });

  it("returns the latest version for a date after all of them", () => {
    expect(resolveSettingsAt(versions, new Date("2030-01-01T00:00:00.000Z")).quotaN).toBe(240);
  });

  it("resolves regardless of the order the versions arrive in", () => {
    const shuffled = [versions[1], versions[0]];
    expect(resolveSettingsAt(shuffled, new Date("2026-03-01T00:00:00.000Z")).quotaN).toBe(200);
  });

  it("throws rather than returning a partial object before the earliest version", () => {
    expect(() => resolveSettingsAt(versions, new Date("2025-12-31T23:59:59.999Z"))).toThrow(
      NoSettingsInForce,
    );
  });

  it("throws when there is no version at all", () => {
    expect(() => resolveSettingsAt([], new Date("2026-06-01T00:00:00.000Z"))).toThrow(
      NoSettingsInForce,
    );
  });
});

describe("priceFor", () => {
  const settings = createSettings(settingsInput());

  it("returns the cents of the exactly matching row", () => {
    expect(priceFor(settings, 2, 1)).toBe(500);
  });

  it("throws for a household with no row instead of interpolating", () => {
    expect(() => priceFor(settings, 3, 0)).toThrow(NoPriceForHousehold);
  });

  it("names both counts in the error", () => {
    expect(() => priceFor(settings, 3, 2)).toThrow(/3.*2/);
  });
});

describe("changedSettingsFields", () => {
  const previous = createSettings(settingsInput());

  it("reports nothing changed between two identical versions", () => {
    expect(changedSettingsFields(previous, createSettings(settingsInput()))).toEqual([]);
  });

  it("reports every field when there is no previous version", () => {
    expect(changedSettingsFields(undefined, previous)).toEqual([
      "quotaN",
      "portionsPerGrownUp",
      "portionsPerChild",
      "reminderThreshold",
      "weekAnchor",
      "distributionWeekday",
      "priceTable",
    ]);
  });

  it.each([
    ["quotaN", { quotaN: 200 }],
    ["portionsPerGrownUp", { portionsPerGrownUp: 3 }],
    ["portionsPerChild", { portionsPerChild: 2 }],
    ["reminderThreshold", { reminderThreshold: 4 }],
    ["distributionWeekday", { distributionWeekday: 5 }],
  ])("reports %s when only that value differs", (field, overrides) => {
    const next = createSettings(settingsInput(overrides));
    expect(changedSettingsFields(previous, next)).toEqual([field]);
  });

  it("reports weekAnchor when the anchor week moves", () => {
    const next = createSettings(
      settingsInput({ weekAnchor: { isoWeek: "2026-W03", colour: "RED" } }),
    );
    expect(changedSettingsFields(previous, next)).toEqual(["weekAnchor"]);
  });

  it("reports weekAnchor when only the anchor colour flips", () => {
    const next = createSettings(
      settingsInput({ weekAnchor: { isoWeek: "2026-W02", colour: "BLUE" } }),
    );
    expect(changedSettingsFields(previous, next)).toEqual(["weekAnchor"]);
  });

  it("reports priceTable when a price changes", () => {
    const next = createSettings(
      settingsInput({
        priceTable: [
          { grownUps: 1, children: 0, cents: 250 },
          { grownUps: 2, children: 1, cents: 500 },
        ],
      }),
    );
    expect(changedSettingsFields(previous, next)).toEqual(["priceTable"]);
  });

  it("reports priceTable when a household row is added", () => {
    const next = createSettings(
      settingsInput({
        priceTable: [
          { grownUps: 1, children: 0, cents: 200 },
          { grownUps: 2, children: 1, cents: 500 },
          { grownUps: 3, children: 0, cents: 700 },
        ],
      }),
    );
    expect(changedSettingsFields(previous, next)).toEqual(["priceTable"]);
  });

  it("reports priceTable when a household row is replaced by another of the same size", () => {
    const next = createSettings(
      settingsInput({
        priceTable: [
          { grownUps: 1, children: 0, cents: 200 },
          { grownUps: 2, children: 2, cents: 500 },
        ],
      }),
    );
    expect(changedSettingsFields(previous, next)).toEqual(["priceTable"]);
  });

  it("ignores the order of price rows", () => {
    const next = createSettings(
      settingsInput({
        priceTable: [
          { grownUps: 2, children: 1, cents: 500 },
          { grownUps: 1, children: 0, cents: 200 },
        ],
      }),
    );
    expect(changedSettingsFields(previous, next)).toEqual([]);
  });

  it("lists several fields in declaration order when more than one changed", () => {
    const next = createSettings(settingsInput({ quotaN: 200, reminderThreshold: 4 }));
    expect(changedSettingsFields(previous, next)).toEqual(["quotaN", "reminderThreshold"]);
  });
});

describe("parseWeekColour", () => {
  it("accepts the two colours of the cycle", () => {
    expect(parseWeekColour("RED")).toBe("RED");
    expect(parseWeekColour("BLUE")).toBe("BLUE");
  });

  it("rejects anything else, so a stored value can never widen the cycle", () => {
    expect(() => parseWeekColour("GREEN")).toThrow(InvalidSettings);
  });

  it("is case-sensitive — the stored form is upper case", () => {
    expect(() => parseWeekColour("red")).toThrow(InvalidSettings);
  });
});
