import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  CustomerDetails,
  CustomerStatus,
  HouseholdMemberDetails,
  NewCustomer,
  RegisteredCustomer,
} from "@/domain/customer/customer";
import type { Group, GroupCounts } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import { foldName } from "@/domain/customer/nameSearch";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type {
  ArchivedCustomer,
  Clock,
  CustomerListQuery,
  CustomerRepository,
  SettingsRepository,
} from "../ports";
import { listCustomers } from "./list-customers";

/**
 * Hand-written fakes and synthetic data only, per the testing standard.
 *
 * The certificate dates are the reason the clock is fixed: on {@link TODAY} a certificate ending
 * `2026-08-20` is inside the 30-day window, `2026-10-01` is outside it, and `2026-07-01` has lapsed.
 */

faker.seed(20260729);

const TODAY = "2026-07-29T09:00:00.000Z";

const GROWN_UP = "1985-03-11T00:00:00.000Z";
const CHILD = "2020-06-01T00:00:00.000Z";

function fakeClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

class FakeSettingsRepository implements SettingsRepository {
  readonly versions: SettingsVersion[] = [];
  /** How often the history was read — the list must not ask once per row. */
  reads = 0;
  appended = 0;

  constructor(...versions: SettingsVersion[]) {
    this.versions.push(...versions);
  }

  listVersions(): Promise<SettingsVersion[]> {
    this.reads += 1;
    return Promise.resolve([...this.versions]);
  }

  append(version: SettingsVersion): Promise<void> {
    this.appended += 1;
    this.versions.push(version);
    return Promise.resolve();
  }
}

/**
 * A register that answers `list` the way the adapter is documented to: every criterion applied as a
 * filter, names compared folded, and the result ordered by ascending customer number.
 *
 * `writes` counts every mutating call, so a test can prove the list changed nothing.
 */
