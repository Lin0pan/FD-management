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
import { groupOf, type Group, type GroupCounts } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import { createSessionGroups, type DistributionSession } from "@/domain/distribution/session";
import { NoDistributionSessionRunning } from "@/domain/errors";
import type { Cents } from "@/domain/money";
import type {
  ArchivedCustomer,
  CustomerListQuery,
  CustomerRepository,
  DistributionRecordRepository,
  DistributionSessionRepository,
} from "../ports";
import { readGroupRoster } from "./read-group-roster";

/**
 * Hand-written fakes and synthetic data only. **No clock and no settings**: since US-34.6 the
 * roster is the running session's, so nothing here turns on which day it is read on. The instants
 * below are only the moments hand-outs were recorded at.
 */

faker.seed(20260801);

const RED_DISTRIBUTION_DAY = "2026-01-08T09:00:00.000Z";
const EARLIER_ON_THE_RED_DAY = "2026-01-08T07:30:00.000Z";
const THE_RED_DAY_BEFORE = "2026-01-01T09:00:00.000Z";

/**
 * An afternoon that has run past Berlin midnight: still the same session, and the tally still counts
 * what it handed out — the calendar has stopped deciding anything here (US-34).
 */
const JUST_AFTER_BERLIN_MIDNIGHT = "2026-01-08T23:10:00.000Z";
const AFTERNOON_OF_THE_RED_DAY = "2026-01-08T15:00:00.000Z";

/** The session being read, and an earlier one whose hand-outs this tally must leave alone. */
const SESSION_ID = 12;
const EARLIER_SESSION_ID = 11;

const GROWN_UP = "1985-03-11T00:00:00.000Z";

/**
 * A register that answers `list` as the adapter is documented to. `writes` counts every mutating
 * call, so a test can prove the roster changed nothing.
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

  /** The roster never searches the archive (US-11.1); the method is here because the port has it. */
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
   * The roster edits nothing; the mutating methods are here because the port has them, and each counts
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
 * The session's hand-outs, filtered by `sessionId` as the adapter is. `sessionsAsked` records every
 * session queried — one per read is what keeps the roster from becoming a query per household.
 */
class FakeDistributionRecordRepository implements DistributionRecordRepository {
  readonly records: DistributionRecord[] = [];
  readonly sessionsAsked: number[] = [];
  writes = 0;

  constructor(...records: DistributionRecord[]) {
    this.records.push(...records);
  }

  listForCustomer(customerId: number): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.records.filter((record) => record.customerId === customerId));
  }

  listForSession(sessionId: number): Promise<ReadonlyArray<DistributionRecord>> {
    this.sessionsAsked.push(sessionId);
    return Promise.resolve(this.records.filter((record) => record.sessionId === sessionId));
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
  freezeSession(): Promise<void> {
    return Promise.reject(new Error("Freezing an afternoon has a suite of its own"));
  }

  thawSession(): Promise<void> {
    return Promise.reject(new Error("Thawing an afternoon has a suite of its own"));
  }
}

/**
 * The afternoon a test states: which groups it serves, or `null` for between two of them. The
 * default serves RED alone, which is what most of these rules are about.
 */
function session(groups: ReadonlyArray<Group> = ["RED"]): DistributionSession {
  return {
    id: SESSION_ID,
    startedAt: new Date(RED_DISTRIBUTION_DAY),
    endedAt: null,
    groups: createSessionGroups(groups),
  };
}

/** A session that is running while the roster is read; `null` stands for between two afternoons. */
class FakeDistributionSessionRepository implements DistributionSessionRepository {
  constructor(private readonly running: DistributionSession | null = session()) {}

  findRunning(): Promise<DistributionSession | null> {
    return Promise.resolve(this.running);
  }

  lastEnded(): Promise<DistributionSession | null> {
    return Promise.resolve(null);
  }

  listEnded(): Promise<ReadonlyArray<DistributionSession>> {
    return Promise.reject(new Error("counting missed afternoons has a suite of its own"));
  }

  findById(): Promise<DistributionSession | null> {
    return Promise.resolve(this.running);
  }

  start(): Promise<DistributionSession> {
    return Promise.reject(new Error("The roster is a read; it starts nothing"));
  }

