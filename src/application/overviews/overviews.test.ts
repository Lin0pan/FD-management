import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";
import {
  createCustomerDetails,
  type CustomerStatus,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import {
  createSessionGroups,
  type DistributionSession,
  type SessionSummary,
} from "@/domain/distribution/session";
import type {
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  DistributionSessionRepository,
} from "../ports";
import { listToDos } from "./list-to-dos";
import { readOverviews } from "./read-overviews";

/** Hand-written fakes and synthetic data only; each answers exactly what the two counts read. */

faker.seed(20260929);

const TODAY = new Date("2026-09-29T09:00:00.000Z");
const clock: Clock = { now: () => TODAY };

/**
 * An active household of one grown-up whose card prints `printedGrownUps` of them — so a card is
 * due for reissue exactly when that number is not 1.
 */
function household(id: number, printedGrownUps: number): RegisteredCustomer {
  const self = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: new Date("1980-04-02T00:00:00.000Z"),
  };
  return {
    id,
    customerNumber: 400 + id,
    status: "ACTIVE",
    blockReason: null,
    archiveReason: null,
    archivedAt: null,
    reminderCount: 0,
    details: createCustomerDetails(
      {
        ...self,
        address: {
          street: faker.location.street(),
          houseNumber: faker.location.buildingNumber(),
          zip: faker.location.zipCode("#####"),
          city: faker.location.city(),
        },
        certificate: { type: "Jobcenter", validUntil: new Date("2027-01-31T00:00:00.000Z") },
        householdMembers: [self],
        notes: "",
      },
      TODAY,
    ),
    card: {
      customerNumber: 400 + id,
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: { grownUps: printedGrownUps, children: 0 },
    },
    registeredOn: TODAY,
    previousCustomerId: null,
  };
}

class FakeCustomerRepository implements CustomerRepository {
  constructor(private readonly holders: ReadonlyArray<RegisteredCustomer>) {}

  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve(this.holders.filter((customer) => customer.status === status));
  }

  list(): Promise<never> {
    return Promise.reject(new Error("The counts never browse the register"));
  }
  findById(): Promise<never> {
    return Promise.reject(new Error("The counts never read one household"));
  }
  findByCustomerNumber(): Promise<never> {
    return Promise.reject(new Error("The counts never read one household"));
  }
  takenActiveNumbers(): Promise<never> {
    return Promise.reject(new Error("The counts never allocate a number"));
  }
  groupCounts(): Promise<never> {
    return Promise.reject(new Error("The counts never size a group"));
  }
  searchArchived(): Promise<never> {
    return Promise.reject(new Error("The counts never search the archive"));
  }
  create(): Promise<never> {
    return Promise.reject(new Error("The counts write nothing"));
  }
  updateHousehold(): Promise<never> {
    return Promise.reject(new Error("The counts write nothing"));
  }
  updateDetails(): Promise<never> {
    return Promise.reject(new Error("The counts write nothing"));
  }
  updateNotes(): Promise<never> {
    return Promise.reject(new Error("The counts write nothing"));
  }
  changeCustomerNumber(): Promise<never> {
    return Promise.reject(new Error("The counts write nothing"));
  }
  setStatus(): Promise<never> {
    return Promise.reject(new Error("The counts write nothing"));
  }
  archive(): Promise<never> {
    return Promise.reject(new Error("The counts write nothing"));
  }
}

/** Stamps a discarded session rather than forgetting it, and filters it out, as the adapter does. */
class FakeDistributionSessionRepository implements DistributionSessionRepository {
  private readonly rows: { discarded: boolean; readonly session: DistributionSession }[] = [];

  constructor(...sessions: DistributionSession[]) {
    this.rows.push(...sessions.map((session) => ({ discarded: false, session })));
  }

  private get visible(): ReadonlyArray<DistributionSession> {
    return this.rows.filter((row) => !row.discarded).map((row) => row.session);
  }

  findRunning(): Promise<DistributionSession | null> {
    return Promise.resolve(this.visible.find((session) => session.endedAt === null) ?? null);
  }

