import { beforeEach, describe, expect, it } from "vitest";
import { balanceOf } from "@/domain/distribution/balance";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import {
  createSessionGroups,
  type DistributionSession,
  type SessionSummary,
} from "@/domain/distribution/session";
import {
  DistributionRecordNotFound,
  InvalidPaymentAmount,
  OverpaymentNotConfirmed,
  RecordNoLongerCorrectable,
} from "@/domain/errors";
import type { Cents } from "@/domain/money";
import type {
  AuditEntry,
  AuditLog,
  Clock,
  DistributionRecordRepository,
  DistributionSessionRepository,
} from "../ports";
import { correctAttendance } from "./correct-attendance";

/**
 * Hand-written fakes, synthetic data only. "Today" is 2026-07-23 in Europe/Berlin — carried by the
 * records for the balance alone. What decides whether one may still be touched is its **own**
 * session: correctable while that session runs, frozen the moment it ends (US-34, FR-14).
 */

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

  listForSession(sessionId: number): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.records.filter((record) => record.sessionId === sessionId));
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
  freezeSession(): Promise<void> {
    return Promise.reject(new Error("Freezing an afternoon has a suite of its own"));
  }

  thawSession(): Promise<void> {
    return Promise.reject(new Error("Thawing an afternoon has a suite of its own"));
  }

  summariseBySession(): Promise<ReadonlyMap<number, SessionSummary>> {
    return Promise.reject(new Error("The overview of past afternoons has a suite of its own"));
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
/** The afternoon the record was made at — the one the correction window turns on. */
const SESSION_ID = 7;

/** The session a record belongs to, still running unless a test ends it. */
function session(endedAt: Date | null = null): DistributionSession {
  return {
    id: SESSION_ID,
    startedAt: new Date("2026-07-23T06:00:00.000Z"),
    endedAt,
    groups: createSessionGroups(["RED", "BLUE"]),
  };
}

/**
 * Hands back the record's own session, never the running one — which is the distinction the use case
 * is built on, and the reason `findById` takes an id at all.
 */
class FakeDistributionSessionRepository implements DistributionSessionRepository {
  constructor(private readonly stored: DistributionSession | null = session()) {}

  findById(sessionId: number): Promise<DistributionSession | null> {
    return Promise.resolve(
      this.stored !== null && this.stored.id === sessionId ? this.stored : null,
    );
  }

  findRunning(): Promise<DistributionSession | null> {
    return Promise.reject(
      new Error("a correction asks the record's own session, not the running one"),
    );
  }

  lastEnded(): Promise<DistributionSession | null> {
    return Promise.reject(new Error("correcting a record reads no session but its own"));
  }

  listEnded(): Promise<ReadonlyArray<DistributionSession>> {
    return Promise.reject(new Error("counting missed afternoons has a suite of its own"));
  }

  start(): Promise<DistributionSession> {
    return Promise.reject(new Error("Starting a session has a suite of its own"));
  }

  end(): Promise<void> {
    return Promise.reject(new Error("Ending a session has a suite of its own"));
  }

  discard(): Promise<void> {
    return Promise.reject(new Error("Discarding a session has a suite of its own"));
  }

  reopen(): Promise<void> {
    return Promise.reject(new Error("Reopening a session has a suite of its own"));
  }
}

function record(date: string, paidCents: Cents = PRICE, id = 7): DistributionRecord {
  return {
    id,
    customerId: 1,
    sessionId: SESSION_ID,
    date: new Date(date),
    showedUp: true,
    paidCents,
    priceCents: PRICE,
  };
}

describe("correctAttendance", () => {
  let records: FakeDistributionRecordRepository;
  let sessions: FakeDistributionSessionRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { records, sessions, audit, clock: fakeClock(today) };
  }

  beforeEach(() => {
    audit = new FakeAuditLog();
    sessions = new FakeDistributionSessionRepository();
  });

  it("lets a record be corrected while its session runs", async () => {
    // They handed over 100 of the 300 asked for and came back with the rest before the afternoon
    // was over, which is exactly as long as the record stays amendable.
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

  it("refuses a negative correction, which the form cannot type but a caller could pass", async () => {
    // The same guard `recordAttendance` applies, for the same reason: the balance is derived, so a
    // negative amount here would be carried by every later reading of it with nothing to correct.
    records = new FakeDistributionRecordRepository(record(TODAY));

    const error = await correctAttendance(deps(), {
      recordId: 7,
      action: "SET_PAYMENT",
      paidCents: -100 as Cents,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(InvalidPaymentAmount);
    expect(records.setPaymentCalls).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses a fraction of a cent rather than rounding it", async () => {
    records = new FakeDistributionRecordRepository(record(TODAY));

    const error = await correctAttendance(deps(), {
      recordId: 7,
      action: "SET_PAYMENT",
      paidCents: 12.5 as Cents,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(InvalidPaymentAmount);
    expect(records.setPaymentCalls).toHaveLength(0);
  });

  it("still refuses a record from an ended session before it looks at the amount", async () => {
    // Guard order: a record that may not be touched at all is refused as such, so a staff member is
    // told the afternoon is closed rather than being told to fix a number that would change nothing.
    records = new FakeDistributionRecordRepository(record("2026-07-16T09:00:00.000Z"));
    sessions = new FakeDistributionSessionRepository(session(new Date("2026-07-16T17:00:00.000Z")));

    const error = await correctAttendance(deps(), {
      recordId: 7,
      action: "SET_PAYMENT",
      paidCents: -100 as Cents,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(RecordNoLongerCorrectable);
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

  it("removes a record made at the running session and audits the removal", async () => {
    records = new FakeDistributionRecordRepository(record(TODAY));

    await correctAttendance(deps(), { recordId: 7, action: "REMOVE" });

    expect(records.removed).toEqual([7]);
    expect(records.records).toHaveLength(0);
    expect(audit.entries[0]).toMatchObject({ what: "distribution.removed", why: "" });
  });

  it("refuses to correct a record whose session has ended", async () => {
    // Recorded at the previous distribution, which was ended that evening.
    records = new FakeDistributionRecordRepository(record("2026-07-16T09:00:00.000Z"));
    sessions = new FakeDistributionSessionRepository(session(new Date("2026-07-16T17:00:00.000Z")));

    const error = await correctAttendance(deps(), {
      recordId: 7,
      action: "SET_PAYMENT",
      paidCents: 0 as Cents,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(RecordNoLongerCorrectable);
    expect((error as RecordNoLongerCorrectable).sessionId).toBe(SESSION_ID);
    expect(records.setPaymentCalls).toHaveLength(0);
    expect(records.removed).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses to remove a record once its session has ended, even on the same day", async () => {
    // Made and ended on 2026-07-23; the removal is attempted an hour later. The calendar day is the
    // same and says nothing — what closed the window is the afternoon being over (US-34, FR-14).
    records = new FakeDistributionRecordRepository(record(TODAY));
    sessions = new FakeDistributionSessionRepository(session(new Date("2026-07-23T15:00:00.000Z")));

    const error = await correctAttendance(deps("2026-07-23T16:00:00.000Z"), {
      recordId: 7,
      action: "REMOVE",
    }).catch((e) => e);

    expect(error).toBeInstanceOf(RecordNoLongerCorrectable);
    expect(records.removed).toHaveLength(0);
    expect(records.records).toHaveLength(1);
  });

  it("corrects a record at a reopened session, which is running again", async () => {
    // A session reopened to fix a mistake is running, so its own records are amendable once more —
    // and no other afternoon's are (US-34, FR-16).
    records = new FakeDistributionRecordRepository(record("2026-07-16T09:00:00.000Z"));

    await correctAttendance(deps(), { recordId: 7, action: "REMOVE" });

    expect(records.removed).toEqual([7]);
  });

  it("rejects correcting a record that does not exist", async () => {
    records = new FakeDistributionRecordRepository();

    await expect(
      correctAttendance(deps(), { recordId: 404, action: "REMOVE" }),
    ).rejects.toBeInstanceOf(DistributionRecordNotFound);
  });
});
