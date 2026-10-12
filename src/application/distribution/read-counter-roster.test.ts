import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type { IssuedCard } from "@/domain/card/card";
import type {
  CustomerDetails,
  CustomerStatus,
  NewCustomer,
  RegisteredCustomer,
} from "@/domain/customer/customer";
import type { Group, GroupCounts } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import { createSessionGroups, type DistributionSession } from "@/domain/distribution/session";
import { NoDistributionSessionRunning, NoSettingsInForce } from "@/domain/errors";
import type { Cents } from "@/domain/money";
import { createSettings, type SettingsVersion } from "@/domain/policy/settings";
import type {
  ArchivedCustomer,
  Clock,
  CustomerListQuery,
  CustomerRepository,
  DistributionRecordRepository,
  DistributionSessionRepository,
  SettingsRepository,
} from "../ports";
import { readCounterRoster } from "./read-counter-roster";

/** Hand-written fakes and synthetic data only; the clock is the afternoon the session runs on. */

faker.seed(20261012);

const RED_DISTRIBUTION_DAY = "2026-01-08T15:00:00.000Z";
const THE_RED_DAY_BEFORE = "2026-01-01T15:00:00.000Z";
const GROWN_UP = "1985-03-11T00:00:00.000Z";

const SESSION_ID = 12;
const EARLIER_SESSION_ID = 11;

class FakeSettingsRepository implements SettingsRepository {
  constructor(private readonly versions: SettingsVersion[]) {}

  listVersions(): Promise<SettingsVersion[]> {
    return Promise.resolve([...this.versions]);
  }

  append(): Promise<void> {
    return Promise.reject(new Error("the roster is a read; it changes no policy"));
  }
}

const IN_FORCE: SettingsVersion = {
  recordedAt: new Date("2026-01-01T00:00:00.000Z"),
  settings: createSettings({
    quotaN: 240,
    pricePerGrownUp: 200,
    pricePerChild: 100,
    priceCap: null,
    eggRule: [],
  }),
};

/** A register answering `list` by status, lowest number first, as the adapter is documented to. */
class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];
  writes = 0;

  list(query: CustomerListQuery): Promise<ReadonlyArray<RegisteredCustomer>> {
    const matches = this.holders.filter((customer) => query.statuses.includes(customer.status));
    return Promise.resolve([...matches].sort((a, b) => a.customerNumber - b.customerNumber));
  }

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

  searchArchived(): Promise<ReadonlyArray<ArchivedCustomer>> {
    return Promise.resolve([]);
  }

  /** The mutating methods are here because the port has them; each counts as a write. */
  create(customer: NewCustomer): Promise<RegisteredCustomer> {
    this.writes += 1;
    return Promise.reject(new Error(`the roster registers nobody (${customer.customerNumber})`));
  }

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

/** The session's hand-outs, filtered by `sessionId` as the adapter is. */
class FakeDistributionRecordRepository implements DistributionRecordRepository {
  readonly records: DistributionRecord[] = [];
  readonly sessionsAsked: number[] = [];
  writes = 0;

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

  create(record: NewDistributionRecord): Promise<DistributionRecord> {
    this.writes += 1;
    return Promise.reject(new Error(`the roster serves nobody (${record.customerId})`));
  }

  setPayment(): Promise<DistributionRecord> {
    this.writes += 1;
    return Promise.reject(new Error("the roster corrects no payment"));
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

  summariseBySession(): Promise<never> {
    return Promise.reject(new Error("The overview of past afternoons has a suite of its own"));
  }

  listFrozen(): Promise<never> {
    return Promise.reject(new Error("Reading a past afternoon back has a suite of its own"));
  }
}

function session(groups: ReadonlyArray<Group> = ["RED"]): DistributionSession {
  return {
    id: SESSION_ID,
    startedAt: new Date(RED_DISTRIBUTION_DAY),
    endedAt: null,
    groups: createSessionGroups(groups),
  };
}

/** A session running while the roster is read; `null` stands for between two afternoons. */
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

function recordFor(customerId: number, sessionId = SESSION_ID): DistributionRecord {
  return {
    id: customerId,
    customerId,
    sessionId,
    date: new Date(sessionId === SESSION_ID ? RED_DISTRIBUTION_DAY : THE_RED_DAY_BEFORE),
    showedUp: true,
    paidCents: 200 as Cents,
    priceCents: 200 as Cents,
  };
}

interface CustomerOverrides {
  readonly customerNumber: number;
  readonly status?: CustomerStatus;
  readonly id?: number;
}

function customerRecord(overrides: CustomerOverrides): RegisteredCustomer {
  const details: CustomerDetails = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: new Date(GROWN_UP),
    address: { street: "Hauptstraße", houseNumber: "1", zip: "33129", city: "Delbrück" },
    certificate: { type: "Jobcenter", validUntil: new Date("2027-01-31T00:00:00.000Z") },
    householdMembers: [
      {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        birthDate: new Date(GROWN_UP),
      },
    ],
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
      printedAt: null,
    },
    registeredOn: new Date(RED_DISTRIBUTION_DAY),
    previousCustomerId: null,
    details,
  };
}