  listEnded(): Promise<ReadonlyArray<DistributionSession>> {
    return Promise.resolve(this.visible.filter((session) => session.endedAt !== null).reverse());
  }

  discard(sessionId: number): Promise<void> {
    for (const row of this.rows) {
      row.discarded ||= row.session.id === sessionId;
    }
    return Promise.resolve();
  }

  lastEnded(): Promise<never> {
    return Promise.reject(new Error("The count reads every afternoon, never the last alone"));
  }
  findById(): Promise<never> {
    return Promise.reject(new Error("The count never reads one afternoon"));
  }
  start(): Promise<never> {
    return Promise.reject(new Error("The count writes nothing"));
  }
  end(): Promise<never> {
    return Promise.reject(new Error("The count writes nothing"));
  }
  reopen(): Promise<never> {
    return Promise.reject(new Error("The count writes nothing"));
  }
}

class FakeDistributionRecordRepository implements DistributionRecordRepository {
  summariseBySession(): Promise<ReadonlyMap<number, SessionSummary>> {
    return Promise.resolve(new Map<number, SessionSummary>());
  }

  listForCustomer(): Promise<never> {
    return Promise.reject(new Error("The count never reads a hand-out"));
  }
  listForSession(): Promise<never> {
    return Promise.reject(new Error("The count never reads a hand-out"));
  }
  findById(): Promise<never> {
    return Promise.reject(new Error("The count never reads a hand-out"));
  }
  create(): Promise<never> {
    return Promise.reject(new Error("The count writes nothing"));
  }
  setPayment(): Promise<never> {
    return Promise.reject(new Error("The count writes nothing"));
  }
  remove(): Promise<never> {
    return Promise.reject(new Error("The count writes nothing"));
  }
  freezeSession(): Promise<never> {
    return Promise.reject(new Error("The count writes nothing"));
  }
  thawSession(): Promise<never> {
    return Promise.reject(new Error("The count writes nothing"));
  }
  listFrozen(): Promise<never> {
    return Promise.reject(new Error("The count never reads a hand-out"));
  }
}

function session(id: number, running = false): DistributionSession {
  const startedAt = new Date(Date.UTC(2026, 8, id, 14));
  return {
    id,
    startedAt,
    endedAt: running ? null : new Date(startedAt.getTime() + 3 * 60 * 60 * 1000),
    groups: createSessionGroups(["RED"]),
  };
}

function deps(
  holders: ReadonlyArray<RegisteredCustomer>,
  sessions = new FakeDistributionSessionRepository(),
) {
  return {
    customers: new FakeCustomerRepository(holders),
    clock,
    sessions,
    records: new FakeDistributionRecordRepository(),
  };
}

describe("listToDos", () => {
  it("leaves a to-do off the list when nothing is due", async () => {
    expect(await listToDos(deps([household(1, 1), household(2, 1)]))).toEqual([]);
  });

  it("lists the cards due for reissue with their count", async () => {
    const holders = [household(1, 2), household(2, 1), household(3, 3)];

    expect(await listToDos(deps(holders))).toEqual([{ kind: "CARDS_DUE", count: 2 }]);
  });

  it("counts the cards due exactly as the overview does", async () => {
    const register = deps([household(1, 2), household(2, 1), household(3, 3), household(4, 2)]);

    const [toDos, overviews] = await Promise.all([listToDos(register), readOverviews(register)]);

    expect(toDos).toEqual([{ kind: "CARDS_DUE", count: overviews.cardsDue }]);
  });
});

describe("readOverviews", () => {
  it("shows an overview at zero", async () => {
    expect(await readOverviews(deps([household(1, 1)]))).toEqual({ cardsDue: 0, pastSessions: 0 });
  });

  it("counts the running afternoon among the Ausgabetermine", async () => {
    const sessions = new FakeDistributionSessionRepository(session(1), session(2, true));

    expect((await readOverviews(deps([], sessions))).pastSessions).toBe(2);
  });

  it("counts no discarded afternoon", async () => {
    const sessions = new FakeDistributionSessionRepository(session(1), session(2, true));
    await sessions.discard(2);

    expect((await readOverviews(deps([], sessions))).pastSessions).toBe(1);
  });
});
