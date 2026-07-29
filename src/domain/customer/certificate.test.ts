import { describe, expect, it } from "vitest";
import type { NeedsCertificate } from "./customer";
import { certificateState, EXPIRING_SOON_DAYS, isExpired, validUntilRangeFor } from "./certificate";

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

describe("certificateState", () => {
  it("calls a certificate expired the day after its validUntil date", () => {
    expect(certificateState(certificateValidUntil("2026-08-31"), on("2026-09-01"))).toBe("EXPIRED");
  });

  it("calls a certificate expiring soon on the last day it is still valid", () => {
    expect(certificateState(certificateValidUntil("2026-08-31"), on("2026-08-31"))).toBe(
      "EXPIRING_SOON",
    );
  });

  it("calls a certificate expiring soon exactly 30 days before it lapses", () => {
    expect(certificateState(certificateValidUntil("2026-08-31"), on("2026-08-01"))).toBe(
      "EXPIRING_SOON",
    );
  });

  it("calls a certificate valid 31 days before it lapses, one day outside the window", () => {
    expect(certificateState(certificateValidUntil("2026-08-31"), on("2026-07-31"))).toBe("VALID");
  });

  it("counts the days of the window over a leap day like any other days", () => {
    // 2028-02-29 exists, so 30 days on from 2028-02-01 is 2028-03-02.
    expect(certificateState(certificateValidUntil("2028-03-02"), on("2028-02-01"))).toBe(
      "EXPIRING_SOON",
    );
    expect(certificateState(certificateValidUntil("2028-03-03"), on("2028-02-01"))).toBe("VALID");
  });

  it("ignores the time of day when placing a certificate in the window", () => {
    const lateInTheEvening: NeedsCertificate = {
      type: "Jobcenter",
      validUntil: new Date("2026-08-31T23:30:00.000Z"),
    };
    expect(certificateState(lateInTheEvening, new Date("2026-07-31T22:00:00.000Z"))).toBe("VALID");
  });

  it("documents the expiring-soon window as 30 days", () => {
    expect(EXPIRING_SOON_DAYS).toBe(30);
  });
});

describe("validUntilRangeFor", () => {
  it("bounds expired certificates above by the start of today, exclusively", () => {
    expect(validUntilRangeFor("EXPIRED", new Date("2026-08-01T14:20:00.000Z"))).toEqual({
      before: on("2026-08-01"),
    });
  });

  it("bounds valid certificates below by the start of today, inclusively", () => {
    expect(validUntilRangeFor("VALID", new Date("2026-08-01T14:20:00.000Z"))).toEqual({
      from: on("2026-08-01"),
    });
  });

  it("bounds expiring-soon certificates by today and the day after the 30th", () => {
    expect(validUntilRangeFor("EXPIRING_SOON", new Date("2026-08-01T14:20:00.000Z"))).toEqual({
      from: on("2026-08-01"),
      before: on("2026-09-01"),
    });
  });

  it("agrees with certificateState on both edges of the expiring-soon window", () => {
    const today = on("2026-08-01");
    const { from, before } = validUntilRangeFor("EXPIRING_SOON", today);
    expect(from).toBeDefined();
    expect(before).toBeDefined();
    // The bounds are half-open: the day `before` names is already outside the window.
    expect(certificateState({ type: "Jobcenter", validUntil: on("2026-08-31") }, today)).toBe(
      "EXPIRING_SOON",
    );
    expect(certificateState({ type: "Jobcenter", validUntil: on("2026-09-01") }, today)).toBe(
      "VALID",
    );
  });
});
