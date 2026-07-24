import { describe, expect, it } from "vitest";
import type { NeedsCertificate } from "./customer";
import { isExpired } from "./certificate";

function certificateValidUntil(isoDate: string): NeedsCertificate {
  return { type: "Jobcenter", validUntil: new Date(`${isoDate}T00:00:00.000Z`) };
}

function on(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

describe("isExpired", () => {
  it("keeps a certificate valid the day before its validUntil date", () => {
    expect(isExpired(certificateValidUntil("2026-08-31"), on("2026-08-30"))).toBe(false);
  });

  it("keeps a certificate valid on its validUntil date", () => {
    expect(isExpired(certificateValidUntil("2026-08-31"), on("2026-08-31"))).toBe(false);
  });

  it("expires a certificate the day after its validUntil date", () => {
    expect(isExpired(certificateValidUntil("2026-08-31"), on("2026-09-01"))).toBe(true);
  });

  it("keeps a certificate ending 29 February valid on that leap day", () => {
    expect(isExpired(certificateValidUntil("2028-02-29"), on("2028-02-29"))).toBe(false);
  });

  it("expires a certificate ending 29 February on 1 March", () => {
    expect(isExpired(certificateValidUntil("2028-02-29"), on("2028-03-01"))).toBe(true);
  });

  it("expires a certificate ending 28 February on the leap day that follows it", () => {
    expect(isExpired(certificateValidUntil("2028-02-28"), on("2028-02-29"))).toBe(true);
  });

  it("ignores the time of day on both the validUntil date and today", () => {
    const lateInTheEvening: NeedsCertificate = {
      type: "Jobcenter",
      validUntil: new Date("2026-08-31T23:30:00.000Z"),
    };
    const earlyTheNextMorning = new Date("2026-09-01T00:15:00.000Z");
    expect(isExpired(lateInTheEvening, earlyTheNextMorning)).toBe(true);
  });
});