  end(): Promise<void> {
    return Promise.reject(new Error("The roster is a read; it ends nothing"));
  }

  discard(): Promise<void> {
    return Promise.reject(new Error("The roster is a read; it discards nothing"));
  }

  reopen(): Promise<void> {
    return Promise.reject(new Error("The roster is a read; it reopens nothing"));
  }
}

/** A hand-out as the store holds it: whose it is, which afternoon it belongs to, and when. */
function recordFor(
  customerId: number,
  instant: string,
  id = customerId,
  sessionId = SESSION_ID,
): DistributionRecord {
  return {
    id,
    customerId,
    sessionId,
    date: new Date(instant),
    showedUp: true,
    paidCents: 400 as Cents,
    priceCents: 400 as Cents,
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
  let records: FakeDistributionRecordRepository;
  let sessions: FakeDistributionSessionRepository;

  function deps() {
    return { customers, records, sessions };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    records = new FakeDistributionRecordRepository();
    sessions = new FakeDistributionSessionRepository();
  });

  it("refuses the roster with no session running — there is nothing to count against", async () => {
    sessions = new FakeDistributionSessionRepository(null);

    await expect(readGroupRoster(deps())).rejects.toBeInstanceOf(NoDistributionSessionRunning);
  });

  it("names the groups the session serves, and only the households in them", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 20 }),
      customerRecord({ customerNumber: 31 }),
      customerRecord({ customerNumber: 40 }),
    );

    const roster = await readGroupRoster(deps());

    expect(roster.groups).toEqual(["RED"]);
    expect(roster.members.map((member) => member.customerNumber)).toEqual([11, 31]);
  });

  it("covers both groups at a merged session", async () => {
    sessions = new FakeDistributionSessionRepository(session(["RED", "BLUE"]));
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 20 }),
      customerRecord({ customerNumber: 31 }),
    );
    records.records.push(recordFor(20, EARLIER_ON_THE_RED_DAY));

    const roster = await readGroupRoster(deps());

    expect(roster.groups).toEqual(["RED", "BLUE"]);
    expect(roster.members.map((member) => member.customerNumber)).toEqual([11, 20, 31]);
    // Per group and never merged: „1 von 1" beside „0 von 2" is what shows RED falling behind,
    // which the merged „1 von 3" hides.
    expect(roster.tallies).toEqual([
      { group: "RED", progress: { served: 0, expected: 2 } },
      { group: "BLUE", progress: { served: 1, expected: 1 } },
    ]);
  });

  it("tallies the served group alone when the session serves one", async () => {
    sessions = new FakeDistributionSessionRepository(session(["BLUE"]));
    customers.holders.push(
      customerRecord({ customerNumber: 20 }),
      customerRecord({ customerNumber: 31 }),
    );

    const roster = await readGroupRoster(deps());

    expect(roster.members.map((member) => member.customerNumber)).toEqual([20]);
    expect(roster.tallies).toEqual([{ group: "BLUE", progress: { served: 0, expected: 1 } }]);
  });

  it("names each household's own group, so the screen need not work out the parity", async () => {
    sessions = new FakeDistributionSessionRepository(session(["RED", "BLUE"]));
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 20 }),
    );

    const roster = await readGroupRoster(deps());

    expect(roster.members.map((member) => member.group)).toEqual(["RED", "BLUE"]);
  });

  it("leaves archived households out of the group", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21, status: "ARCHIVED" }),
      customerRecord({ customerNumber: 31 }),
    );

    const roster = await readGroupRoster(deps());

    expect(roster.members.map((member) => member.customerNumber)).toEqual([11, 31]);
  });

  it("asks the register only for the active and blocked households", async () => {
    await readGroupRoster(deps());

    expect(customers.lastQuery).toEqual({ statuses: ["ACTIVE", "BLOCKED"] });
  });

  it("reports an empty group in words — nothing active or blocked in what it serves", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11, status: "ARCHIVED" }),
      customerRecord({ customerNumber: 40 }),
    );

    const roster = await readGroupRoster(deps());

    expect(roster.isEmpty).toBe(true);
    expect(roster.tallies).toEqual([{ group: "RED", progress: { served: 0, expected: 0 } }]);
  });

  it("reports a group holding one household as not empty", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));

    const roster = await readGroupRoster(deps());

    expect(roster.isEmpty).toBe(false);
  });

  it("writes nothing while reading the roster", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));

    await readGroupRoster(deps());

    expect(customers.writes).toBe(0);
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

  it("counts a member with a record from this session as served", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11, EARLIER_ON_THE_RED_DAY));

    const roster = await readGroupRoster(deps());

    expect(roster.members[0].servedInSession).toBe(true);
    expect(roster.tallies[0].progress).toEqual({ served: 1, expected: 1 });
  });

  it("does not count a member whose only record is from an earlier distribution", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11, THE_RED_DAY_BEFORE, 11, EARLIER_SESSION_ID));

    const roster = await readGroupRoster(deps());

    expect(roster.members[0].servedInSession).toBe(false);
    expect(roster.tallies[0].progress).toEqual({ served: 0, expected: 1 });
  });

  it("does not count a member with no record at all", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));

    const roster = await readGroupRoster(deps());

    expect(roster.members[0].servedInSession).toBe(false);
    expect(roster.tallies[0].progress).toEqual({ served: 0, expected: 1 });
  });

  it("counts a hand-out made after midnight, while the same afternoon is still running", async () => {
    // The session is the unit, so an afternoon that overruns is one afternoon — whichever day the
    // calendar has turned to in Berlin or in UTC.
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11, JUST_AFTER_BERLIN_MIDNIGHT));

    const roster = await readGroupRoster(deps());

    expect(roster.members[0].servedInSession).toBe(true);
  });

  it("does not count a hand-out from the session before, held the same calendar day", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11, AFTERNOON_OF_THE_RED_DAY, 11, EARLIER_SESSION_ID));

    const roster = await readGroupRoster(deps());

    expect(roster.members[0].servedInSession).toBe(false);
  });

  it("joins the session's records by the surrogate id, never by the customer number", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11, id: 501 }),
      customerRecord({ customerNumber: 501, id: 10 }),
    );
    records.records.push(recordFor(501, EARLIER_ON_THE_RED_DAY));

    const roster = await readGroupRoster(deps());

    expect(roster.members.map((member) => member.servedInSession)).toEqual([true, false]);
  });

  it("keeps a blocked household in the list and out of what was expected", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21, status: "BLOCKED" }),
    );

    const roster = await readGroupRoster(deps());

    expect(roster.members.map((member) => member.blocked)).toEqual([false, true]);
    expect(roster.tallies[0].progress).toEqual({ served: 0, expected: 1 });
  });

  it("counts a blocked household that already collected", async () => {
    // Blocked at three o'clock, collected at two: dropping it from the denominator alone would let
    // the tally read „2 von 1".
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21, status: "BLOCKED" }),
    );
    records.records.push(
      recordFor(11, EARLIER_ON_THE_RED_DAY),
      recordFor(21, EARLIER_ON_THE_RED_DAY),
    );

    const roster = await readGroupRoster(deps());

    expect(roster.tallies[0].progress).toEqual({ served: 2, expected: 2 });
  });

  it("ignores the records of customers in a group the session does not serve", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 40 }),
    );
    records.records.push(recordFor(40, EARLIER_ON_THE_RED_DAY));

    const roster = await readGroupRoster(deps());

    expect(roster.members.map((member) => member.customerNumber)).toEqual([11]);
    expect(roster.tallies).toEqual([{ group: "RED", progress: { served: 0, expected: 1 } }]);
  });

  it("reads the session's hand-outs in one query, whatever the group holds", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21 }),
      customerRecord({ customerNumber: 31 }),
    );

    await readGroupRoster(deps());

    expect(records.sessionsAsked).toEqual([SESSION_ID]);
  });

  it("reports a group holding no household as an empty roster with an empty tally", async () => {
    const roster = await readGroupRoster(deps());

    expect(roster.members).toEqual([]);
    expect(roster.tallies).toEqual([{ group: "RED", progress: { served: 0, expected: 0 } }]);
  });

  it("writes no distribution record while reading the roster", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11, EARLIER_ON_THE_RED_DAY));

    await readGroupRoster(deps());

    expect(records.writes).toBe(0);
  });
});
