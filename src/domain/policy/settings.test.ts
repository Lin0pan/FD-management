import { describe, expect, it } from "vitest";
import {
  DuplicateEggThreshold,
  EggsNotIncreasing,
  InvalidSettings,
  NoSettingsInForce,
} from "../errors";
import type { EggRuleRow } from "./eggs";
import {
  changedSettingsFields,
  createSettings,
  parseWeekColour,
  priceFor,
  resolveSettingsAt,
  type SettingsInput,
  type SettingsVersion,
} from "./settings";

/** What DF hand out today, typed in the order the rule is displayed in. */
const DF_EGG_ROWS: ReadonlyArray<EggRuleRow> = [
  { minPersons: 3, eggs: 6 },
  { minPersons: 5, eggs: 12 },
  { minPersons: 8, eggs: 18 },
];

/** A valid baseline; each test overrides only the field whose rule it is about. */
function settingsInput(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return {
    quotaN: 240,
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 4,
    pricePerGrownUp: 200,
    pricePerChild: 100,
    priceCap: null,
    eggRule: DF_EGG_ROWS,
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
    expect(settings.weekAnchor).toEqual({ isoWeek: "2026-W02", colour: "RED" });
    expect(settings.distributionWeekday).toBe(4);
    expect(settings.pricePerGrownUp).toBe(200);
    expect(settings.pricePerChild).toBe(100);
    expect(settings.priceCap).toBeNull();
    expect(settings.eggRule).toEqual(DF_EGG_ROWS);
  });

  it("sorts an egg rule typed out of order", () => {
    // The rule reaches `Settings` through `createEggRule`, so everything downstream — the counter,
    // the history, the form — reads one order whatever order staff typed.
    const settings = createSettings(
      settingsInput({
        eggRule: [
          { minPersons: 8, eggs: 18 },
          { minPersons: 3, eggs: 6 },
          { minPersons: 5, eggs: 12 },
        ],
      }),
    );
    expect(settings.eggRule).toEqual(DF_EGG_ROWS);
  });

  it("accepts an empty egg rule", () => {
    // No rows is a configuration, not a missing value: nobody receives eggs.
    expect(createSettings(settingsInput({ eggRule: [] })).eggRule).toEqual([]);
  });

  it("rejects an egg rule naming the same threshold twice", () => {
    expect(() =>
      createSettings(
        settingsInput({
          eggRule: [
            { minPersons: 3, eggs: 6 },
            { minPersons: 3, eggs: 12 },
          ],
        }),
      ),
    ).toThrow(DuplicateEggThreshold);
  });

  it("rejects an egg rule whose larger household is awarded no more eggs", () => {
    expect(() =>
      createSettings(
        settingsInput({
          eggRule: [
            { minPersons: 3, eggs: 12 },
            { minPersons: 5, eggs: 6 },
          ],
        }),
      ),
    ).toThrow(EggsNotIncreasing);
  });

  it("rejects an egg rule with a fractional egg count", () => {
    expect(() =>
      createSettings(settingsInput({ eggRule: [{ minPersons: 3, eggs: 6.5 }] })),
    ).toThrow(InvalidSettings);
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

  it("accepts a maximum price", () => {
    expect(createSettings(settingsInput({ priceCap: 500 })).priceCap).toBe(500);
  });

  it("accepts no maximum price at all", () => {
    expect(createSettings(settingsInput({ priceCap: null })).priceCap).toBeNull();
  });

  it("accepts a maximum price of nothing, which is not the same as having none", () => {
    expect(createSettings(settingsInput({ priceCap: 0 })).priceCap).toBe(0);
  });

  it("rejects a negative maximum price", () => {
    expect(() => createSettings(settingsInput({ priceCap: -1 }))).toThrow(/priceCap/);
  });

  it("rejects a fractional maximum price", () => {
    expect(() => createSettings(settingsInput({ priceCap: 2.5 }))).toThrow(/priceCap/);
  });

  it("accepts a maximum price below the price of a single grown-up", () => {
    expect(createSettings(settingsInput({ pricePerGrownUp: 200, priceCap: 100 })).priceCap).toBe(
      100,
    );
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

  it("charges the per-head sum when there is no cap", () => {
    expect(priceFor(createSettings(settingsInput({ priceCap: null })), 4, 3)).toBe(1100);
  });

  it("charges the per-head sum when it stays below the cap", () => {
    expect(priceFor(createSettings(settingsInput({ priceCap: 500 })), 1, 1)).toBe(300);
  });

  it("stops at the cap for a large household", () => {
    expect(priceFor(createSettings(settingsInput({ priceCap: 500 })), 4, 3)).toBe(500);
  });

  it("charges the cap exactly when the sum equals it", () => {
    expect(priceFor(createSettings(settingsInput({ priceCap: 500 })), 2, 1)).toBe(500);
  });

  it("charges nothing when the cap is zero", () => {
    expect(priceFor(createSettings(settingsInput({ priceCap: 0 })), 4, 3)).toBe(0);
  });

  it("caps a single-grown-up household too", () => {
    expect(priceFor(createSettings(settingsInput({ priceCap: 100 })), 1, 0)).toBe(100);
  });

  it("caps an empty household at nothing", () => {
    expect(priceFor(createSettings(settingsInput({ priceCap: 500 })), 0, 0)).toBe(0);
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
      "weekAnchor",
      "distributionWeekday",
      "pricePerGrownUp",
      "pricePerChild",
      "priceCap",
      "eggRule",
    ]);
  });

  it.each([
    ["quotaN", { quotaN: 200 }],
    ["distributionWeekday", { distributionWeekday: 5 }],
    ["pricePerGrownUp", { pricePerGrownUp: 250 }],
    ["pricePerChild", { pricePerChild: 125 }],
  ])("reports %s when only that value differs", (field, overrides) => {
    const next = createSettings(settingsInput(overrides));
    expect(changedSettingsFields(previous, next)).toEqual([field]);
  });

  it("reports priceCap when a cap is introduced", () => {
    const next = createSettings(settingsInput({ priceCap: 500 }));
    expect(changedSettingsFields(previous, next)).toEqual(["priceCap"]);
  });

  it("reports priceCap when a cap is removed", () => {
    const capped = createSettings(settingsInput({ priceCap: 500 }));
    const uncapped = createSettings(settingsInput({ priceCap: null }));
    expect(changedSettingsFields(capped, uncapped)).toEqual(["priceCap"]);
  });

  it("reports priceCap when the cap moves to another amount", () => {
    const capped = createSettings(settingsInput({ priceCap: 500 }));
    const next = createSettings(settingsInput({ priceCap: 600 }));
    expect(changedSettingsFields(capped, next)).toEqual(["priceCap"]);
  });

  it("reports nothing when neither version has a cap", () => {
    // `null === null`, so the absent cap needs no special case in `isUnchanged`.
    const next = createSettings(settingsInput({ priceCap: null }));
    expect(changedSettingsFields(previous, next)).toEqual([]);
  });

  it("reports eggRule when a row's egg count changes", () => {
    const next = createSettings(
      settingsInput({
        eggRule: [
          { minPersons: 3, eggs: 6 },
          { minPersons: 5, eggs: 14 },
          { minPersons: 8, eggs: 18 },
        ],
      }),
    );
    expect(changedSettingsFields(previous, next)).toEqual(["eggRule"]);
  });

  it("reports eggRule when a row is added", () => {
    const next = createSettings(
      settingsInput({ eggRule: [...DF_EGG_ROWS, { minPersons: 12, eggs: 24 }] }),
    );
    expect(changedSettingsFields(previous, next)).toEqual(["eggRule"]);
  });

  it("reports eggRule when the rule is emptied", () => {
    const next = createSettings(settingsInput({ eggRule: [] }));
    expect(changedSettingsFields(previous, next)).toEqual(["eggRule"]);
  });

  it("reports nothing when the egg rule's rows were merely retyped in another order", () => {
    // The rule is an array, so the field comparison every other value uses is a comparison of two
    // references — it would call every single save a change to the Eierregel.
    const next = createSettings(
      settingsInput({
        eggRule: [
          { minPersons: 5, eggs: 12 },
          { minPersons: 8, eggs: 18 },
          { minPersons: 3, eggs: 6 },
        ],
      }),
    );
    expect(changedSettingsFields(previous, next)).toEqual([]);
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
    const next = createSettings(settingsInput({ quotaN: 200, pricePerChild: 125 }));
    expect(changedSettingsFields(previous, next)).toEqual(["quotaN", "pricePerChild"]);
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
