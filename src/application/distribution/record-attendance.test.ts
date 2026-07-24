import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  CustomerDetails,
  CustomerStatus,
  HouseholdMemberDetails,
  NewCustomer,
  RegisteredCustomer,
} from "@/domain/customer/customer";
import type { Group } from "@/domain/customer/group";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import { AlreadyServedToday, CustomerNotFound, NotClearToServe } from "@/domain/errors";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type {
  AuditEntry,
  AuditLog,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "../ports";
import { recordAttendance } from "./record-attendance";

/**
 * Hand-written fakes, synthetic data only. `2026-07-23` is a Thursday an even number of weeks from
 * the `2026-W02` RED anchor, so it is a RED distribution day: a RED customer is clear to serve and a
 * BLUE one is in the wrong group.
 */

faker.seed(20260723);

const TODAY = "2026-07-23T09:00:00.000Z";
const GROWN_UP = "1985-03-11T00:00:00.000Z";
const CHILD = "2020-06-01T00:00:00.000Z";

class FakeSettingsRepository implements SettingsRepository {
  readonly versions: SettingsVersion[] = [];

  constructor(...versions: SettingsVersion[]) {
    this.versions.push(...versions);
  }

  listVersions(): Promise<SettingsVersion[]> {
    return Promise.resolve([...this.versions]);
  }

  append(version: SettingsVersion): Promise<void> {
    this.versions.push(version);
    return Promise.resolve();
  }
}

class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];

  constructor(...holders: RegisteredCustomer[]) {
    this.holders.push(...holders);
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.holders.find((customer) => customer.id === id) ?? null);
  }

  findByCustomerNumber(): Promise<RegisteredCustomer | null> {
    return Promise.resolve(null);
  }

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    return Promise.resolve([]);
  }

  groupCounts(): Promise<{ red: number; blue: number }> {
    return Promise.resolve({ red: 0, blue: 0 });
  }

  create(customer: NewCustomer): Promise<RegisteredCustomer> {
    const registered = { ...customer, id: this.holders.length + 1 };
    this.holders.push(registered);
    return Promise.resolve(registered);
  }
}

/** Records writes so a test can prove a refusal wrote nothing, and assigns ids on create. */
class FakeDistributionRecordRepository implements DistributionRecordRepository {
  readonly records: DistributionRecord[] = [];
  creates = 0;

  constructor(...records: DistributionRecord[]) {
    this.records.push(...records);
  }

  listForCustomer(customerId: number): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.records.filter((record) => record.customerId === customerId));
  }

  findById(recordId: number): Promise<DistributionRecord | null> {
    return Promise.resolve(this.records.find((record) => record.id === recordId) ?? null);
  }

  create(record: NewDistributionRecord): Promise<DistributionRecord> {
    this.creates += 1;
    const stored = { ...record, id: this.records.length + 1 };
    this.records.push(stored);
    return Promise.resolve(stored);
  }

  setPaid(recordId: number, paid: boolean): Promise<DistributionRecord> {
    const record = this.records.find((r) => r.id === recordId);
    if (record === undefined) throw new Error("test fake: no such record");
    const updated = { ...record, paid };
    this.records[this.records.indexOf(record)] = updated;
    return Promise.resolve(updated);
  }

  remove(recordId: number): Promise<void> {
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

function settingsInput(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return {
    quotaN: 240,
    portionsPerGrownUp: 2,
    portionsPerChild: 1,
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 4,
    pricePerGrownUp: 200,
    pricePerChild: 100,
    ...overrides,
  };
}

function version(overrides: Partial<SettingsInput> = {}): SettingsVersion {
  return {
    recordedAt: new Date("2026-01-01T00:00:00.000Z"),
    settings: createSettings(settingsInput(overrides)),
  };
}

function member(birthDate: string): HouseholdMemberDetails {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: new Date(birthDate),
  };
}

interface CustomerOverrides {
  readonly id?: number;
  readonly group?: Group;
  readonly status?: CustomerStatus;
  readonly householdMembers?: ReadonlyArray<HouseholdMemberDetails>;
}

function customerRecord(overrides: CustomerOverrides = {}): RegisteredCustomer {
  const details: CustomerDetails = {
    firstName: "Mira",
    lastName: "Aalto",
    birthDate: new Date(GROWN_UP),
    address: { street: "Hauptstraße", houseNumber: "1", zip: "33129", city: "Delbrück" },
    certificate: { type: "Jobcenter", validUntil: new Date("2027-01-31T00:00:00.000Z") },
    householdMembers: overrides.householdMembers ?? [member(GROWN_UP), member(CHILD)],
    notes: "",
  };
  return {
    id: overrides.id ?? 1,
    customerNumber: 50,
    group: overrides.group ?? "RED",
    status: overrides.status ?? "ACTIVE",
    reminderCount: 0,
    card: { index: 1, issuedAt: new Date(TODAY), reason: "FIRST_ISSUE" },
    details,
  };
}

