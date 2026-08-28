import { beforeEach, describe, expect, it } from "vitest";
import { balanceOf } from "@/domain/distribution/balance";
import { berlinDayKey } from "@/domain/distribution/attendance";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import {
  DistributionRecordNotFound,
  OverpaymentNotConfirmed,
  RecordNoLongerCorrectable,
} from "@/domain/errors";
import type { Cents } from "@/domain/money";
import type { AuditEntry, AuditLog, Clock, DistributionRecordRepository } from "../ports";
import { correctAttendance } from "./correct-attendance";

/** Hand-written fakes, synthetic data only. "Today" is 2026-07-23 in Europe/Berlin. */

const TODAY = "2026-07-23T09:00:00.000Z";

class FakeDistributionRecordRepository implements DistributionRecordRepository {
  readonly records: DistributionRecord[] = [];
  removed: number[] = [];
  setPaymentCalls: Array<{ recordId: number; paidCents: Cents }> = [];

  constructor(...records: DistributionRecord[]) {
    this.records.push(...records);
  }

  listForCustomer(customerId: number): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.records.filter((record) => record.customerId === customerId));
  }

  listForDay(dayKey: string): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.records.filter((record) => berlinDayKey(record.date) === dayKey));
  }

  findById(recordId: number): Promise<DistributionRecord | null> {
    return Promise.resolve(this.records.find((record) => record.id === recordId) ?? null);
  }

  create(record: NewDistributionRecord): Promise<DistributionRecord> {
    const stored = { ...record, id: this.records.length + 1 };
    this.records.push(stored);
    return Promise.resolve(stored);
  }

  setPayment(recordId: number, paidCents: Cents): Promise<DistributionRecord> {
    this.setPaymentCalls.push({ recordId, paidCents });
    const record = this.records.find((r) => r.id === recordId);
    if (record === undefined) throw new Error("test fake: no such record");
    const updated = { ...record, paidCents };
    this.records[this.records.indexOf(record)] = updated;
    return Promise.resolve(updated);
  }

  remove(recordId: number): Promise<void> {
    this.removed.push(recordId);
    const index = this.records.findIndex((r) => r.id === recordId);
    this.records.splice(index, 1);
    return Promise.resolve();
  }
}

class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

function fakeClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

const PRICE = 300 as Cents;

function record(date: string, paidCents: Cents = PRICE, id = 7): DistributionRecord {
  return {
    id,
    customerId: 1,
    date: new Date(date),
    showedUp: true,
    paidCents,
    priceCents: PRICE,
  };
}

