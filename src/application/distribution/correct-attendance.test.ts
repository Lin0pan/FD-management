import { beforeEach, describe, expect, it } from "vitest";
import { berlinDayKey } from "@/domain/distribution/attendance";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import { DistributionRecordNotFound, RecordNoLongerCorrectable } from "@/domain/errors";
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

function record(date: string, paidCents: Cents = PRICE): DistributionRecord {
  return {
    id: 7,
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

  it("flips the paid flag of a record made today and audits the correction", async () => {
    records = new FakeDistributionRecordRepository(record(TODAY));

    await correctAttendance(deps(), { recordId: 7, action: "SET_PAID", paid: false });

    // The flag is written as an amount (US-29.3): cleared is nothing handed over, and the record
    // now says so in the only currency the balance can read.
    expect(records.setPaymentCalls).toEqual([{ recordId: 7, paidCents: 0 }]);
    expect(records.records[0].paidCents).toBe(0);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      what: "distribution.corrected",
      changedFields: ["paid"],
      why: "",
      when: new Date(TODAY),
    });
  });

  it("writes the whole price back when a hand-out is corrected to paid", async () => {
    // The other half of the bridge (US-29.3): a box ticked back on is the household handing over
    // what the day cost, which is what the flag has always meant.
    records = new FakeDistributionRecordRepository(record(TODAY, 0 as Cents));

    await correctAttendance(deps(), { recordId: 7, action: "SET_PAID", paid: true });

    expect(records.setPaymentCalls).toEqual([{ recordId: 7, paidCents: PRICE }]);
    expect(records.records[0].paidCents).toBe(PRICE);
  });

  it("removes a record made today and audits the removal", async () => {
    records = new FakeDistributionRecordRepository(record(TODAY));

    await correctAttendance(deps(), { recordId: 7, action: "REMOVE" });

    expect(records.removed).toEqual([7]);
    expect(records.records).toHaveLength(0);
    expect(audit.entries[0]).toMatchObject({ what: "distribution.removed", why: "" });
  });

  it("rejects correcting a record made on an earlier day, and changes nothing", async () => {
    // Recorded on the previous distribution day; the correction is attempted today.
    records = new FakeDistributionRecordRepository(record("2026-07-16T09:00:00.000Z"));

    const error = await correctAttendance(deps(), {
      recordId: 7,
      action: "SET_PAID",
      paid: false,
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
