import { beforeEach, describe, expect, it } from "vitest";
import type { CustomerDetails, NewCustomer, RegisteredCustomer } from "@/domain/customer/customer";
import {
  CertificateStillValid,
  CertificateValidUntilInPast,
  CustomerNotFound,
  MissingRequiredField,
  ReminderAlreadyLoggedToday,
} from "@/domain/errors";
import type {
  AuditEntry,
  AuditLog,
  CertificateRepository,
  Clock,
  CustomerRepository,
  ReminderLogEntry,
  ReminderLogRepository,
} from "../ports";
import { recordReminder } from "./record-reminder";
import { renewCertificate } from "./renew-certificate";

/**
 * Hand-written fakes, synthetic data only. `2026-07-23T09:00:00.000Z` is 11:00 in Berlin, so the
 * Berlin day key of "today" is `2026-07-23`; the default certificate lapsed on `2026-06-30`, well
 * before it.
 */

const TODAY = "2026-07-23T09:00:00.000Z";
const TODAY_KEY = "2026-07-23";
const EXPIRED = "2026-06-30T00:00:00.000Z";
const VALID = "2027-01-31T00:00:00.000Z";

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

/** Enforces the per-day constraint like the real adapter, and counts writes to prove refusals wrote nothing. */
class FakeReminderLogRepository implements ReminderLogRepository {
  readonly entries: Array<ReminderLogEntry & { customerId: number }> = [];
  writes = 0;

  constructor(...entries: Array<ReminderLogEntry & { customerId: number }>) {
    this.entries.push(...entries);
  }

  findOnDay(customerId: number, loggedOn: string): Promise<ReminderLogEntry | null> {
    return Promise.resolve(
      this.entries.find((e) => e.customerId === customerId && e.loggedOn === loggedOn) ?? null,
    );
  }

  record(customerId: number, entry: ReminderLogEntry): Promise<void> {
    const clash = this.entries.find(
      (e) => e.customerId === customerId && e.loggedOn === entry.loggedOn,
    );
    if (clash !== undefined) {
      return Promise.reject(new ReminderAlreadyLoggedToday(customerId, entry.loggedOn));
    }
    this.writes += 1;
    this.entries.push({ customerId, ...entry });
    return Promise.resolve();
  }
}

/** Applies the adapter's transactional contract: stores the renewal and resets the holder's count to zero. */
class FakeCertificateRepository implements CertificateRepository {
  readonly renewals: Array<{
    customerId: number;
    certificate: { type: string; validUntil: Date };
    recordedAt: Date;
  }> = [];

  constructor(private readonly customers: FakeCustomerRepository) {}

