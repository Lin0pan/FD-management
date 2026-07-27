import { describe, expect, it } from "vitest";

import { foldName } from "./nameSearch";

/** "Mu" + a combining diaeresis: the decomposed spelling of "Müller" some keyboards produce. */
const DECOMPOSED_MUELLER = "Mu\u0308ller";

describe("foldName", () => {
  it("folds case away so a name typed in capitals finds the record", () => {
    expect(foldName("MÜLLER")).toBe(foldName("Müller"));
  });

  it("writes ä as ae, the way the name is spelled when the umlaut is unavailable", () => {
    expect(foldName("Bäcker")).toBe("baecker");
  });

  it("writes ö as oe", () => {
    expect(foldName("Köhler")).toBe("koehler");
  });

  it("writes ü as ue, so Müller and Mueller fold to the same value", () => {
    expect(foldName("Müller")).toBe("mueller");
    expect(foldName("Mueller")).toBe("mueller");
  });

  it("writes ß as ss, so Weiß and Weiss fold to the same value", () => {
    expect(foldName("Weiß")).toBe("weiss");
    expect(foldName("Weiss")).toBe("weiss");
  });

  it("folds a capital ẞ the same way as the small one", () => {
    expect(foldName("WEIẞ")).toBe("weiss");
  });

  it("strips an accent German does not spell out, so Sánchez matches Sanchez", () => {
    expect(foldName("Sánchez")).toBe("sanchez");
    expect(foldName("Sanchez")).toBe("sanchez");
  });

  it("folds a decomposed umlaut like the composed one — the same name, another keyboard", () => {
    expect(foldName(DECOMPOSED_MUELLER)).toBe("mueller");
  });

  it("keeps the hyphen of a double-barrelled name — it distinguishes people", () => {
    expect(foldName("Meyer-Schmidt")).toBe("meyer-schmidt");
  });

  it("collapses runs of whitespace so a doubled space still matches", () => {
    expect(foldName("van  der  Berg")).toBe("van der berg");
  });

  it("drops leading and trailing whitespace", () => {
    expect(foldName("  Müller  ")).toBe("mueller");
  });

  it("folds a blank name to the empty string rather than refusing", () => {
    expect(foldName("   ")).toBe("");
  });
});
