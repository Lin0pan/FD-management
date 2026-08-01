import { describe, expect, it } from "vitest";
import { neighbours } from "./groupWalk";

/** A group's numbers as the register hands them over — ascending, with gaps where numbers were freed. */
const GROUP = [10, 20, 30, 40];

describe("neighbours", () => {
  it("gives the smallest number above the one shown as next", () => {
    expect(neighbours(GROUP, 20).next).toBe(30);
  });

  it("gives the largest number below the one shown as previous", () => {
    expect(neighbours(GROUP, 30).previous).toBe(20);
  });

  it("has no next above the last member", () => {
    expect(neighbours(GROUP, 40).next).toBeNull();
  });

  it("has no previous below the first member", () => {
    expect(neighbours(GROUP, 10).previous).toBeNull();
  });

  it("walks from nothing looked up to the first number of the group", () => {
    expect(neighbours(GROUP, null)).toEqual({ previous: null, next: 10 });
  });

  it("takes a number below every member as standing before the group", () => {
    expect(neighbours(GROUP, 1)).toEqual({ previous: null, next: 10 });
  });

  it("takes a number above every member as standing after the group", () => {
    expect(neighbours(GROUP, 99)).toEqual({ previous: 40, next: null });
  });

  it("places a number that belongs to nobody between its numeric neighbours", () => {
    expect(neighbours([10, 20, 30], 15)).toEqual({ previous: 10, next: 20 });
  });

  it("excludes the number itself from both sides", () => {
    expect(neighbours(GROUP, 20)).toEqual({ previous: 10, next: 30 });
  });

  it("has neither neighbour in an empty group, wherever the walk stands", () => {
    expect(neighbours([], null)).toEqual({ previous: null, next: null });
    expect(neighbours([], 20)).toEqual({ previous: null, next: null });
  });

  it("answers an unsorted set the same as its sorted form", () => {
    expect(neighbours([40, 10, 30, 20], 30)).toEqual(neighbours(GROUP, 30));
    expect(neighbours([40, 10, 30, 20], null)).toEqual(neighbours(GROUP, null));
  });

  it("gives the single member of a one-household group as the entry point and nothing else", () => {
    expect(neighbours([7], null)).toEqual({ previous: null, next: 7 });
    expect(neighbours([7], 7)).toEqual({ previous: null, next: null });
  });
});
