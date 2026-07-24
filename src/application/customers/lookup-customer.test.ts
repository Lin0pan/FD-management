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
import { InvalidCardNumber } from "@/domain/errors";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type {
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "../ports";
import { lookupCustomer } from "./lookup-customer";

/**
 * Hand-written fakes, per the testing standard, and synthetic data only. `2026-07-23` falls an even
 * number of weeks from the `2026-W02` anchor, so with a RED anchor it is a RED week — a RED customer
 * is in the right group and a BLUE one is not.
 */

faker.seed(20260723);

const TODAY = "2026-07-23T09:00:00.000Z";

class FakeSettingsRepository implements SettingsRepository {
  readonly versions: SettingsVersion[] = [];
  /** Records a write so a test can prove the counter lookup never made one. */
  appended = 0;

  constructor(...versions: SettingsVersion[]) {
    this.versions.push(...versions);
  }

  listVersions(): Promise<SettingsVersion[]> {
    return Promise.resolve([...this.versions]);
  }

  append(version: SettingsVersion): Promise<void> {
    this.appended += 1;
    this.versions.push(version);
    return Promise.resolve();
  }
}

/**
 * A register that resolves a number the way the counter needs it (US-04.2): the active holder of the
 * slot, and otherwise the most recently archived holder. `writes` counts every mutation so a test
 * can prove the read-only lookup made none.
 */
class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];
  writes = 0;

  constructor(...holders: RegisteredCustomer[]) {
    this.holders.push(...holders);
  }

  findByCustomerNumber(customerNumber: number): Promise<RegisteredCustomer | null> {
    const held = this.holders.filter((customer) => customer.customerNumber === customerNumber);
    const active = held.find((customer) => customer.status !== "ARCHIVED");
    if (active !== undefined) {
      return Promise.resolve(active);
    }
    const archived = held.filter((customer) => customer.status === "ARCHIVED");
    return Promise.resolve(archived.at(-1) ?? null);
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.holders.find((customer) => customer.id === id) ?? null);
  }

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    return Promise.resolve(
      this.holders.filter((c) => c.status !== "ARCHIVED").map((c) => c.customerNumber),
    );
  }

  groupCounts(): Promise<{ red: number; blue: number }> {
    return Promise.resolve({ red: 0, blue: 0 });
  }

  create(customer: NewCustomer): Promise<RegisteredCustomer> {
    this.writes += 1;
    const registered = { ...customer, id: this.holders.length + 1 };
    this.holders.push(registered);
    return Promise.resolve(registered);
  }
}

/**
 * A distribution store the lookup only ever reads from. `writes` counts every mutation so a test can
 * prove the read-only lookup calls no write method on it either, the same guard the customer and
 * settings fakes carry.
 */
class FakeDistributionRecordRepository implements DistributionRecordRepository {
  readonly records: DistributionRecord[] = [];
  writes = 0;

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
    this.writes += 1;
    const stored = { ...record, id: this.records.length + 1 };
    this.records.push(stored);
    return Promise.resolve(stored);
  }

  setPaid(recordId: number, paid: boolean): Promise<DistributionRecord> {
    this.writes += 1;
    const record = this.records.find((candidate) => candidate.id === recordId);
    if (record === undefined) throw new Error("unreachable in these tests");
    const updated = { ...record, paid };
    this.records.splice(this.records.indexOf(record), 1, updated);
    return Promise.resolve(updated);
  }

  remove(recordId: number): Promise<void> {
    this.writes += 1;
    const record = this.records.find((candidate) => candidate.id === recordId);
    if (record !== undefined) this.records.splice(this.records.indexOf(record), 1);
    return Promise.resolve();
  }
}

