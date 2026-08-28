import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  CustomerDetails,
  CustomerStatus,
  HouseholdMemberDetails,
  NewCustomer,
  PersonalDetails,
  RegisteredCustomer,
} from "@/domain/customer/customer";
import type { Group } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import { berlinDayKey } from "@/domain/distribution/attendance";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import { AlreadyServedToday, CustomerNotFound, NotClearToServe } from "@/domain/errors";
import type { Cents } from "@/domain/money";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type {
  ArchivedCustomer,
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

  /**
   * No use case in this file browses the register (US-15.1); the method is here because the port
   * has it. Answering with nothing is honest — nothing here asks the list a question.
   */
  list(): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve([]);
  }

  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve(this.holders.filter((customer) => customer.status === status));
  }

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    return Promise.resolve([]);
  }

  groupCounts(): Promise<{ red: number; blue: number }> {
    return Promise.resolve({ red: 0, blue: 0 });
  }

  create(customer: NewCustomer): Promise<RegisteredCustomer> {
    const registered = {
      ...customer,
      id: this.holders.length + 1,
      blockReason: null,
      archiveReason: null,
      archivedAt: null,
      registeredOn: customer.card.issuedAt,
    };
    this.holders.push(registered);
    return Promise.resolve(registered);
  }

  /**
   * No use case in this file searches the archive (US-11.1); the method is here because the port has
   * it. Answering with nothing is honest — this register holds no archived household these tests
   * ever look for.
   */
  searchArchived(): Promise<ReadonlyArray<ArchivedCustomer>> {
    return Promise.resolve([]);
  }

  updateHousehold(id: number, members: ReadonlyArray<HouseholdMemberDetails>): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    const held = this.holders[index];
    this.holders[index] = {
      ...held,
      details: { ...held.details, householdMembers: [...members] },
    };
    return Promise.resolve();
  }

  updateDetails(
    id: number,
    details: PersonalDetails,
    household: ReadonlyArray<HouseholdMemberDetails>,
  ): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    const held = this.holders[index];
    this.holders[index] = {
      ...held,
      details: { ...held.details, ...details, householdMembers: [...household] },
    };
    return Promise.resolve();
  }

  updateNotes(id: number, notes: string): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    const held = this.holders[index];
    this.holders[index] = { ...held, details: { ...held.details, notes } };
    return Promise.resolve();
  }

  setGroup(id: number, group: Group): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    this.holders[index] = { ...this.holders[index], group };
    return Promise.resolve();
  }

  setStatus(id: number, status: CustomerStatus, blockReason: string | null): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    this.holders[index] = { ...this.holders[index], status, blockReason };
    return Promise.resolve();
  }

  archive(id: number, reason: string, archivedAt: Date): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    this.holders[index] = {
      ...this.holders[index],
      status: "ARCHIVED",
      blockReason: null,
      archiveReason: reason,
      archivedAt,
    };
    return Promise.resolve();
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

  listForDay(dayKey: string): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.records.filter((record) => berlinDayKey(record.date) === dayKey));
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

  setPayment(recordId: number, paidCents: Cents): Promise<DistributionRecord> {
    const record = this.records.find((r) => r.id === recordId);
    if (record === undefined) throw new Error("test fake: no such record");
    const updated = { ...record, paidCents };
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
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 4,
    pricePerGrownUp: 200,
    pricePerChild: 100,
    priceCap: null,
    eggRule: [],
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
    blockReason: overrides.status === "BLOCKED" ? "gesperrt" : null,
    archiveReason: overrides.status === "ARCHIVED" ? "archiviert" : null,
    archivedAt: overrides.status === "ARCHIVED" ? new Date(TODAY) : null,
    reminderCount: 0,
    card: {
      index: 1,
      issuedAt: new Date(TODAY),
      reason: "FIRST_ISSUE",
      countsAtIssue: composition(details.householdMembers, new Date(TODAY)),
      groupAtIssue: overrides.group ?? "RED",
    },
    registeredOn: new Date(TODAY),
    previousCustomerId: null,
    details,
  };
}

function existingRecord(date: string): DistributionRecord {
  return {
    id: 99,
    customerId: 1,
    date: new Date(date),
    showedUp: true,
    paidCents: 300 as Cents,
    priceCents: 300 as Cents,
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

  it("records the hand-out with showedUp, the payment and the price in force today", async () => {
    const record = await recordAttendance(deps(), { customerId: 1 });

    // One grown-up + one child at 200/100 per head = 300 cents.
    expect(record).toMatchObject({
      customerId: 1,
      showedUp: true,
      paidCents: 300,
      priceCents: 300,
    });
    expect(record.date).toEqual(new Date(TODAY));
    expect(records.records).toHaveLength(1);
  });

  it("defaults paid to true when it is not given", async () => {
    const record = await recordAttendance(deps(), { customerId: 1 });

    // Paying is handing over the whole price — the bridge US-29.3 leaves standing until US-29.4
    // takes the amount from the staff member instead.
    expect(record.paidCents).toBe(300);
  });

  it("stores nothing handed over when the staff member cleared the flag", async () => {
    const record = await recordAttendance(deps(), { customerId: 1, paid: false });

    expect(record.paidCents).toBe(0);
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