  renew(
    customerId: number,
    certificate: { type: string; validUntil: Date },
    recordedAt: Date,
  ): Promise<void> {
    this.renewals.push({ customerId, certificate, recordedAt });
    const index = this.customers.holders.findIndex((holder) => holder.id === customerId);
    const holder = this.customers.holders[index];
    this.customers.holders[index] = {
      ...holder,
      reminderCount: 0,
      details: { ...holder.details, certificate },
    };
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

interface CustomerOverrides {
  readonly reminderCount?: number;
  readonly validUntil?: string;
}

function customerRecord(overrides: CustomerOverrides = {}): RegisteredCustomer {
  const details: CustomerDetails = {
    firstName: "Mira",
    lastName: "Aalto",
    birthDate: new Date("1985-03-11T00:00:00.000Z"),
    address: { street: "Hauptstraße", houseNumber: "1", zip: "33129", city: "Delbrück" },
    certificate: { type: "Jobcenter", validUntil: new Date(overrides.validUntil ?? EXPIRED) },
    householdMembers: [
      { firstName: "Mira", lastName: "Aalto", birthDate: new Date("1985-03-11T00:00:00.000Z") },
    ],
    notes: "",
  };
  return {
    id: 1,
    customerNumber: 50,
    group: "RED",
    status: "ACTIVE",
    reminderCount: overrides.reminderCount ?? 0,
    card: { index: 1, issuedAt: new Date(TODAY), reason: "FIRST_ISSUE" },
    details,
  };
}

describe("recordReminder", () => {
  let customers: FakeCustomerRepository;
  let reminders: FakeReminderLogRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { customers, reminders, audit, clock: fakeClock(today) };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository(customerRecord());
    reminders = new FakeReminderLogRepository();
    audit = new FakeAuditLog();
  });

  it("logs the first reminder for an expired certificate and returns the new count of one", async () => {
    const count = await recordReminder(deps(), { customerId: 1 });

    expect(count).toBe(1);
    expect(reminders.entries).toEqual([{ customerId: 1, loggedOn: TODAY_KEY, resultingCount: 1 }]);
  });

  it("rejects a second reminder on the same calendar day, and writes nothing", async () => {
    reminders = new FakeReminderLogRepository({
      customerId: 1,
      loggedOn: TODAY_KEY,
      resultingCount: 1,
    });
    customers = new FakeCustomerRepository(customerRecord({ reminderCount: 1 }));

    const error = await recordReminder(deps(), { customerId: 1 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ReminderAlreadyLoggedToday);
    expect((error as ReminderAlreadyLoggedToday).loggedOn).toBe(TODAY_KEY);
    expect(reminders.writes).toBe(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("logs again on the next day — the second reminder returns a count of two", async () => {
    reminders = new FakeReminderLogRepository({
      customerId: 1,
      loggedOn: "2026-07-22",
      resultingCount: 1,
    });
    customers = new FakeCustomerRepository(customerRecord({ reminderCount: 1 }));

    const count = await recordReminder(deps(), { customerId: 1 });

    expect(count).toBe(2);
    expect(reminders.entries).toContainEqual({
      customerId: 1,
      loggedOn: TODAY_KEY,
      resultingCount: 2,
    });
  });

  it("counts the day in Berlin: after local midnight a reminder belongs to the new day", async () => {
    // 22:30 UTC on the 22nd is 00:30 on the 23rd in Berlin — yesterday's entry does not block it.
    reminders = new FakeReminderLogRepository({
      customerId: 1,
      loggedOn: "2026-07-22",
      resultingCount: 1,
    });
    customers = new FakeCustomerRepository(customerRecord({ reminderCount: 1 }));

    const count = await recordReminder(deps("2026-07-22T22:30:00.000Z"), { customerId: 1 });

    expect(count).toBe(2);
    expect(reminders.entries).toContainEqual({
      customerId: 1,
      loggedOn: "2026-07-23",
      resultingCount: 2,
    });
  });

  it("rejects a reminder while the certificate is still valid, and writes nothing", async () => {
    customers = new FakeCustomerRepository(customerRecord({ validUntil: VALID }));

    const error = await recordReminder(deps(), { customerId: 1 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CertificateStillValid);
    expect((error as CertificateStillValid).validUntil).toEqual(new Date(VALID));
    expect(reminders.writes).toBe(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("still refuses on the validUntil day itself — the certificate is valid through its last day", async () => {
    customers = new FakeCustomerRepository(customerRecord({ validUntil: TODAY }));

    await expect(recordReminder(deps(), { customerId: 1 })).rejects.toBeInstanceOf(
      CertificateStillValid,
    );
  });

  it("refuses an unknown customer id rather than logging a reminder for nobody", async () => {
    await expect(recordReminder(deps(), { customerId: 404 })).rejects.toBeInstanceOf(
      CustomerNotFound,
    );
    expect(reminders.writes).toBe(0);
  });

  it("writes an audit entry that records the resulting count", async () => {
    await recordReminder(deps(), { customerId: 1 });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      what: "customer.reminder.logged",
      changedFields: ["reminderCount"],
      when: new Date(TODAY),
      why: "reminderCount=1",
    });
    expect(audit.entries[0]).not.toHaveProperty("who");
  });
});

describe("renewCertificate", () => {
  let customers: FakeCustomerRepository;
  let certificates: FakeCertificateRepository;
  let audit: FakeAuditLog;

  function deps(today = TODAY) {
    return { customers, certificates, audit, clock: fakeClock(today) };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository(customerRecord({ reminderCount: 3 }));
    certificates = new FakeCertificateRepository(customers);
    audit = new FakeAuditLog();
  });

  it("records the renewed certificate and resets a reminder count of three to zero", async () => {
    await renewCertificate(deps(), {
      customerId: 1,
      type: "Jobcenter",
      validUntil: new Date(VALID),
    });

    expect(certificates.renewals).toEqual([
      {
        customerId: 1,
        certificate: { type: "Jobcenter", validUntil: new Date(VALID) },
        recordedAt: new Date(TODAY),
      },
    ]);
    expect(customers.holders[0].reminderCount).toBe(0);
  });

  it("accepts a validUntil of today — the certificate is valid through its last day", async () => {
    await renewCertificate(deps(), {
      customerId: 1,
      type: "Sozialamt",
      validUntil: new Date(TODAY),
    });

    expect(certificates.renewals).toHaveLength(1);
  });

  it("rejects a validUntil in the past, and records nothing", async () => {
    const error = await renewCertificate(deps(), {
      customerId: 1,
      type: "Jobcenter",
      validUntil: new Date("2026-07-22T00:00:00.000Z"),
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CertificateValidUntilInPast);
    expect((error as CertificateValidUntilInPast).validUntil).toEqual(
      new Date("2026-07-22T00:00:00.000Z"),
    );
    expect(certificates.renewals).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
    expect(customers.holders[0].reminderCount).toBe(3);
  });

  it("rejects a blank certificate type — a renewal without a kind is a data-entry mistake", async () => {
    const error = await renewCertificate(deps(), {
      customerId: 1,
      type: "   ",
      validUntil: new Date(VALID),
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MissingRequiredField);
    expect((error as MissingRequiredField).field).toBe("certificate.type");
    expect(certificates.renewals).toHaveLength(0);
  });

  it("refuses an unknown customer id rather than renewing a certificate for nobody", async () => {
    await expect(
      renewCertificate(deps(), { customerId: 404, type: "Jobcenter", validUntil: new Date(VALID) }),
    ).rejects.toBeInstanceOf(CustomerNotFound);
    expect(certificates.renewals).toHaveLength(0);
  });

  it("writes an audit entry with no reason required — the changed fields already say it", async () => {
    await renewCertificate(deps(), {
      customerId: 1,
      type: "Jobcenter",
      validUntil: new Date(VALID),
    });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      what: "customer.certificate.renewed",
      changedFields: ["certificate.type", "certificate.validUntil", "reminderCount"],
      when: new Date(TODAY),
      why: "",
    });
    expect(audit.entries[0]).not.toHaveProperty("who");
  });
});
