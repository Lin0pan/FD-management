import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type { IssuedCard } from "@/domain/card/card";
import type {
  CustomerDetails,
  CustomerStatus,
  HouseholdMemberDetails,
  NewCustomer,
  RegisteredCustomer,
} from "@/domain/customer/customer";
import type { GroupCounts } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import { foldName } from "@/domain/customer/nameSearch";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type {
  ArchivedCustomer,
  Clock,
  CustomerListQuery,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "../ports";
import { listCustomers } from "./list-customers";

/**
 * Hand-written fakes and synthetic data only. The certificate dates are why the clock is fixed: on
 * {@link TODAY}, `2026-08-20` is inside the 30-day window, `2026-10-01` outside it, `2026-07-01` lapsed.
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
 * A register answering `list` as the adapter is documented to. `writes` counts every mutating call,
 * so a test can prove the list changed nothing.
 */
class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];
  writes = 0;
  /** Every query the use case built, in the order it asked them. */
  readonly queries: CustomerListQuery[] = [];

  /**
   * The list's own query — what the translation of the input is asserted against. It is asked
   * first; the second is the register-wide one the occurring counts are read from (US-46.2).
   */
  get lastQuery(): CustomerListQuery | undefined {
    return this.queries.at(0);
  }

  constructor(...holders: RegisteredCustomer[]) {
    this.holders.push(...holders);
  }

  list(query: CustomerListQuery): Promise<ReadonlyArray<RegisteredCustomer>> {
    this.queries.push(query);
    const matches = this.holders.filter(
      (customer) =>
        query.statuses.includes(customer.status) &&
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

  /**
   * Refused rather than answered. The balance is arithmetic over the numbers the register already
   * hands out (`countByGroup`, US-31), so a use case reaching for a stored count is a use case
   * asking a second source for one fact — this is what says so. The method goes with the port in
   * US-31.5.
   */
  groupCounts(): Promise<GroupCounts> {
    return Promise.reject(new Error("the group balance is counted from the numbers (US-31)"));
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

  /** Only {@link changeCustomerNumber}'s own suite moves a household between slots (US-30). */
  changeCustomerNumber(): Promise<IssuedCard> {
    return Promise.reject(
      new Error("the customer list reads the register, it never moves a household"),
    );
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

/** The hand-outs, reduced to the one question the list asks of them (US-45). */
class FakeRecordRepository implements Pick<
  DistributionRecordRepository,
  "latestHandoutByCustomer"
> {
  readonly handouts: Array<{ readonly customerId: number; readonly date: Date }> = [];
  /** How often the latest hand-outs were read — the list must not ask once per row. */
  reads = 0;

  latestHandoutByCustomer(): Promise<ReadonlyMap<number, Date>> {
    this.reads += 1;
    const latest = new Map<number, Date>();
    for (const { customerId, date } of this.handouts) {
      const known = latest.get(customerId);
      if (known === undefined || date > known) latest.set(customerId, date);
    }
    return Promise.resolve(latest);
  }
}

function settingsInput(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return {
    quotaN: 240,
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

/** A household of `grownUps` adults and `children` children as of {@link TODAY}. */
function household(grownUps: number, children: number): HouseholdMemberDetails[] {
  return [
    ...Array.from({ length: grownUps }, () => member(GROWN_UP)),
    ...Array.from({ length: children }, () => member(CHILD)),
  ];
}

interface CustomerOverrides {
  readonly id?: number;
  readonly customerNumber?: number;
  readonly firstName?: string;
  readonly lastName?: string;
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
      printedAt: null,
    },
    registeredOn: new Date(TODAY),
    previousCustomerId: null,
    details,
  };
}

describe("listCustomers", () => {
  let customers: FakeCustomerRepository;
  let settings: FakeSettingsRepository;
  let records: FakeRecordRepository;

  function deps(today = TODAY) {
    return { customers, settings, records, clock: fakeClock(today) };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    settings = new FakeSettingsRepository(version());
    records = new FakeRecordRepository();
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

  it("narrows the list to one group", async () => {
    // 7 is odd and therefore RED, 8 is even and therefore BLUE — nothing says so on the record
    // (US-31).
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8 }),
    );

    const result = await listCustomers(deps(), { group: "BLUE" });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([8]);
  });

  it("asks the register for both groups and narrows the parity itself", async () => {
    // The register cannot answer "the even ones" — parity is not a column and SQLite has no `% 2`
    // in a `WHERE` clause — so the group is the one criterion the use case applies to the rows it
    // was handed. The fake mirrors the adapter, so a group that reached the query would show up
    // here as a criterion no store can honour.
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8 }),
    );

    await listCustomers(deps(), { group: "BLUE" });

    expect(customers.lastQuery).toEqual({
      statuses: ["ACTIVE", "BLOCKED"],
      search: undefined,
      certificate: undefined,
    });
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

  it("keeps a household served the day before", async () => {
    customers.holders.push(customerRecord({ id: 1, customerNumber: 7 }));
    records.handouts.push({ customerId: 1, date: new Date("2026-06-30T23:59:00.000Z") });

    const result = await listCustomers(deps(), { lastHandoutBefore: new Date("2026-07-01") });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([7]);
  });

  it("drops a household served on the day itself", async () => {
    customers.holders.push(customerRecord({ id: 1, customerNumber: 7 }));
    records.handouts.push({ customerId: 1, date: new Date("2026-07-01T00:00:00.000Z") });

    const result = await listCustomers(deps(), { lastHandoutBefore: new Date("2026-07-01") });

    expect(result.rows).toEqual([]);
  });

  it("judges a household by its latest hand-out, not an earlier one", async () => {
    customers.holders.push(customerRecord({ id: 1, customerNumber: 7 }));
    records.handouts.push(
      { customerId: 1, date: new Date("2026-06-04T13:00:00.000Z") },
      { customerId: 1, date: new Date("2026-07-23T13:00:00.000Z") },
    );

    const result = await listCustomers(deps(), { lastHandoutBefore: new Date("2026-07-01") });

    expect(result.rows).toEqual([]);
  });

  it("never keeps a household never served", async () => {
    customers.holders.push(customerRecord({ id: 1, customerNumber: 7 }));

    const result = await listCustomers(deps(), { lastHandoutBefore: new Date("2099-01-01") });

    expect(result.rows).toEqual([]);
  });

  it("accepts a future day for the latest hand-out", async () => {
    customers.holders.push(customerRecord({ id: 1, customerNumber: 7 }));
    records.handouts.push({ customerId: 1, date: new Date("2026-07-23T13:00:00.000Z") });

    const result = await listCustomers(deps(), { lastHandoutBefore: new Date("2026-12-24") });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([7]);
  });

  it("keeps a certificate ending the day before, not one ending on the day", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, certificateValidUntil: "2026-11-30" }),
      customerRecord({ id: 2, customerNumber: 8, certificateValidUntil: "2026-12-01" }),
    );

    const result = await listCustomers(deps(), { certificateEndsBefore: new Date("2026-12-01") });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([7]);
    expect(customers.lastQuery?.certificate).toEqual({
      before: new Date("2026-12-01T00:00:00.000Z"),
    });
  });

  it("intersects the certificate end with the state, the earlier end winning", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, certificateValidUntil: "2026-07-01" }),
      customerRecord({ id: 2, customerNumber: 8, certificateValidUntil: "2026-08-20" }),
      customerRecord({ id: 3, customerNumber: 9, certificateValidUntil: "2026-10-01" }),
    );

    const result = await listCustomers(deps(), {
      certificate: "VALID",
      certificateEndsBefore: new Date("2026-09-01"),
    });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([8]);
  });

  it("combines both day filters with each other and with the group", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, certificateValidUntil: "2026-08-20" }),
      customerRecord({ id: 2, customerNumber: 8, certificateValidUntil: "2026-08-20" }),
      customerRecord({ id: 3, customerNumber: 10, certificateValidUntil: "2026-08-20" }),
      customerRecord({ id: 4, customerNumber: 12, certificateValidUntil: "2027-01-31" }),
    );
    records.handouts.push(
      { customerId: 1, date: new Date("2026-06-04T13:00:00.000Z") },
      { customerId: 2, date: new Date("2026-06-11T13:00:00.000Z") },
      { customerId: 3, date: new Date("2026-07-23T13:00:00.000Z") },
      { customerId: 4, date: new Date("2026-06-11T13:00:00.000Z") },
    );

    const result = await listCustomers(deps(), {
      group: "BLUE",
      lastHandoutBefore: new Date("2026-07-01"),
      certificateEndsBefore: new Date("2026-09-01"),
    });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([8]);
    expect(result.groupCounts).toEqual({ red: 1, blue: 3 });
  });

  it("lists the children counts that occur, ascending", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, householdMembers: household(1, 3) }),
      customerRecord({ id: 2, customerNumber: 8, householdMembers: household(2, 0) }),
      customerRecord({ id: 3, customerNumber: 9, householdMembers: household(1, 3) }),
      customerRecord({ id: 4, customerNumber: 10, householdMembers: household(3, 1) }),
    );

    const result = await listCustomers(deps(), {});

    expect(result.childCounts).toEqual([0, 1, 3]);
    expect(result.grownUpCounts).toEqual([1, 2, 3]);
  });

  it("leaves archived households out of the listed counts unless they are shown", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, householdMembers: household(1, 0) }),
      customerRecord({
        id: 2,
        customerNumber: 8,
        status: "BLOCKED",
        householdMembers: household(2, 1),
      }),
      customerRecord({
        id: 3,
        customerNumber: 9,
        status: "ARCHIVED",
        householdMembers: household(4, 7),
      }),
    );

    const hidden = await listCustomers(deps(), {});
    const shown = await listCustomers(deps(), { includeArchived: true });

    expect(hidden.childCounts).toEqual([0, 1]);
    expect(hidden.grownUpCounts).toEqual([1, 2]);
    expect(shown.childCounts).toEqual([0, 1, 7]);
    expect(shown.grownUpCounts).toEqual([1, 2, 4]);
  });

  it("does not narrow the listed counts by the other filters", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, householdMembers: household(1, 0) }),
      customerRecord({
        id: 2,
        customerNumber: 8,
        lastName: "Brandt",
        certificateValidUntil: "2026-07-01T00:00:00.000Z",
        householdMembers: household(2, 5),
      }),
    );

    const result = await listCustomers(deps(), {
      search: "Brandt",
      status: ["BLOCKED"],
      group: "RED",
      certificate: "EXPIRED",
      lastHandoutBefore: new Date("2026-07-01T00:00:00.000Z"),
      certificateEndsBefore: new Date("2026-06-01T00:00:00.000Z"),
      grownUps: [2],
      children: [5],
    });

    expect(result.rows).toEqual([]);
    expect(result.grownUpCounts).toEqual([1, 2]);
    expect(result.childCounts).toEqual([0, 5]);
  });

  it("reads the listed counts with one more query over the register, not one per household", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8 }),
      customerRecord({ id: 3, customerNumber: 9 }),
    );

    await listCustomers(deps(), { search: "Aalto", includeArchived: true });

    expect(customers.queries).toHaveLength(2);
    expect(customers.queries.at(1)).toEqual({ statuses: ["ACTIVE", "BLOCKED", "ARCHIVED"] });
  });

  it("shows only the ticked counts", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, householdMembers: household(1, 0) }),
      customerRecord({ id: 2, customerNumber: 8, householdMembers: household(2, 1) }),
      customerRecord({ id: 3, customerNumber: 9, householdMembers: household(1, 7) }),
      customerRecord({ id: 4, customerNumber: 10, householdMembers: household(2, 3) }),
    );

    const children = await listCustomers(deps(), { children: [1, 7] });
    const grownUps = await listCustomers(deps(), { grownUps: [2] });

    expect(children.rows.map((row) => row.customerNumber)).toEqual([8, 9]);
    expect(grownUps.rows.map((row) => row.customerNumber)).toEqual([8, 10]);
  });

  it("combines the two count lists with each other and with the other filters", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, householdMembers: household(2, 1) }),
      customerRecord({ id: 2, customerNumber: 8, householdMembers: household(2, 1) }),
      customerRecord({ id: 3, customerNumber: 9, householdMembers: household(1, 1) }),
      customerRecord({ id: 4, customerNumber: 11, householdMembers: household(2, 0) }),
    );

    const result = await listCustomers(deps(), { grownUps: [2], children: [1], group: "RED" });

    expect(result.rows.map((row) => row.customerNumber)).toEqual([7]);
  });

  it("shows nothing when no count is ticked", async () => {
    // Unlike the status filter, where an empty list means „every status": here staff unticked
    // every box, and an empty table is what they asked for.
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, householdMembers: household(1, 0) }),
      customerRecord({ id: 2, customerNumber: 8, householdMembers: household(2, 1) }),
    );

    const children = await listCustomers(deps(), { children: [] });
    const grownUps = await listCustomers(deps(), { grownUps: [] });

    expect(children.rows).toEqual([]);
    expect(grownUps.rows).toEqual([]);
    expect(children.childCounts).toEqual([0, 1]);
  });

  it("counts a child who turns 13 today as a grown-up", async () => {
    customers.holders.push(
      customerRecord({
        id: 1,
        customerNumber: 7,
        householdMembers: [member(GROWN_UP), member("2013-07-29T00:00:00.000Z")],
      }),
      customerRecord({
        id: 2,
        customerNumber: 8,
        householdMembers: [member(GROWN_UP), member("2013-07-30T00:00:00.000Z")],
      }),
    );

    const grownUps = await listCustomers(deps(), { grownUps: [2] });
    const children = await listCustomers(deps(), { children: [1] });

    expect(grownUps.rows.map((row) => row.customerNumber)).toEqual([7]);
    expect(children.rows.map((row) => row.customerNumber)).toEqual([8]);
    expect(grownUps.grownUpCounts).toEqual([1, 2]);
  });

  it("keeps a filtered count listed after its last household left", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7, householdMembers: household(1, 1) }),
      customerRecord({
        id: 2,
        customerNumber: 8,
        status: "ARCHIVED",
        householdMembers: household(9, 7),
      }),
    );

    const result = await listCustomers(deps(), { children: [1, 7], grownUps: [9] });

    expect(result.childCounts).toEqual([1, 7]);
    expect(result.grownUpCounts).toEqual([1, 9]);
    expect(result.rows.map((row) => row.customerNumber)).toEqual([]);
  });

  it("answers an empty register with no counts to tick", async () => {
    const result = await listCustomers(deps(), {});

    expect(result.grownUpCounts).toEqual([]);
    expect(result.childCounts).toEqual([]);
  });

  it("counts the register's groups off its numbers", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 9 }),
      customerRecord({ id: 3, customerNumber: 8 }),
    );

    const result = await listCustomers(deps(), {});

    expect(result.groupCounts).toEqual({ red: 2, blue: 1 });
  });

  it("counts both groups whatever the list has been filtered to", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 9 }),
      customerRecord({ id: 3, customerNumber: 8 }),
    );

    const result = await listCustomers(deps(), { group: "BLUE" });

    expect(result.rows).toHaveLength(1);
    expect(result.groupCounts).toEqual({ red: 2, blue: 1 });
  });

  it("leaves archived households out of the group balance", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8, status: "ARCHIVED" }),
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
      lastHandoutAt: null,
    });
  });

  it("states each household's latest hand-out, not its first", async () => {
    customers.holders.push(customerRecord({ id: 1, customerNumber: 7 }));
    records.handouts.push(
      { customerId: 1, date: new Date("2026-07-23T13:30:00.000Z") },
      { customerId: 1, date: new Date("2026-07-02T13:10:00.000Z") },
    );

    const [row] = await listCustomers(deps(), {}).then((result) => result.rows);

    expect(row?.lastHandoutAt).toEqual(new Date("2026-07-23T13:30:00.000Z"));
  });

  it("leaves the latest hand-out empty for a household never served", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8 }),
    );
    records.handouts.push({ customerId: 1, date: new Date("2026-07-23T13:30:00.000Z") });

    const rows = await listCustomers(deps(), {}).then((result) => result.rows);

    expect(rows.map((row) => row.lastHandoutAt)).toEqual([
      new Date("2026-07-23T13:30:00.000Z"),
      null,
    ]);
  });

  it("states an archived household's latest hand-out like anyone else's", async () => {
    customers.holders.push(customerRecord({ id: 1, customerNumber: 7, status: "ARCHIVED" }));
    records.handouts.push({ customerId: 1, date: new Date("2026-05-14T12:00:00.000Z") });

    const [row] = await listCustomers(deps(), { includeArchived: true }).then(
      (result) => result.rows,
    );

    expect(row?.lastHandoutAt).toEqual(new Date("2026-05-14T12:00:00.000Z"));
  });

  it("reads the latest hand-outs once for the whole list, not once per row", async () => {
    customers.holders.push(
      customerRecord({ id: 1, customerNumber: 7 }),
      customerRecord({ id: 2, customerNumber: 8 }),
      customerRecord({ id: 3, customerNumber: 9 }),
    );

    await listCustomers(deps(), {});

    expect(records.reads).toBe(1);
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