class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];
  writes = 0;
  /** The last query the use case built — what the translation of the input is asserted against. */
  lastQuery: CustomerListQuery | null = null;

  constructor(...holders: RegisteredCustomer[]) {
    this.holders.push(...holders);
  }

  list(query: CustomerListQuery): Promise<ReadonlyArray<RegisteredCustomer>> {
    this.lastQuery = query;
    const matches = this.holders.filter(
      (customer) =>
        query.statuses.includes(customer.status) &&
        (query.group === undefined || customer.group === query.group) &&
        this.matchesSearch(customer, query) &&
        this.matchesCertificate(customer, query),
    );
    return Promise.resolve([...matches].sort((a, b) => a.customerNumber - b.customerNumber));
  }

  private matchesSearch(customer: RegisteredCustomer, query: CustomerListQuery): boolean {
    const { search } = query;
    if (search === undefined) return true;
    if (search.kind === "CUSTOMER_NUMBER") return customer.customerNumber === search.customerNumber;
    const folded = foldName(search.name);
    return (
      foldName(customer.details.lastName).startsWith(folded) ||
      foldName(customer.details.firstName).startsWith(folded)
    );
  }

  private matchesCertificate(customer: RegisteredCustomer, query: CustomerListQuery): boolean {
    const range = query.certificate;
    if (range === undefined) return true;
    const validUntil = customer.details.certificate.validUntil.getTime();
    return (
      (range.from === undefined || validUntil >= range.from.getTime()) &&
      (range.before === undefined || validUntil < range.before.getTime())
    );
  }

  groupCounts(): Promise<GroupCounts> {
    const active = this.holders.filter((customer) => customer.status !== "ARCHIVED");
    return Promise.resolve({
      red: active.filter((customer) => customer.group === "RED").length,
      blue: active.filter((customer) => customer.group === "BLUE").length,
    });
  }

  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve(this.holders.filter((customer) => customer.status === status));
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.holders.find((customer) => customer.id === id) ?? null);
  }

  findByCustomerNumber(customerNumber: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(
      this.holders.find((customer) => customer.customerNumber === customerNumber) ?? null,
    );
  }

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    return Promise.resolve(
      this.holders
        .filter((customer) => customer.status !== "ARCHIVED")
        .map((customer) => customer.customerNumber),
    );
  }

  /** No use case in this file searches the archive (US-11.1); the method is here because the port has it. */
  searchArchived(): Promise<ReadonlyArray<ArchivedCustomer>> {
    return Promise.resolve([]);
  }

  create(customer: NewCustomer): Promise<RegisteredCustomer> {
    this.writes += 1;
    const registered = {
      ...customer,
      // The store fills the slot in: the card a registration prints is on the number it
      // just took (US-30).
      card: { ...customer.card, customerNumber: customer.customerNumber },
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
   * No use case in this file edits a household (US-16.1); the method is here because the port has
   * it. It still counts as a write — the list reads and never changes a record.
   */
  updateHousehold(): Promise<void> {
    this.writes += 1;
    return Promise.resolve();
  }

  updateDetails(): Promise<void> {
    this.writes += 1;
    return Promise.resolve();
  }

  updateNotes(): Promise<void> {
    this.writes += 1;
    return Promise.resolve();
  }

  setGroup(): Promise<void> {
    this.writes += 1;
    return Promise.resolve();
  }

  setStatus(): Promise<void> {
    this.writes += 1;
    return Promise.resolve();
  }

  archive(): Promise<void> {
    this.writes += 1;
    return Promise.resolve();
  }
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

function version(): SettingsVersion {
  return {
    recordedAt: new Date("2026-01-01T00:00:00.000Z"),
    settings: createSettings(settingsInput()),
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
  readonly customerNumber?: number;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly group?: Group;
  readonly status?: CustomerStatus;
  readonly cardIndex?: number;
  readonly certificateValidUntil?: string;
  readonly reminderCount?: number;
  readonly householdMembers?: ReadonlyArray<HouseholdMemberDetails>;
}

/** A customer as the register already holds them — built directly, so the status is the test's to set. */
function customerRecord(overrides: CustomerOverrides = {}): RegisteredCustomer {
  const details: CustomerDetails = {
    firstName: overrides.firstName ?? "Mira",
    lastName: overrides.lastName ?? "Aalto",
    birthDate: new Date(GROWN_UP),
    address: { street: "Hauptstraße", houseNumber: "1", zip: "33129", city: "Delbrück" },
    certificate: {
      type: "Jobcenter",
      validUntil: new Date(overrides.certificateValidUntil ?? "2027-01-31T00:00:00.000Z"),
    },
    householdMembers: overrides.householdMembers ?? [member(GROWN_UP)],
    notes: "",
  };
  const status = overrides.status ?? "ACTIVE";
  return {
    id: overrides.id ?? 1,
    customerNumber: overrides.customerNumber ?? 50,
    group: overrides.group ?? "RED",
    status,
    blockReason: status === "BLOCKED" ? "gesperrt" : null,
    archiveReason: status === "ARCHIVED" ? "archiviert" : null,
    archivedAt: status === "ARCHIVED" ? new Date(TODAY) : null,
    reminderCount: overrides.reminderCount ?? 0,
    card: {
      customerNumber: overrides.customerNumber ?? 50,
      index: overrides.cardIndex ?? 1,
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

describe("listCustomers", () => {
  let customers: FakeCustomerRepository;
  let settings: FakeSettingsRepository;

  function deps(today = TODAY) {
    return { customers, settings, clock: fakeClock(today) };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    settings = new FakeSettingsRepository(version());
  });

  it("lists the whole register in ascending customer number", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 51 }),
      customerRecord({ id: 2, customerNumber: 12 }),
      customerRecord({ id: 3, customerNumber: 7 }),
    );

    const result = await listCustomers(deps(), {});

    expect(result.rows.map((row) => row.customerNumber)).toEqual([7, 12, 51]);
  });

  it("hides archived customers unless they are asked for", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8, status: "ARCHIVED" }),
    );

    const result = await listCustomers(deps(), {});

    expect(result.rows.map((row) => row.customerNumber)).toEqual([7]);
  });

  it("includes archived customers when includeArchived is switched on", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8, status: "ARCHIVED" }),
    );

    const result = await listCustomers(deps(), { includeArchived: true });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([7, 8]);
  });

  it("includes archived customers when the status filter names ARCHIVED", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8, status: "ARCHIVED" }),
    );

    const result = await listCustomers(deps(), { status: ["ARCHIVED"] });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([8]);
  });

  it("keeps archived customers out of a status filter that does not name them", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, status: "BLOCKED" }),
      customerRecord({ id: 2, customerNumber: 8, status: "ARCHIVED" }),
    );

    const result = await listCustomers(deps(), { status: ["BLOCKED", "ARCHIVED"] });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([7, 8]);
    expect(customers.lastQuery?.statuses).toEqual(["BLOCKED", "ARCHIVED"]);
  });

  it("treats an empty status filter as no status filter at all", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8, status: "BLOCKED" }),
    );

    const result = await listCustomers(deps(), { status: [] });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([7, 8]);
  });

  it("narrows the list to one status", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8, status: "BLOCKED" }),
    );

    const result = await listCustomers(deps(), { status: ["BLOCKED"] });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([8]);
  });

  it("narrows the list to one balancing group", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, group: "RED" }),
      customerRecord({ id: 2, customerNumber: 8, group: "BLUE" }),
    );

    const result = await listCustomers(deps(), { group: "BLUE" });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([8]);
  });

  it("finds a last name typed without its umlaut", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, lastName: "Müller" }),
      customerRecord({ id: 2, customerNumber: 8, lastName: "Schmidt" }),
    );

    const result = await listCustomers(deps(), { search: "mueller" });

    expect(result.rows.map((row) => row.lastName)).toEqual(["Müller"]);
  });

  it("finds a first name as readily as a last one", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, firstName: "Jasmin", lastName: "Schmidt" }),
      customerRecord({ id: 2, customerNumber: 8, firstName: "Karl", lastName: "Weber" }),
    );

    const result = await listCustomers(deps(), { search: "Jasmin" });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([7]);
  });

  it("reads a typed customer number as a number rather than as a name", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8 }),
    );

    const result = await listCustomers(deps(), { search: "8" });

    expect(customers.lastQuery?.search).toEqual({ kind: "CUSTOMER_NUMBER", customerNumber: 8 });
    expect(result.rows.map((row) => row.customerNumber)).toEqual([8]);
  });

  it("resolves a card number to the household holding that slot", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 50, cardIndex: 3 }),
      customerRecord({ id: 2, customerNumber: 51 }),
    );

    const result = await listCustomers(deps(), { search: "50k3" });

    expect(result.rows.map((row) => row.cardNumber)).toEqual(["50k3"]);
  });

  it("resolves a card number to its holder whatever index was typed", async () => {
    customers.holders.push(customerRecord({ id: 1, customerNumber: 50, cardIndex: 3 }));

    const result = await listCustomers(deps(), { search: "50k1" });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([50]);
  });

  it("treats a blank search box as no search at all", async () => {
    customers.holders.push(customerRecord({ id: 1, customerNumber: 7 }));

    const result = await listCustomers(deps(), { search: "   " });

    expect(customers.lastQuery?.search).toBeUndefined();
    expect(result.rows).toHaveLength(1);
  });

  it("searches for a padded number as a name, so 050 finds nobody instead of customer 50", async () => {
    customers.holders.push(customerRecord({ id: 1, customerNumber: 50 }));

    const result = await listCustomers(deps(), { search: "050" });

    expect(customers.lastQuery?.search).toEqual({ kind: "NAME", name: "050" });
    expect(result.rows).toHaveLength(0);
  });

  it("filters to certificates that have lapsed by today", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, certificateValidUntil: "2026-07-01" }),
      customerRecord({ id: 2, customerNumber: 8, certificateValidUntil: "2026-08-20" }),
    );

    const result = await listCustomers(deps(), { certificate: "EXPIRED" });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([7]);
  });

  it("filters to certificates lapsing within the next 30 days", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, certificateValidUntil: "2026-07-01" }),
      customerRecord({ id: 2, customerNumber: 8, certificateValidUntil: "2026-08-20" }),
      customerRecord({ id: 3, customerNumber: 9, certificateValidUntil: "2026-10-01" }),
    );

    const result = await listCustomers(deps(), { certificate: "EXPIRING_SOON" });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([8]);
  });

  it("counts a certificate expiring soon as valid, because the household may still shop", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, certificateValidUntil: "2026-07-01" }),
      customerRecord({ id: 2, customerNumber: 8, certificateValidUntil: "2026-08-20" }),
      customerRecord({ id: 3, customerNumber: 9, certificateValidUntil: "2026-10-01" }),
    );

    const result = await listCustomers(deps(), { certificate: "VALID" });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([8, 9]);
  });

  it("reads the certificate window from the injected clock, not from a stored state", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, certificateValidUntil: "2026-08-20" }),
    );

    const before = await listCustomers(deps("2026-07-01T09:00:00.000Z"), {
      certificate: "EXPIRING_SOON",
    });
    const after = await listCustomers(deps("2026-08-01T09:00:00.000Z"), {
      certificate: "EXPIRING_SOON",
    });

    expect(before.rows).toHaveLength(0);
    expect(after.rows).toHaveLength(1);
  });

  it("labels each row with the state of its certificate today", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, certificateValidUntil: "2026-07-01" }),
      customerRecord({ id: 2, customerNumber: 8, certificateValidUntil: "2026-08-20" }),
      customerRecord({ id: 3, customerNumber: 9, certificateValidUntil: "2026-10-01" }),
    );

    const result = await listCustomers(deps(), {});

    expect(result.rows.map((row) => row.certificateState)).toEqual([
      "EXPIRED",
      "EXPIRING_SOON",
      "VALID",
    ]);
  });

  it("counts both groups whatever the list has been filtered to", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, group: "RED" }),
      customerRecord({ id: 2, customerNumber: 8, group: "RED" }),
      customerRecord({ id: 3, customerNumber: 9, group: "BLUE" }),
    );

    const result = await listCustomers(deps(), { group: "BLUE" });

    expect(result.rows).toHaveLength(1);
    expect(result.groupCounts).toEqual({ red: 2, blue: 1 });
  });

  it("leaves archived households out of the group balance", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, group: "RED" }),
      customerRecord({ id: 2, customerNumber: 8, group: "BLUE", status: "ARCHIVED" }),
    );

    const result = await listCustomers(deps(), { includeArchived: true });

    expect(result.rows).toHaveLength(2);
    expect(result.groupCounts).toEqual({ red: 1, blue: 0 });
  });

  it("carries everything a row of the list shows, all of it derived", async () => {
    customers.holders.push(
      customerRecord({
        id: 4,
        customerNumber: 50,
        firstName: "Mira",
        lastName: "Aalto",
        group: "BLUE",
        cardIndex: 3,
        reminderCount: 2,
        certificateValidUntil: "2026-08-20",
        householdMembers: [member(GROWN_UP), member(GROWN_UP), member(CHILD)],
      }),
    );

    const [row] = await listCustomers(deps(), {}).then((result) => result.rows);

    expect(row).toEqual({
      customerId: 4,
      customerNumber: 50,
      firstName: "Mira",
      lastName: "Aalto",
      group: "BLUE",
      status: "ACTIVE",
      grownUps: 2,
      children: 1,
      priceCents: 500,
      certificateValidUntil: new Date("2026-08-20T00:00:00.000Z"),
      certificateState: "EXPIRING_SOON",
      reminderCount: 2,
      cardNumber: "50k3",
    });
  });

  it("reads the settings history once for the whole list, not once per row", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8 }),
      customerRecord({ id: 3, customerNumber: 9 }),
    );

    await listCustomers(deps(), {});

    expect(settings.reads).toBe(1);
  });

  it("answers an empty register with no rows and the group balance still stated", async () => {
    const result = await listCustomers(deps(), { search: "Meier" });

    expect(result.rows).toEqual([]);
    expect(result.groupCounts).toEqual({ red: 0, blue: 0 });
  });

  it("writes nothing — the list is a read and the screen offers no action", async () => {
    customers.holders.push(customerRecord({ id: 1, customerNumber: 7 }));

    await listCustomers(deps(), {});

    expect(customers.writes).toBe(0);
    expect(settings.appended).toBe(0);
  });
});
