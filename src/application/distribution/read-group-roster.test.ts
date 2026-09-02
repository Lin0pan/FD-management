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
import { groupOf, type GroupCounts } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import { berlinDayKey } from "@/domain/distribution/attendance";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import { NoSettingsInForce } from "@/domain/errors";
import type { Cents } from "@/domain/money";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type {
  ArchivedCustomer,
  Clock,
  CustomerListQuery,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "../ports";
import { readGroupRoster } from "./read-group-roster";

/**
 * Hand-written fakes and synthetic data only, per the testing standard.
 *
 * The dates are the reason the clock is pinned: under the seeded anchor `2026-W02` = RED and a
 * Thursday distribution weekday, Thursday 8 January 2026 is a RED distribution day, and Friday
 * 9 January stands in a RED week whose *next* distribution is the BLUE one of the week after.
 */

faker.seed(20260801);

const RED_DISTRIBUTION_DAY = "2026-01-08T09:00:00.000Z";
const EARLIER_ON_THE_RED_DAY = "2026-01-08T07:30:00.000Z";
const THE_RED_DAY_BEFORE = "2026-01-01T09:00:00.000Z";
const DAY_AFTER_A_RED_DISTRIBUTION = "2026-01-09T09:00:00.000Z";

/**
 * The two instants that tell the Berlin day apart from the UTC one. Berlin is an hour ahead in
 * January, so between 23:00Z and midnight the two calendars disagree: `JUST_AFTER_BERLIN_MIDNIGHT`
 * is still 8 January in UTC and already the 9th in Berlin.
 */
const JUST_AFTER_BERLIN_MIDNIGHT = "2026-01-08T23:10:00.000Z";
const HALF_PAST_ELEVEN_UTC = "2026-01-08T23:30:00.000Z";
const AFTERNOON_OF_THE_RED_DAY = "2026-01-08T15:00:00.000Z";

const GROWN_UP = "1985-03-11T00:00:00.000Z";

function fakeClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

class FakeSettingsRepository implements SettingsRepository {
  readonly versions: SettingsVersion[] = [];
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
 * A register that answers `list` the way the adapter is documented to: the status and group applied
 * as filters, and the result ordered by ascending customer number.
 *
 * `writes` counts every mutating call, so a test can prove the walk changed nothing.
 */
class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];
  writes = 0;
  /** The last query the use case built — what the roster's translation of the day is asserted against. */
  lastQuery: CustomerListQuery | null = null;

  list(query: CustomerListQuery): Promise<ReadonlyArray<RegisteredCustomer>> {
    this.lastQuery = query;
    const matches = this.holders.filter((customer) => query.statuses.includes(customer.status));
    return Promise.resolve([...matches].sort((a, b) => a.customerNumber - b.customerNumber));
  }

  groupCounts(): Promise<GroupCounts> {
    const active = this.holders.filter((customer) => customer.status !== "ARCHIVED");
    return Promise.resolve({
      red: active.filter((customer) => groupOf(customer.customerNumber) === "RED").length,
      blue: active.filter((customer) => groupOf(customer.customerNumber) === "BLUE").length,
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

  /** The walk never searches the archive (US-11.1); the method is here because the port has it. */
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
   * The walk edits nothing; the mutating methods are here because the port has them, and each counts
   * as a write so that a test can state that none of them was reached.
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
    return Promise.reject(new Error("a roster reads the register, it never moves a household"));
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

/**
 * The day's hand-outs, filtered the way the adapter is documented to: by the **Berlin** day key, so
 * a test can state which instants count as "today" rather than trusting the use case's own answer.
 *
 * `dayKeysAsked` records every key the use case queried — one per read is what keeps the roster from
 * becoming a query per household.
 */
class FakeDistributionRecordRepository implements DistributionRecordRepository {
  readonly records: DistributionRecord[] = [];
  readonly dayKeysAsked: string[] = [];
  writes = 0;

  constructor(...records: DistributionRecord[]) {
    this.records.push(...records);
  }

  listForCustomer(customerId: number): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.records.filter((record) => record.customerId === customerId));
  }

  listForDay(dayKey: string): Promise<ReadonlyArray<DistributionRecord>> {
    this.dayKeysAsked.push(dayKey);
    return Promise.resolve(this.records.filter((record) => berlinDayKey(record.date) === dayKey));
  }

  findById(recordId: number): Promise<DistributionRecord | null> {
    return Promise.resolve(this.records.find((record) => record.id === recordId) ?? null);
  }

  /**
   * The mutating methods are here because the port has them, and each counts as a write so that a
   * test can state that the roster reached none of them.
   */
  create(record: NewDistributionRecord): Promise<DistributionRecord> {
    this.writes += 1;
    const stored = { ...record, id: this.records.length + 1 };
    this.records.push(stored);
    return Promise.resolve(stored);
  }

  setPayment(recordId: number, paidCents: Cents): Promise<DistributionRecord> {
    this.writes += 1;
    const record = this.records.find((candidate) => candidate.id === recordId);
    if (record === undefined) throw new Error("test fake: no such record");
    const updated = { ...record, paidCents };
    this.records[this.records.indexOf(record)] = updated;
    return Promise.resolve(updated);
  }

  remove(): Promise<void> {
    this.writes += 1;
    return Promise.resolve();
  }
}

/** A hand-out as the store holds it: whose it is, and the instant that decides its Berlin day. */
function recordFor(customerId: number, instant: string, id = customerId): DistributionRecord {
  return {
    id,
    customerId,
    date: new Date(instant),
    showedUp: true,
    paidCents: 400 as Cents,
    priceCents: 400 as Cents,
  };
}

function settingsInput(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return {
    quotaN: 240,
    // 2026-W02 is 5–11 January 2026; Thursday of that week is 8 January 2026.
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
  readonly customerNumber: number;
  readonly status?: CustomerStatus;
  /** The surrogate id, set apart from the number where a test is about which of the two joins. */
  readonly id?: number;
}

/** A customer as the register already holds them — built directly, so the status is the test's to set. */
function customerRecord(overrides: CustomerOverrides): RegisteredCustomer {
  const details: CustomerDetails = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: new Date(GROWN_UP),
    address: { street: "Hauptstraße", houseNumber: "1", zip: "33129", city: "Delbrück" },
    certificate: { type: "Jobcenter", validUntil: new Date("2027-01-31T00:00:00.000Z") },
    householdMembers: [member(GROWN_UP)],
    notes: "",
  };
  const status = overrides.status ?? "ACTIVE";
  return {
    id: overrides.id ?? overrides.customerNumber,
    customerNumber: overrides.customerNumber,
    status,
    blockReason: status === "BLOCKED" ? "gesperrt" : null,
    archiveReason: status === "ARCHIVED" ? "archiviert" : null,
    archivedAt: status === "ARCHIVED" ? new Date(RED_DISTRIBUTION_DAY) : null,
    reminderCount: 0,
    card: {
      customerNumber: overrides.customerNumber,
      index: 1,
      issuedAt: new Date(RED_DISTRIBUTION_DAY),
      reason: "FIRST_ISSUE",
      countsAtIssue: composition(details.householdMembers, new Date(RED_DISTRIBUTION_DAY)),
    },
    registeredOn: new Date(RED_DISTRIBUTION_DAY),
    previousCustomerId: null,
    details,
  };
}

describe("readGroupRoster", () => {
  let customers: FakeCustomerRepository;
  let settings: FakeSettingsRepository;
  let records: FakeDistributionRecordRepository;

  function deps(today = RED_DISTRIBUTION_DAY) {
    return { customers, settings, records, clock: fakeClock(today) };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    settings = new FakeSettingsRepository(version());
    records = new FakeDistributionRecordRepository();
  });

  it("walks today's group on a distribution day", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 40 }),
    );

    const roster = await readGroupRoster(deps(), "");

    expect(roster.group).toBe("RED");
    expect(roster.next).toBe(11);
  });

  it("walks the current week's group, not the next distribution's, on a non-distribution day", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 40 }),
    );

    // Friday 9 January 2026 stands in the RED week 2026-W02, and its next distribution is the
    // Thursday of 2026-W03 — a BLUE one. The walk follows the week it is being read in, which is the
    // colour the banner badges beside the calendar week.
    const roster = await readGroupRoster(deps(DAY_AFTER_A_RED_DISTRIBUTION));

    expect(roster.group).toBe("RED");
    expect(roster.next).toBe(11);
  });

  it("does not walk archived households", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21, status: "ARCHIVED" }),
      customerRecord({ customerNumber: 31 }),
    );

    const roster = await readGroupRoster(deps(), "11");

    expect(roster.next).toBe(31);
  });

  it("walks blocked households", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21, status: "BLOCKED" }),
      customerRecord({ customerNumber: 31 }),
    );

    const roster = await readGroupRoster(deps(), "11");

    expect(roster.next).toBe(21);
  });

  it("asks the register only for the active and blocked households", async () => {
    await readGroupRoster(deps(), "11");

    expect(customers.lastQuery).toEqual({ statuses: ["ACTIVE", "BLOCKED"] });
  });

  it("walks the week's group", async () => {
    // Only the odd numbers are RED, and the week is RED — the register was asked for all four.
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 20 }),
      customerRecord({ customerNumber: 31 }),
      customerRecord({ customerNumber: 40 }),
    );

    const roster = await readGroupRoster(deps(), "");

    expect(roster.group).toBe("RED");
    expect(roster.members.map((member) => member.customerNumber)).toEqual([11, 31]);
  });

  it("positions the walk at the customer number a card number names", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21 }),
      customerRecord({ customerNumber: 31 }),
    );

    const roster = await readGroupRoster(deps(), "21k3");

    expect(roster.previous).toBe(11);
    expect(roster.next).toBe(31);
  });

  it("positions the walk around a number belonging to the other group", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 31 }),
      customerRecord({ customerNumber: 20 }),
    );

    // 20 is even and therefore BLUE — a household of the other week, walked past rather than to.
    const roster = await readGroupRoster(deps(), "20");

    expect(roster.previous).toBe(11);
    expect(roster.next).toBe(31);
  });

  it("walks from the start when the query cannot be read as a number", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21 }),
    );

    const roster = await readGroupRoster(deps(), "Meier");

    expect(roster.previous).toBeNull();
    expect(roster.next).toBe(11);
  });

  it("walks from the start when nothing has been looked up", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21 }),
    );

    const roster = await readGroupRoster(deps());

    expect(roster.previous).toBeNull();
    expect(roster.next).toBe(11);
  });

  it("reports both ends as walked out at the last number of the group", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21 }),
    );

    const roster = await readGroupRoster(deps(), "21");

    expect(roster.previous).toBe(11);
    expect(roster.next).toBeNull();
  });

  it("reports a group holding no active or blocked household as empty", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11, status: "ARCHIVED" }),
      customerRecord({ customerNumber: 40 }),
    );

    const roster = await readGroupRoster(deps(), "11");

    expect(roster.isEmpty).toBe(true);
    expect(roster.previous).toBeNull();
    expect(roster.next).toBeNull();
  });

  it("reports a group holding one household as not empty", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));

    const roster = await readGroupRoster(deps());

    expect(roster.isEmpty).toBe(false);
  });

  it("writes nothing while walking", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));

    await readGroupRoster(deps(), "11");

    expect(customers.writes).toBe(0);
    expect(settings.appended).toBe(0);
  });

  it("refuses to walk before DF has settings in force", async () => {
    settings = new FakeSettingsRepository();

    await expect(readGroupRoster(deps(), "11")).rejects.toThrow(NoSettingsInForce);
  });

  it("names every household of the group, lowest customer number first", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 31 }),
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 40 }),
    );

    const roster = await readGroupRoster(deps());

    expect(roster.members.map((member) => member.customerNumber)).toEqual([11, 31]);
    expect(roster.members[0]).toMatchObject({
      customerId: 11,
      firstName: customers.holders[1].details.firstName,
      lastName: customers.holders[1].details.lastName,
      blocked: false,
    });
  });

  it("counts a member with a record from today as served", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11, EARLIER_ON_THE_RED_DAY));

    const roster = await readGroupRoster(deps());

    expect(roster.members[0].servedToday).toBe(true);
    expect(roster.progress).toEqual({ served: 1, expected: 1 });
  });

  it("does not count a member whose only record is from an earlier distribution", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11, THE_RED_DAY_BEFORE));

    const roster = await readGroupRoster(deps());

    expect(roster.members[0].servedToday).toBe(false);
    expect(roster.progress).toEqual({ served: 0, expected: 1 });
  });

  it("does not count a member with no record at all", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));

    const roster = await readGroupRoster(deps());

    expect(roster.members[0].servedToday).toBe(false);
    expect(roster.progress).toEqual({ served: 0, expected: 1 });
  });

  it("counts a hand-out from just after midnight in Berlin, though UTC still calls it yesterday", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11, JUST_AFTER_BERLIN_MIDNIGHT));

    const roster = await readGroupRoster(deps(DAY_AFTER_A_RED_DISTRIBUTION));

    expect(roster.members[0].servedToday).toBe(true);
  });

  it("does not count yesterday's hand-out at half past eleven, when only Berlin has turned the day", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11, AFTERNOON_OF_THE_RED_DAY));

    const roster = await readGroupRoster(deps(HALF_PAST_ELEVEN_UTC));

    expect(roster.members[0].servedToday).toBe(false);
  });

  it("joins the day's records by the surrogate id, never by the customer number", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11, id: 501 }),
      customerRecord({ customerNumber: 501, id: 10 }),
    );
    records.records.push(recordFor(501, EARLIER_ON_THE_RED_DAY));

    const roster = await readGroupRoster(deps());

    expect(roster.members.map((member) => member.servedToday)).toEqual([true, false]);
  });

  it("keeps a blocked household in the list and out of what was expected", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21, status: "BLOCKED" }),
    );

    const roster = await readGroupRoster(deps());

    expect(roster.members.map((member) => member.blocked)).toEqual([false, true]);
    expect(roster.progress).toEqual({ served: 0, expected: 1 });
  });

  it("ignores the records of customers in the other group", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 40 }),
    );
    records.records.push(recordFor(40, EARLIER_ON_THE_RED_DAY));

    const roster = await readGroupRoster(deps());

    expect(roster.members.map((member) => member.customerNumber)).toEqual([11]);
    expect(roster.progress).toEqual({ served: 0, expected: 1 });
  });

  it("reads the day's hand-outs in one query, whatever the group holds", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21 }),
      customerRecord({ customerNumber: 31 }),
    );

    await readGroupRoster(deps());

    expect(records.dayKeysAsked).toEqual(["2026-01-08"]);
  });

  it("reports a group holding no household as an empty roster with an empty tally", async () => {
    const roster = await readGroupRoster(deps());

    expect(roster.members).toEqual([]);
    expect(roster.progress).toEqual({ served: 0, expected: 0 });
  });

  it("writes no distribution record while reading the roster", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11, EARLIER_ON_THE_RED_DAY));

    await readGroupRoster(deps(), "11");

    expect(records.writes).toBe(0);
  });
});
