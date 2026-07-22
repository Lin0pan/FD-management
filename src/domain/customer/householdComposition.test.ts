import { describe, expect, it } from "vitest";
import { BirthDateInFuture, EmptyHousehold } from "../errors";
import { composition, type HouseholdMember } from "./householdComposition";

/** A household member is nothing but a birthdate as far as this rule is concerned. */
function bornOn(isoDate: string): HouseholdMember {
  return { birthDate: new Date(`${isoDate}T00:00:00.000Z`) };
}

function on(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

describe("composition", () => {
  it("counts a member as a child the day before their 13th birthday", () => {
    expect(composition([bornOn("2013-06-15")], on("2026-06-14"))).toEqual({
      grownUps: 0,
      children: 1,
    });
  });

  it("turns a member grown-up on the 13th birthday, not the day before", () => {
    expect(composition([bornOn("2013-06-15")], on("2026-06-15"))).toEqual({
      grownUps: 1,
      children: 0,
    });
  });

  it("keeps a member grown-up the day after their 13th birthday", () => {
    expect(composition([bornOn("2013-06-15")], on("2026-06-16"))).toEqual({
      grownUps: 1,
      children: 0,
    });
  });

  it("leaves a 29 February child a child on 28 February of a non-leap year", () => {
    expect(composition([bornOn("2012-02-29")], on("2025-02-28"))).toEqual({
      grownUps: 0,
      children: 1,
    });
  });

  it("turns a 29 February child grown-up on 1 March of a non-leap year", () => {
    expect(composition([bornOn("2012-02-29")], on("2025-03-01"))).toEqual({
      grownUps: 1,
      children: 0,
    });
  });

  it("counts a member born today as a child", () => {
    expect(composition([bornOn("2026-07-22")], on("2026-07-22"))).toEqual({
      grownUps: 0,
      children: 1,
    });
  });

  it("splits a mixed household into grown-ups and children", () => {
    const members = [
      bornOn("1988-03-04"),
      bornOn("1990-11-30"),
      bornOn("2011-01-02"),
      bornOn("2019-08-09"),
      bornOn("2022-12-24"),
    ];
    expect(composition(members, on("2026-07-22"))).toEqual({ grownUps: 3, children: 2 });
  });

  it("ignores the time of day on both the birthdate and today", () => {
    const lateInTheEvening = { birthDate: new Date("2013-06-15T23:30:00.000Z") };
    const earlyInTheMorning = new Date("2026-06-15T00:15:00.000Z");
    expect(composition([lateInTheEvening], earlyInTheMorning)).toEqual({
      grownUps: 1,
      children: 0,
    });
  });

  it("rejects an empty household rather than reporting nobody", () => {
    expect(() => composition([], on("2026-07-22"))).toThrow(EmptyHousehold);
  });

  it("rejects a birthdate in the future", () => {
    expect(() => composition([bornOn("2026-07-23")], on("2026-07-22"))).toThrow(BirthDateInFuture);
  });

  it("names the offending birthdate when it rejects one", () => {
    try {
      composition([bornOn("1990-01-01"), bornOn("2026-07-23")], on("2026-07-22"));
      expect.unreachable("a future birthdate must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(BirthDateInFuture);
      expect((error as BirthDateInFuture).birthDate).toEqual(on("2026-07-23"));
    }
  });
});
