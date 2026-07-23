import { describe, expect, it } from "vitest";
import { germanDate } from "./format";

describe("germanDate", () => {
  it("writes a date the German way, with both parts padded", () => {
    expect(germanDate(new Date("2026-07-03T00:00:00.000Z"))).toBe("03.07.2026");
  });

  it("shows the stored day itself, not the day it is in the server's time zone", () => {
    expect(germanDate(new Date("2026-01-01T00:00:00.000Z"))).toBe("01.01.2026");
  });

  it("writes the 29th of February of a leap year", () => {
    expect(germanDate(new Date("2028-02-29T00:00:00.000Z"))).toBe("29.02.2028");
  });
});
