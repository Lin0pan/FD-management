import { describe, expect, it } from "vitest";
import { InvalidSettings, NoSettingsInForce } from "../errors";
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

describe("createSettings", () => {
  it("keeps the values it was given", () => {
    const settings = createSettings(settingsInput());
    expect(settings.quotaN).toBe(240);
    expect(settings.portionsPerGrownUp).toBe(2);
    expect(settings.portionsPerChild).toBe(1);
    expect(settings.weekAnchor).toEqual({ isoWeek: "2026-W02", colour: "RED" });
    expect(settings.distributionWeekday).toBe(4);
    expect(settings.pricePerGrownUp).toBe(200);
    expect(settings.pricePerChild).toBe(100);
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

  it("rejects a fractional price per grown-up", () => {
    expect(() => createSettings(settingsInput({ pricePerGrownUp: 200.5 }))).toThrow(
      InvalidSettings,
    );
  });

  it("rejects a fractional price per child", () => {
    expect(() => createSettings(settingsInput({ pricePerChild: 100.5 }))).toThrow(InvalidSettings);
  });

  it("rejects a negative price per grown-up", () => {
    expect(() => createSettings(settingsInput({ pricePerGrownUp: -1 }))).toThrow(InvalidSettings);
  });

  it("rejects a negative price per child", () => {
    expect(() => createSettings(settingsInput({ pricePerChild: -1 }))).toThrow(InvalidSettings);
  });

  it("accepts free food — a price per head of zero", () => {
    const settings = createSettings(settingsInput({ pricePerGrownUp: 0, pricePerChild: 0 }));
    expect(priceFor(settings, 2, 3)).toBe(0);
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

  it("is in force from the very instant it was recorded", () => {
    expect(resolveSettingsAt(versions, new Date("2026-06-01T00:00:00.000Z")).quotaN).toBe(240);
  });

  it("returns the earlier version a millisecond before the later one was recorded", () => {
    expect(resolveSettingsAt(versions, new Date("2026-05-31T23:59:59.999Z")).quotaN).toBe(200);
  });

  it("returns the latest version for a date after all of them", () => {
    expect(resolveSettingsAt(versions, new Date("2030-01-01T00:00:00.000Z")).quotaN).toBe(240);
  });

  it("resolves regardless of the order the versions arrive in", () => {
    const shuffled = [versions[1], versions[0]];
    expect(resolveSettingsAt(shuffled, new Date("2026-03-01T00:00:00.000Z")).quotaN).toBe(200);
  });

  it("prefers the later of two versions recorded in the same instant", () => {
    const sameInstant = [
      version("2026-06-01T00:00:00.000Z", { quotaN: 240 }),
      version("2026-06-01T00:00:00.000Z", { quotaN: 250 }),
    ];

    expect(resolveSettingsAt(sameInstant, new Date("2026-06-02T00:00:00.000Z")).quotaN).toBe(250);
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

  it("charges each grown-up the grown-up price and each child the child price", () => {
    expect(priceFor(settings, 2, 1)).toBe(500);
  });

  it("charges a single-person household exactly one grown-up price", () => {
    expect(priceFor(settings, 1, 0)).toBe(200);
  });

  it("prices any household size — there is no unpriced composition", () => {
    expect(priceFor(settings, 9, 7)).toBe(2500);
  });

  it("charges nothing for a household of nobody", () => {
    expect(priceFor(settings, 0, 0)).toBe(0);
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
      "weekAnchor",
      "distributionWeekday",
      "pricePerGrownUp",
      "pricePerChild",
    ]);
  });

  it.each([
    ["quotaN", { quotaN: 200 }],
    ["portionsPerGrownUp", { portionsPerGrownUp: 3 }],
    ["portionsPerChild", { portionsPerChild: 2 }],
    ["distributionWeekday", { distributionWeekday: 5 }],
    ["pricePerGrownUp", { pricePerGrownUp: 250 }],
    ["pricePerChild", { pricePerChild: 125 }],
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

  it("reports both price fields when a price rise touches each head", () => {
    const next = createSettings(settingsInput({ pricePerGrownUp: 250, pricePerChild: 125 }));
    expect(changedSettingsFields(previous, next)).toEqual(["pricePerGrownUp", "pricePerChild"]);
  });

  it("lists several fields in declaration order when more than one changed", () => {
    const next = createSettings(settingsInput({ quotaN: 200, portionsPerChild: 2 }));
    expect(changedSettingsFields(previous, next)).toEqual(["quotaN", "portionsPerChild"]);
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