describe("readCounterRoster", () => {
  let customers: FakeCustomerRepository;
  let records: FakeDistributionRecordRepository;
  let sessions: FakeDistributionSessionRepository;
  let settings: FakeSettingsRepository;
  const clock: Clock = { now: () => new Date(RED_DISTRIBUTION_DAY) };

  function deps() {
    return { customers, records, sessions, settings, clock };
  }

  function numbers(rows: ReadonlyArray<{ readonly customerNumber: number }>): number[] {
    return rows.map((row) => row.customerNumber);
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
    records = new FakeDistributionRecordRepository();
    sessions = new FakeDistributionSessionRepository();
    settings = new FakeSettingsRepository([IN_FORCE]);
  });

  it("refuses the roster with no session running — there is nothing to count against", async () => {
    sessions = new FakeDistributionSessionRepository(null);

    await expect(readCounterRoster(deps())).rejects.toBeInstanceOf(NoDistributionSessionRunning);
  });

  it("refuses the roster with no settings in force — the rows are priced", async () => {
    settings = new FakeSettingsRepository([]);

    await expect(readCounterRoster(deps())).rejects.toBeInstanceOf(NoSettingsInForce);
  });

  it("lists only the groups the session serves", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 31 }),
      customerRecord({ customerNumber: 20 }),
      customerRecord({ customerNumber: 11 }),
    );

    const roster = await readCounterRoster(deps());

    expect(roster.groups).toEqual(["RED"]);
    expect(numbers(roster.rows)).toEqual([11, 31]);
    expect(roster.tallies).toEqual([{ group: "RED", progress: { served: 0, expected: 2 } }]);
  });

  it("lists both groups at a merged afternoon", async () => {
    sessions = new FakeDistributionSessionRepository(session(["RED", "BLUE"]));
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 20 }),
      customerRecord({ customerNumber: 31 }),
    );
    records.records.push(recordFor(20));

    const roster = await readCounterRoster(deps());

    expect(numbers(roster.rows)).toEqual([11, 20, 31]);
    expect(roster.tallies).toEqual([
      { group: "RED", progress: { served: 0, expected: 2 } },
      { group: "BLUE", progress: { served: 1, expected: 1 } },
    ]);
  });

  it("leaves archived households off the list", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21, status: "ARCHIVED" }),
    );

    const roster = await readCounterRoster(deps());

    expect(numbers(roster.rows)).toEqual([11]);
  });

  it("keeps blocked households on the list, and out of what was expected", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21, status: "BLOCKED" }),
    );

    const roster = await readCounterRoster(deps());

    expect(roster.rows.map((row) => row.status)).toEqual(["ACTIVE", "BLOCKED"]);
    expect(roster.tallies[0].progress).toEqual({ served: 0, expected: 1 });
  });

  it("marks a household served at this session", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11));

    const roster = await readCounterRoster(deps());

    expect(roster.rows[0].servedInSession).toBe(true);
    expect(roster.tallies[0].progress).toEqual({ served: 1, expected: 1 });
  });

  it("does not mark a household served at an earlier session", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));
    records.records.push(recordFor(11, EARLIER_SESSION_ID));

    const roster = await readCounterRoster(deps());

    expect(roster.rows[0].servedInSession).toBe(false);
    expect(roster.tallies[0].progress).toEqual({ served: 0, expected: 1 });
  });

  it("joins the session's records by the surrogate id, never by the customer number", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11, id: 501 }),
      customerRecord({ customerNumber: 501, id: 10 }),
    );
    records.records.push(recordFor(501));

    const roster = await readCounterRoster(deps());

    expect(roster.rows.map((row) => row.servedInSession)).toEqual([true, false]);
  });

  it("carries the Kundenliste's own row, so the two lists cannot disagree", async () => {
    const holder = customerRecord({ customerNumber: 11 });
    customers.holders.push(holder);

    const roster = await readCounterRoster(deps());

    expect(roster.rows[0]).toMatchObject({
      customerId: 11,
      firstName: holder.details.firstName,
      lastName: holder.details.lastName,
      group: "RED",
      grownUps: 1,
      children: 0,
      priceCents: 200,
      certificateState: "VALID",
      cardNumber: "11k1",
    });
  });

  it("reports a session whose groups hold nobody as empty", async () => {
    customers.holders.push(customerRecord({ customerNumber: 20 }));

    const roster = await readCounterRoster(deps());

    expect(roster.isEmpty).toBe(true);
    expect(roster.tallies).toEqual([{ group: "RED", progress: { served: 0, expected: 0 } }]);
  });

  it("reports a session holding one household as not empty", async () => {
    customers.holders.push(customerRecord({ customerNumber: 11 }));

    const roster = await readCounterRoster(deps());

    expect(roster.isEmpty).toBe(false);
  });

  it("reads the session's hand-outs in one query and writes nothing", async () => {
    customers.holders.push(
      customerRecord({ customerNumber: 11 }),
      customerRecord({ customerNumber: 21 }),
    );

    await readCounterRoster(deps());

    expect(records.sessionsAsked).toEqual([SESSION_ID]);
    expect(customers.writes + records.writes).toBe(0);
  });
});
