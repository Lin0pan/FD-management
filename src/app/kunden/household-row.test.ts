import { describe, expect, it } from "vitest";
import { typedAge, typedDay } from "./household-row";

const TODAY = new Date(Date.UTC(2026, 0, 8));

describe("typedDay", () => {
  it("reads a complete day the way the server will", () => {
    expect(typedDay("08.01.2013")).toEqual(new Date(Date.UTC(2013, 0, 8)));
  });

  it("has no day while the date is half-typed, empty or impossible", () => {
    expect(typedDay("11.0")).toBeNull();
    expect(typedDay("")).toBeNull();
    expect(typedDay("31.02.1990")).toBeNull();
  });
});

describe("typedAge", () => {
  it("is 13 on the 13th birthday", () => {
    expect(typedAge("08.01.2013", TODAY)).toBe(13);
  });

  it("is still 12 the day before the 13th birthday", () => {
    expect(typedAge("09.01.2013", TODAY)).toBe(12);
  });

  it("is still 13 the day after the 13th birthday", () => {
    expect(typedAge("07.01.2013", TODAY)).toBe(13);
  });

  it("is 0 for a child born today", () => {
    expect(typedAge("08.01.2026", TODAY)).toBe(0);
  });

  it("shows no age while the date is half-typed or impossible", () => {
    expect(typedAge("11.0", TODAY)).toBeNull();
    expect(typedAge("31.02.1990", TODAY)).toBeNull();
  });

  it("shows no age for a birthdate after today, which the save will refuse", () => {
    expect(typedAge("09.01.2026", TODAY)).toBeNull();
    expect(typedAge("01.01.2099", TODAY)).toBeNull();
  });
});