function existingRecord(date: string): DistributionRecord {
  return {
    id: 99,
    customerId: 1,
    date: new Date(date),
    showedUp: true,
    paid: true,
    priceCents: 300,
  };
}

describe("recordAttendance", () => {
  let customers: FakeCustomerRepository;
  let records: FakeDistributionRecordRepository;
  let settings: FakeSettingsRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { customers, records, settings, audit, clock: fakeClock(today) };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository(customerRecord());
    records = new FakeDistributionRecordRepository();
    settings = new FakeSettingsRepository(version());
    audit = new FakeAuditLog();
  });

  it("records the hand-out with showedUp, the paid flag and the price in force today", async () => {
    const record = await recordAttendance(deps(), { customerId: 1 });

    // One grown-up + one child at 200/100 per head = 300 cents.
    expect(record).toMatchObject({
      customerId: 1,
      showedUp: true,
      paid: true,
      priceCents: 300,
    });
    expect(record.date).toEqual(new Date(TODAY));
    expect(records.records).toHaveLength(1);
  });

  it("defaults paid to true when it is not given", async () => {
    const record = await recordAttendance(deps(), { customerId: 1 });

    expect(record.paid).toBe(true);
  });

  it("stores paid as false when the staff member cleared the flag", async () => {
    const record = await recordAttendance(deps(), { customerId: 1, paid: false });

    expect(record.paid).toBe(false);
  });

  it("writes an audit entry with no actor for the recorded hand-out", async () => {
    await recordAttendance(deps(), { customerId: 1 });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      what: "distribution.recorded",
      why: "",
      when: new Date(TODAY),
    });
    expect(audit.entries[0]).not.toHaveProperty("who");
  });

  it("refuses an unknown customer id rather than writing a record for nobody", async () => {
    await expect(recordAttendance(deps(), { customerId: 404 })).rejects.toBeInstanceOf(
      CustomerNotFound,
    );
    expect(records.creates).toBe(0);
  });

  it("refuses to record for an archived customer, and writes nothing", async () => {
    customers = new FakeCustomerRepository(customerRecord({ status: "ARCHIVED" }));

    const error = await recordAttendance(deps(), { customerId: 1 }).catch((e) => e);

    expect(error).toBeInstanceOf(NotClearToServe);
    expect((error as NotClearToServe).verdict.kind).toBe("ARCHIVED");
    expect(records.creates).toBe(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses to record for a blocked customer, independently of the UI", async () => {
    customers = new FakeCustomerRepository(customerRecord({ status: "BLOCKED" }));

    const error = await recordAttendance(deps(), { customerId: 1 }).catch((e) => e);

    expect(error).toBeInstanceOf(NotClearToServe);
    expect((error as NotClearToServe).verdict.kind).toBe("BLOCKED");
    expect(records.creates).toBe(0);
  });

  it("refuses to record for a customer of the wrong group for the week", async () => {
    customers = new FakeCustomerRepository(customerRecord({ group: "BLUE" }));

    const error = await recordAttendance(deps(), { customerId: 1 }).catch((e) => e);

    expect(error).toBeInstanceOf(NotClearToServe);
    expect((error as NotClearToServe).verdict.kind).toBe("WRONG_GROUP");
    expect(records.creates).toBe(0);
  });

  it("rejects a second recording on the same day with AlreadyServedToday and writes nothing", async () => {
    records = new FakeDistributionRecordRepository(existingRecord("2026-07-23T08:00:00.000Z"));

    const error = await recordAttendance(deps(), { customerId: 1 }).catch((e) => e);

    expect(error).toBeInstanceOf(AlreadyServedToday);
    expect((error as AlreadyServedToday).existingDate).toEqual(
      new Date("2026-07-23T08:00:00.000Z"),
    );
    expect(records.creates).toBe(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("records again on a later day, since the once-per-day rule is calendar-day based", async () => {
    // A fortnight-old record must not block today's — 2026-08-06 is the next RED Thursday (the week
    // between is BLUE, so the same RED customer only collects two weeks on).
    records = new FakeDistributionRecordRepository(existingRecord("2026-07-23T08:00:00.000Z"));

    const record = await recordAttendance(deps("2026-08-06T09:00:00.000Z"), { customerId: 1 });

    expect(record.date).toEqual(new Date("2026-08-06T09:00:00.000Z"));
  });
});