describe("correctAttendance", () => {
  let records: FakeDistributionRecordRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { records, audit, clock: fakeClock(today) };
  }

  beforeEach(() => {
    audit = new FakeAuditLog();
  });

  it("raises a payment recorded earlier today", async () => {
    // They handed over 100 of the 300 asked for and came back with the rest before the day was out.
    records = new FakeDistributionRecordRepository(record(TODAY, 100 as Cents));

    await correctAttendance(deps(), { recordId: 7, action: "SET_PAYMENT", paidCents: PRICE });

    expect(records.setPaymentCalls).toEqual([{ recordId: 7, paidCents: PRICE }]);
    expect(records.records[0].paidCents).toBe(PRICE);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      what: "distribution.corrected",
      changedFields: ["paidCents"],
      why: "",
      when: new Date(TODAY),
    });
  });

  it("records a correction down to nothing without a question", async () => {
    records = new FakeDistributionRecordRepository(record(TODAY));

    await correctAttendance(deps(), { recordId: 7, action: "SET_PAYMENT", paidCents: 0 as Cents });

    expect(records.records[0].paidCents).toBe(0);
  });

  it("refuses an unconfirmed correction above the amount that was asked", async () => {
    records = new FakeDistributionRecordRepository(record(TODAY, 100 as Cents));

    const error = await correctAttendance(deps(), {
      recordId: 7,
      action: "SET_PAYMENT",
      paidCents: 400 as Cents,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(OverpaymentNotConfirmed);
    expect(error).toMatchObject({ paidCents: 400, amountToPayCents: PRICE });
    expect(records.setPaymentCalls).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("writes a confirmed correction above the amount that was asked", async () => {
    records = new FakeDistributionRecordRepository(record(TODAY, 100 as Cents));

    await correctAttendance(deps(), {
      recordId: 7,
      action: "SET_PAYMENT",
      paidCents: 400 as Cents,
      overpaymentConfirmed: true,
    });

    expect(records.records[0].paidCents).toBe(400);
  });

  it("judges a correction against what was asked that day, not against today's amount to pay", async () => {
    // A fortnight ago they were asked for 300 and handed over 100, so today's hand-out was asked
    // for 500. Correcting today's payment to 500 is settling up, not paying ahead — read against
    // today's *amount to pay*, which already counts this record's own payment, it would look like
    // an overpayment and staff would be asked to confirm a credit that does not exist.
    records = new FakeDistributionRecordRepository(
      record("2026-07-09T09:00:00.000Z", 100 as Cents, 6),
      record(TODAY, 500 as Cents),
    );

    await correctAttendance(deps(), {
      recordId: 7,
      action: "SET_PAYMENT",
      paidCents: 500 as Cents,
    });

    expect(records.setPaymentCalls).toEqual([{ recordId: 7, paidCents: 500 }]);
    expect(balanceOf(records.records)).toBe(0);
  });

  it("restores the balance when a record is removed", async () => {
    // The property the whole derive-don't-store choice was made for: nothing puts the balance back,
    // because there is nothing to put back — the surviving rows are the balance.
    records = new FakeDistributionRecordRepository(
      record("2026-07-09T09:00:00.000Z", 100 as Cents, 6),
      record(TODAY, 500 as Cents),
    );
    expect(balanceOf(records.records)).toBe(0);

    await correctAttendance(deps(), { recordId: 7, action: "REMOVE" });

    expect(balanceOf(records.records)).toBe(-200);
  });

  it("removes a record made today and audits the removal", async () => {
    records = new FakeDistributionRecordRepository(record(TODAY));

    await correctAttendance(deps(), { recordId: 7, action: "REMOVE" });

    expect(records.removed).toEqual([7]);
    expect(records.records).toHaveLength(0);
    expect(audit.entries[0]).toMatchObject({ what: "distribution.removed", why: "" });
  });

  it("refuses to correct a record from an earlier day", async () => {
    // Recorded on the previous distribution day; the correction is attempted today.
    records = new FakeDistributionRecordRepository(record("2026-07-16T09:00:00.000Z"));

    const error = await correctAttendance(deps(), {
      recordId: 7,
      action: "SET_PAYMENT",
      paidCents: 0 as Cents,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(RecordNoLongerCorrectable);
    expect((error as RecordNoLongerCorrectable).recordDate).toEqual(
      new Date("2026-07-16T09:00:00.000Z"),
    );
    expect(records.setPaymentCalls).toHaveLength(0);
    expect(records.removed).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("rejects removing a record the day after it was made", async () => {
    // Made 2026-07-23, corrected 2026-07-24 — one Berlin day later, so no longer correctable.
    records = new FakeDistributionRecordRepository(record(TODAY));

    const error = await correctAttendance(deps("2026-07-24T09:00:00.000Z"), {
      recordId: 7,
      action: "REMOVE",
    }).catch((e) => e);

    expect(error).toBeInstanceOf(RecordNoLongerCorrectable);
    expect(records.removed).toHaveLength(0);
    expect(records.records).toHaveLength(1);
  });

  it("rejects correcting a record that does not exist", async () => {
    records = new FakeDistributionRecordRepository();

    await expect(
      correctAttendance(deps(), { recordId: 404, action: "REMOVE" }),
    ).rejects.toBeInstanceOf(DistributionRecordNotFound);
  });
});
