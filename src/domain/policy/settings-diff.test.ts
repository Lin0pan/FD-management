import { describe, expect, it } from "vitest";
import { createSettings, type Settings, type SettingsInput } from "./settings";
import { diffSettings } from "./settings-diff";

/** A valid baseline; each test moves only the field whose rule it is about. */
function settings(overrides: Partial<SettingsInput> = {}): Settings {
  return createSettings({
    quotaN: 240,
    portionsPerGrownUp: 2,
    portionsPerChild: 1,
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 4,
    pricePerGrownUp: 200,
    pricePerChild: 100,
    priceCap: null,
    ...overrides,
  });
}

describe("diffSettings", () => {
  it("reports nothing when two versions hold identical values", () => {
    expect(diffSettings(settings(), settings())).toEqual([]);
  });

  it("reports nothing for two versions built from separate but equal objects", () => {
    // The anchor is a nested object, so a naive `===` over the fields would call every save a
    // change to the Ankerwoche — the values are compared, never the references.
    const previous = settings({ weekAnchor: { isoWeek: "2026-W02", colour: "RED" } });
    const next = settings({ weekAnchor: { isoWeek: "2026-W02", colour: "RED" } });

    expect(diffSettings(previous, next)).toEqual([]);
  });

  it("reports a changed quota with the number before and after", () => {
    expect(diffSettings(settings(), settings({ quotaN: 200 }))).toEqual([
      { field: "quotaN", from: 240, to: 200 },
    ]);
  });

  it("reports a changed portion count per grown-up", () => {
    expect(diffSettings(settings(), settings({ portionsPerGrownUp: 3 }))).toEqual([
      { field: "portionsPerGrownUp", from: 2, to: 3 },
    ]);
  });

  it("reports a changed portion count per child", () => {
    expect(diffSettings(settings(), settings({ portionsPerChild: 2 }))).toEqual([
      { field: "portionsPerChild", from: 1, to: 2 },
    ]);
  });

  it("reports a changed anchor week on its own", () => {
    const next = settings({ weekAnchor: { isoWeek: "2026-W03", colour: "RED" } });

    expect(diffSettings(settings(), next)).toEqual([
      { field: "weekAnchorIsoWeek", from: "2026-W02", to: "2026-W03" },
    ]);
  });

  it("reports a changed anchor colour on its own", () => {
    // The anchor is one field to the audit log and two on screen. Reporting the colour without the
    // week is the whole reason this diff does not reuse `changedSettingsFields`.
    const next = settings({ weekAnchor: { isoWeek: "2026-W02", colour: "BLUE" } });

    expect(diffSettings(settings(), next)).toEqual([
      { field: "weekAnchorColour", from: "RED", to: "BLUE" },
    ]);
  });

  it("reports both halves of the anchor when both moved", () => {
    const next = settings({ weekAnchor: { isoWeek: "2026-W03", colour: "BLUE" } });

    expect(diffSettings(settings(), next)).toEqual([
      { field: "weekAnchorIsoWeek", from: "2026-W02", to: "2026-W03" },
      { field: "weekAnchorColour", from: "RED", to: "BLUE" },
    ]);
  });

  it("reports a changed distribution weekday", () => {
    // The bug this whole diff exists for: the Ausgabetag was never printed, so moving it produced a
    // history row identical to its predecessor in every character.
    expect(diffSettings(settings(), settings({ distributionWeekday: 5 }))).toEqual([
      { field: "distributionWeekday", from: 4, to: 5 },
    ]);
  });

  it("reports a changed price per grown-up in cents", () => {
    expect(diffSettings(settings(), settings({ pricePerGrownUp: 250 }))).toEqual([
      { field: "pricePerGrownUp", from: 200, to: 250 },
    ]);
  });

  it("reports a changed price per child in cents", () => {
    expect(diffSettings(settings(), settings({ pricePerChild: 0 }))).toEqual([
      { field: "pricePerChild", from: 100, to: 0 },
    ]);
  });

  it("reports an introduced cap from no cap to an amount", () => {
    // The transition the nullable column exists for: `null` and `0` are two different claims, so
    // introducing a cap has to read as a change rather than as an amount appearing out of nothing.
    expect(diffSettings(settings(), settings({ priceCap: 500 }))).toEqual([
      { field: "priceCap", from: null, to: 500 },
    ]);
  });

  it("reports a removed cap from an amount back to no cap", () => {
    expect(diffSettings(settings({ priceCap: 500 }), settings())).toEqual([
      { field: "priceCap", from: 500, to: null },
    ]);
  });

  it("reports a changed cap in cents", () => {
    expect(diffSettings(settings({ priceCap: 500 }), settings({ priceCap: 600 }))).toEqual([
      { field: "priceCap", from: 500, to: 600 },
    ]);
  });

  it("reports nothing when neither version has a cap", () => {
    expect(diffSettings(settings({ priceCap: null }), settings({ priceCap: null }))).toEqual([]);
  });

  it("reports nothing when both versions hold the same cap", () => {
    expect(diffSettings(settings({ priceCap: 500 }), settings({ priceCap: 500 }))).toEqual([]);
  });

  it("lists several changes in the order the form states the fields", () => {
    const next = settings({
      pricePerChild: 120,
      quotaN: 250,
      distributionWeekday: 5,
    });

    expect(diffSettings(settings(), next).map((change) => change.field)).toEqual([
      "quotaN",
      "distributionWeekday",
      "pricePerChild",
    ]);
  });

  it("reports every field when nothing the two versions hold is the same", () => {
    const next = settings({
      quotaN: 100,
      portionsPerGrownUp: 4,
      portionsPerChild: 3,
      weekAnchor: { isoWeek: "2027-W01", colour: "BLUE" },
      distributionWeekday: 1,
      pricePerGrownUp: 1,
      pricePerChild: 2,
      priceCap: 500,
    });

    expect(diffSettings(settings(), next).map((change) => change.field)).toEqual([
      "quotaN",
      "portionsPerGrownUp",
      "portionsPerChild",
      "weekAnchorIsoWeek",
      "weekAnchorColour",
      "distributionWeekday",
      "pricePerGrownUp",
      "pricePerChild",
      "priceCap",
    ]);
  });
});