/** A stored hand-out for customer id 1 on the given instant — the day's record the counter reads. */
function distributionRecord(
  iso: string,
  overrides: Partial<DistributionRecord> = {},
): DistributionRecord {
  return {
    id: 7,
    customerId: 1,
    date: new Date(iso),
    showedUp: true,
    paid: true,
    priceCents: 500,
    ...overrides,
  };
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

/** A grown-up (born well before 2013) and a child, so counts, portions and price are all non-trivial. */
const GROWN_UP = "1985-03-11T00:00:00.000Z";
const CHILD = "2020-06-01T00:00:00.000Z";

interface CustomerOverrides {
  readonly customerNumber?: number;
  readonly group?: Group;
  readonly status?: CustomerStatus;
  readonly cardIndex?: number;
  readonly certificateValidUntil?: string;
  readonly reminderCount?: number;
  readonly notes?: string;
  readonly householdMembers?: ReadonlyArray<HouseholdMemberDetails>;
  readonly id?: number;
}

/** A customer as the register already holds them — built directly so the status is the test's to set. */
function customerRecord(overrides: CustomerOverrides = {}): RegisteredCustomer {
  const details: CustomerDetails = {
    firstName: "Mira",
    lastName: "Aalto",
    birthDate: new Date(GROWN_UP),
    address: { street: "Hauptstraße", houseNumber: "1", zip: "33129", city: "Delbrück" },
    certificate: {
      type: "Jobcenter",
      validUntil: new Date(overrides.certificateValidUntil ?? "2027-01-31T00:00:00.000Z"),
    },
    householdMembers: overrides.householdMembers ?? [member(GROWN_UP)],
    notes: overrides.notes ?? "",
  };
  return {
    id: overrides.id ?? 1,
    customerNumber: overrides.customerNumber ?? 50,
    group: overrides.group ?? "RED",
    status: overrides.status ?? "ACTIVE",
    reminderCount: overrides.reminderCount ?? 0,
    card: { index: overrides.cardIndex ?? 1, issuedAt: new Date(TODAY), reason: "FIRST_ISSUE" },
    details,
  };
}

describe("lookupCustomer", () => {
  let customers: FakeCustomerRepository;
  let settings: FakeSettingsRepository;
  let records: FakeDistributionRecordRepository;

  function deps(today = TODAY) {
    return { customers, settings, records, clock: fakeClock(today) };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    settings = new FakeSettingsRepository(version());
    records = new FakeDistributionRecordRepository();
  });

  it("reports an unassigned number as not found, not as an error", async () => {
    const result = await lookupCustomer(deps(), "50");

    expect(result.verdict.kind).toBe("NOT_FOUND");
    expect(result.customer).toBeNull();
  });

  it("resolves a bare number to the slot's active holder and clears them to serve", async () => {
    customers = new FakeCustomerRepository(customerRecord({ group: "RED" }));

    const result = await lookupCustomer(deps(), "50");

    expect(result.verdict.kind).toBe("CLEAR_TO_SERVE");
    expect(result.customer?.customerNumber).toBe(50);
  });

  it("resolves a bare number to the most recent archived holder when the slot has no active one", async () => {
    customers = new FakeCustomerRepository(
      customerRecord({ id: 1, status: "ARCHIVED", notes: "left town" }),
      customerRecord({ id: 2, status: "ARCHIVED", notes: "current archived holder" }),
    );

    const result = await lookupCustomer(deps(), "50");

    expect(result.verdict.kind).toBe("ARCHIVED");
    expect(result.customer?.notes).toBe("current archived holder");
  });

  it("blocks a blocked customer, ahead of any other reason", async () => {
    customers = new FakeCustomerRepository(customerRecord({ status: "BLOCKED", group: "BLUE" }));

    const result = await lookupCustomer(deps(), "50");

    expect(result.verdict.kind).toBe("BLOCKED");
  });

  it("sends away a customer of the wrong colour for the week", async () => {
    customers = new FakeCustomerRepository(customerRecord({ group: "BLUE" }));

    const result = await lookupCustomer(deps(), "50");

    expect(result.verdict.kind).toBe("WRONG_GROUP");
    if (result.verdict.kind !== "WRONG_GROUP") throw new Error("unreachable");
    expect(result.verdict.group).toBe("BLUE");
    expect(result.verdict.weekColour).toBe("RED");
  });

  it("marks a card whose index is below the current one as outdated", async () => {
    customers = new FakeCustomerRepository(customerRecord({ cardIndex: 3 }));

    const result = await lookupCustomer(deps(), "50k1");

    expect(result.verdict.kind).toBe("OUTDATED_CARD");
    if (result.verdict.kind !== "OUTDATED_CARD") throw new Error("unreachable");
    expect(result.verdict.presented.index).toBe(1);
    expect(result.verdict.current.index).toBe(3);
  });

  it("clears the current card even when a full card number was typed", async () => {
    customers = new FakeCustomerRepository(customerRecord({ cardIndex: 3 }));

    const result = await lookupCustomer(deps(), "50k3");

    expect(result.verdict.kind).toBe("CLEAR_TO_SERVE");
  });

  it("clears an expired certificate to serve, with a reminder rather than a refusal", async () => {
    customers = new FakeCustomerRepository(
      customerRecord({ certificateValidUntil: "2026-07-22T00:00:00.000Z", reminderCount: 2 }),
    );

    const result = await lookupCustomer(deps(), "50");

    expect(result.verdict.kind).toBe("CLEAR_TO_SERVE_CERTIFICATE_EXPIRED");
    if (result.verdict.kind !== "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED")
      throw new Error("unreachable");
    expect(result.verdict.validUntil).toEqual(new Date("2026-07-22T00:00:00.000Z"));
    expect(result.verdict.reminderCount).toBe(2);
  });

  it("derives the counts, portions and price from the household and today's settings", async () => {
    customers = new FakeCustomerRepository(
      customerRecord({ householdMembers: [member(GROWN_UP), member(GROWN_UP), member(CHILD)] }),
    );

    const result = await lookupCustomer(deps(), "50");

    // Two grown-ups and one child under portions 2/1 and price 200/100 per head.
    expect(result.customer?.grownUps).toBe(2);
    expect(result.customer?.children).toBe(1);
    expect(result.customer?.portions).toBe(5);
    expect(result.customer?.priceCents).toBe(500);
  });

  it("counts a member who has since turned 13 as a grown-up, never a stored number", async () => {
    customers = new FakeCustomerRepository(
      customerRecord({ householdMembers: [member("2013-08-01T00:00:00.000Z")] }),
    );

    const result = await lookupCustomer(deps("2026-08-01T09:00:00.000Z"), "50");

    expect(result.customer?.grownUps).toBe(1);
    expect(result.customer?.children).toBe(0);
  });

  it("carries everything the screen shows below the verdict", async () => {
    customers = new FakeCustomerRepository(
      customerRecord({ cardIndex: 3, reminderCount: 1, notes: "ruft vorher an" }),
    );

    const result = await lookupCustomer(deps(), "50");

    expect(result.customer).toMatchObject({
      firstName: "Mira",
      lastName: "Aalto",
      customerNumber: 50,
      group: "RED",
      status: "ACTIVE",
      reminderCount: 1,
      notes: "ruft vorher an",
      cardNumber: "50k3",
      certificateValidUntil: new Date("2027-01-31T00:00:00.000Z"),
    });
  });

  it("refuses a query that is neither a customer number nor a card number", async () => {
    await expect(lookupCustomer(deps(), "Müller")).rejects.toThrow(InvalidCardNumber);
  });

  it("writes nothing to any repository, on every verdict branch", async () => {
    const branches: ReadonlyArray<readonly [FakeCustomerRepository, string]> = [
      [new FakeCustomerRepository(), "50"], // NOT_FOUND
      [new FakeCustomerRepository(customerRecord({ status: "ARCHIVED" })), "50"], // ARCHIVED
      [new FakeCustomerRepository(customerRecord({ status: "BLOCKED" })), "50"], // BLOCKED
      [new FakeCustomerRepository(customerRecord({ group: "BLUE" })), "50"], // WRONG_GROUP
      [new FakeCustomerRepository(customerRecord({ cardIndex: 3 })), "50k1"], // OUTDATED_CARD
      [
        new FakeCustomerRepository(
          customerRecord({ certificateValidUntil: "2026-07-22T00:00:00.000Z" }),
        ),
        "50",
      ], // CLEAR_TO_SERVE_CERTIFICATE_EXPIRED
      [new FakeCustomerRepository(customerRecord()), "50"], // CLEAR_TO_SERVE
    ];

    for (const [repository, query] of branches) {
      customers = repository;
      settings = new FakeSettingsRepository(version());
      records = new FakeDistributionRecordRepository();
      await lookupCustomer(deps(), query);
      expect(repository.writes).toBe(0);
      expect(settings.appended).toBe(0);
      expect(records.writes).toBe(0);
    }
  });

  it("carries the surrogate id the serve action records against", async () => {
    customers = new FakeCustomerRepository(customerRecord({ id: 42 }));

    const result = await lookupCustomer(deps(), "50");

    expect(result.customerId).toBe(42);
  });

  it("has no surrogate id and no record for an unassigned number", async () => {
    const result = await lookupCustomer(deps(), "50");

    expect(result.customerId).toBeNull();
    expect(result.todaysRecord).toBeNull();
  });

  it("reports no record for today when the customer has none yet", async () => {
    customers = new FakeCustomerRepository(customerRecord({ id: 1 }));
    records = new FakeDistributionRecordRepository(distributionRecord("2026-07-16T09:00:00.000Z"));

    const result = await lookupCustomer(deps(), "50");

    expect(result.todaysRecord).toBeNull();
  });

  it("surfaces today's record — its id, time and paid flag — when one is already on file", async () => {
    customers = new FakeCustomerRepository(customerRecord({ id: 1 }));
    records = new FakeDistributionRecordRepository(
      distributionRecord("2026-07-23T07:30:00.000Z", { id: 7, paid: false }),
    );

    const result = await lookupCustomer(deps(), "50");

    expect(result.todaysRecord).toEqual({
      recordId: 7,
      at: new Date("2026-07-23T07:30:00.000Z"),
      paid: false,
    });
  });
});
