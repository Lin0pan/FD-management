import { describe, expect, it } from "vitest";
import { activeSection } from "./active-section";

/**
 * The matching rule of the navigation bar (US-17.1). It is the only part of the shell with any
 * judgement in it — which is why it is a pure function with a test rather than a condition inside
 * the component.
 */
describe("activeSection", () => {
  it("marks Start on the home page", () => {
    expect(activeSection("/")).toBe("start");
  });

  it("does not mark Start on every path, even though every path begins with a slash", () => {
    expect(activeSection("/ausgabe")).not.toBe("start");
    expect(activeSection("/kunden/42")).not.toBe("start");
  });

  it("marks Ausgabe on the distribution screen", () => {
    expect(activeSection("/ausgabe")).toBe("distribution");
  });

  it("marks Einstellungen on the settings screen", () => {
    expect(activeSection("/einstellungen")).toBe("settings");
  });

  it("marks Kunden verwalten on the customer list", () => {
    expect(activeSection("/kunden")).toBe("customers");
  });

  it("marks Kunden verwalten while a customer is being registered", () => {
    expect(activeSection("/kunden/neu")).toBe("customers");
  });

  it("marks Kunden verwalten on a customer's record", () => {
    expect(activeSection("/kunden/42")).toBe("customers");
  });

  it("marks Kunden verwalten on a customer's card, however deep the route goes", () => {
    expect(activeSection("/kunden/42/karte")).toBe("customers");
  });

  // The hub owns the waiting list and the reissue list: a staff member standing on one of them and
  // seeing no section marked reads the whole bar as broken.
  it("marks Kunden verwalten on the waiting list, which the hub owns", () => {
    expect(activeSection("/warteliste")).toBe("customers");
  });

  it("marks Kunden verwalten while an applicant is being promoted", () => {
    expect(activeSection("/warteliste/7/registrieren")).toBe("customers");
  });

  it("marks Kunden verwalten on the card-reissue list, which the hub owns too", () => {
    expect(activeSection("/karten-neuausstellung")).toBe("customers");
  });

  it("marks nothing on a path no section owns", () => {
    expect(activeSection("/impressum")).toBeNull();
  });

  it("matches whole path segments, so a longer route name is not swallowed by a shorter one", () => {
    expect(activeSection("/kundenkarten")).toBeNull();
  });
});
