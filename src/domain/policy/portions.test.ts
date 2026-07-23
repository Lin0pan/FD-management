import { describe, expect, it } from "vitest";
import { portionsFor } from "./portions";

/** The provisional seed values (tasks/prd-us-07-portions-and-price.md §8): 2 per grown-up, 1 per child. */
const seedPortions = { portionsPerGrownUp: 2, portionsPerChild: 1 };

describe("portionsFor", () => {
  it("gives one grown-up their per-grown-up portions and nothing for absent children", () => {
    expect(portionsFor({ grownUps: 1, children: 0 }, seedPortions)).toBe(2);
  });

  it("adds the per-child portions for a household with children", () => {
    expect(portionsFor({ grownUps: 2, children: 3 }, seedPortions)).toBe(7);
  });

  it("counts only grown-ups when there are no children", () => {
    expect(portionsFor({ grownUps: 4, children: 0 }, seedPortions)).toBe(8);
  });

  it("ignores children entirely when portionsPerChild is 0", () => {
    expect(
      portionsFor({ grownUps: 2, children: 5 }, { portionsPerGrownUp: 3, portionsPerChild: 0 }),
    ).toBe(6);
  });
});
