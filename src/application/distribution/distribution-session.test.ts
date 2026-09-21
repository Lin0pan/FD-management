import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type { IssuedCard } from "@/domain/card/card";
import type {
  CustomerDetails,
  HouseholdMemberDetails,
  PersonalDetails,
  RegisteredCustomer,
} from "@/domain/customer/customer";
import { composition } from "@/domain/customer/householdComposition";
import type { DistributionRecord } from "@/domain/distribution/distributionRecord";
import type { HandoutReceipt } from "@/domain/distribution/handoutReceipt";
import {
  createSessionGroups,
  type DistributionSession,
  type SessionGroups,
  type SessionSummary,
} from "@/domain/distribution/session";
import {
  CustomerNotFound,
  DistributionSessionAlreadyRunning,
  DistributionSessionNotEmpty,
  DistributionSessionNotReopenable,
  MissingAuditReason,
  MissingRequiredField,
  NoDistributionSessionRunning,
} from "@/domain/errors";
import type { Cents } from "@/domain/money";
import type {
  ArchivedCustomer,
  AuditEntry,
  AuditLog,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  DistributionSessionRepository,
  FrozenHandout,
  ReminderLogEntry,
  ReminderLogRepository,
} from "../ports";
import { discardDistributionSession } from "./discard-distribution-session";
import { endDistributionSession } from "./end-distribution-session";
import { readDistributionSessionState } from "./read-distribution-session-state";
import { reopenDistributionSession } from "./reopen-distribution-session";
import { startDistributionSession } from "./start-distribution-session";

/** Hand-written fakes throughout, per the testing standard — no mocking library. */

faker.seed(20260920);

const STARTED = "2026-01-08T14:00:00.000Z";
const ENDED = "2026-01-08T17:30:00.000Z";
/**
 * 00:30 the next morning in Berlin — the one instant at which an afternoon's end falls on another
 * calendar day than its hand-outs, and therefore the only way a receipt can show that it is taken
 * at the **end** and not when the household stood at the counter.
 */
const ENDED_AFTER_MIDNIGHT = "2026-01-08T23:30:00.000Z";
const LATER = "2026-01-15T14:00:00.000Z";

const GROWN_UP = "1985-03-11T00:00:00.000Z";
const CHILD = "2020-06-01T00:00:00.000Z";
/** A member who turns 13 on 9 January 2026 — a child all afternoon and a grown-up at midnight. */
const CHILD_TURNING_13 = "2013-01-09T00:00:00.000Z";
const CERTIFICATE_UNTIL = "2027-01-31T00:00:00.000Z";

const RUNNING_ID = 12;
const EARLIER_ID = 11;

function fakeClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

function session(overrides: Partial<DistributionSession> = {}): DistributionSession {
  return {
    id: overrides.id ?? RUNNING_ID,
    startedAt: overrides.startedAt ?? new Date(STARTED),
    endedAt: overrides.endedAt ?? null,
    groups: overrides.groups ?? createSessionGroups(["RED"]),
  };
}

/**
 * The register of sessions, stamped rather than deleted exactly as the adapter stamps them: a
 * discarded row stays in `rows` and is filtered out of every read, so a test can prove the store was
 * not asked to forget anything.
 */
interface SessionRow {
  discardedAt: Date | null;
  readonly session: DistributionSession;
}

class FakeDistributionSessionRepository implements DistributionSessionRepository {
  readonly rows: SessionRow[] = [];
  private nextId = 100;

  constructor(...sessions: DistributionSession[]) {
    for (const session of sessions) {
      this.rows.push({ discardedAt: null, session });
    }
  }

  private get visible(): SessionRow[] {
    return this.rows.filter((row) => row.discardedAt === null);
  }

  private require(sessionId: number): SessionRow {
    const row = this.visible.find((one) => one.session.id === sessionId);
    if (row === undefined) {
      throw new Error(`No session ${sessionId}`);
    }
    return row;
  }

  private replace(sessionId: number, endedAt: Date | null): void {
    const row = this.require(sessionId);
    this.rows[this.rows.indexOf(row)] = { ...row, session: { ...row.session, endedAt } };
  }

  findRunning(): Promise<DistributionSession | null> {
    return Promise.resolve(
      this.visible.find((row) => row.session.endedAt === null)?.session ?? null,
    );
  }

  lastEnded(): Promise<DistributionSession | null> {
    const ended = this.visible.filter((row) => row.session.endedAt !== null);
    return Promise.resolve(ended.at(-1)?.session ?? null);
  }

  listEnded(): Promise<ReadonlyArray<DistributionSession>> {
    const ended = this.visible.filter((row) => row.session.endedAt !== null);
    return Promise.resolve([...ended].reverse().map((row) => row.session));
  }

  findById(sessionId: number): Promise<DistributionSession | null> {
    return Promise.resolve(
      this.visible.find((row) => row.session.id === sessionId)?.session ?? null,
    );
  }

  start(groups: SessionGroups, at: Date): Promise<DistributionSession> {
    // The store is the final authority on "one at a time", as the `one_running_session` index is.
    const running = this.visible.find((row) => row.session.endedAt === null);
    if (running !== undefined) {
      return Promise.reject(new DistributionSessionAlreadyRunning(running.session.id));
    }
    const session = { id: this.nextId++, startedAt: at, endedAt: null, groups };
    this.rows.push({ discardedAt: null, session });
    return Promise.resolve(session);
  }

  end(sessionId: number, at: Date): Promise<void> {
    this.replace(sessionId, at);
    return Promise.resolve();
  }

  discard(sessionId: number, at: Date): Promise<void> {
    this.require(sessionId).discardedAt = at;
    return Promise.resolve();
  }

  reopen(sessionId: number): Promise<void> {
    this.replace(sessionId, null);
    return Promise.resolve();
  }
}

class FakeDistributionRecordRepository implements DistributionRecordRepository {
  /** The receipts each afternoon is frozen with, keyed by the session they belong to. */
  readonly frozen = new Map<number, ReadonlyArray<FrozenHandout>>();
  /** Set by the one test that asks what an ending does when the store refuses the freeze. */
  freezeFails = false;

  constructor(private readonly rows: ReadonlyArray<DistributionRecord> = []) {}

  listForCustomer(): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.reject(
      new Error("The session use cases read a whole afternoon, never one household"),
    );
  }

  listForSession(sessionId: number): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.rows.filter((row) => row.sessionId === sessionId));
  }

  findById(): Promise<DistributionRecord | null> {
    return Promise.reject(new Error("Correcting a hand-out has a suite of its own"));
  }

  create(): Promise<DistributionRecord> {
    return Promise.reject(new Error("Recording a hand-out has a suite of its own"));
  }

  setPayment(): Promise<DistributionRecord> {
    return Promise.reject(new Error("Correcting a hand-out has a suite of its own"));
  }

  remove(): Promise<void> {
    return Promise.reject(new Error("Correcting a hand-out has a suite of its own"));
  }
  freezeSession(sessionId: number, receipts: ReadonlyArray<FrozenHandout>): Promise<void> {
    if (this.freezeFails) {
      return Promise.reject(new Error("the store refused the freeze"));
    }
    // `set` rather than a merge, because the adapter drops what the session already carries: a
    // freeze is re-taken whole and never amended.
    this.frozen.set(sessionId, receipts);
    return Promise.resolve();
  }

  thawSession(sessionId: number): Promise<void> {
    this.frozen.delete(sessionId);
    return Promise.resolve();
  }

  summariseBySession(): Promise<ReadonlyMap<number, SessionSummary>> {
    return Promise.reject(new Error("The overview of past afternoons has a suite of its own"));
  }
}

/**
 * The customer register, holding whole households: a receipt is read off the row, so a fake
 * answering with less than the adapter does would prove nothing about what is captured.
 */
class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];

  constructor(...holders: RegisteredCustomer[]) {
    this.holders.push(...holders);
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.holders.find((customer) => customer.id === id) ?? null);
  }

  /** The **active** holder of a slot, which is what "who is on 49 today" asks. */
  findByCustomerNumber(customerNumber: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(
      this.holders.find(
        (customer) => customer.customerNumber === customerNumber && customer.status === "ACTIVE",
      ) ?? null,
    );
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

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    return Promise.reject(new Error("Allocating a number has a suite of its own"));
  }

  listWithStatus(): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.reject(new Error("Reading the register has a suite of its own"));
  }

  list(): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.reject(new Error("The customer list has a suite of its own"));
  }

  searchArchived(): Promise<ReadonlyArray<ArchivedCustomer>> {
    return Promise.reject(new Error("Searching the archive has a suite of its own"));
  }

  create(): Promise<RegisteredCustomer> {
    return Promise.reject(new Error("Registering a customer has a suite of its own"));
  }

  updateHousehold(): Promise<void> {
    return Promise.reject(new Error("Editing a household has a suite of its own"));
  }

  updateNotes(): Promise<void> {
    return Promise.reject(new Error("Editing a note has a suite of its own"));
  }

  changeCustomerNumber(): Promise<IssuedCard> {
    return Promise.reject(new Error("Moving a household has a suite of its own"));
  }

  setStatus(): Promise<void> {
    return Promise.reject(new Error("Blocking a customer has a suite of its own"));
  }
}

class FakeReminderLogRepository implements ReminderLogRepository {
  constructor(private readonly count = 0) {}

  findInSession(): Promise<ReminderLogEntry | null> {
    return Promise.reject(new Error("Logging a reminder has a suite of its own"));
  }

  listForSession(sessionId: number): Promise<ReadonlyArray<ReminderLogEntry>> {
    return Promise.resolve(
      Array.from({ length: this.count }, () => ({ sessionId, resultingCount: 1 })),
    );
  }

  record(): Promise<void> {
    return Promise.reject(new Error("Logging a reminder has a suite of its own"));
  }
}

class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

/**
 * A hand-out in the session under test. The customer it names is its own id, so a register holding
 * households 1 and 2 is the register the afternoon below was served from.
 */
function handout(id: number, paidCents: Cents, sessionId = RUNNING_ID): DistributionRecord {
  return {
    id,
    customerId: id,
    sessionId,
    date: new Date(STARTED),
    showedUp: true,
    paidCents,
    priceCents: 500 as Cents,
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
  readonly householdMembers?: ReadonlyArray<HouseholdMemberDetails>;
  /** The slot the card was printed under, which a move leaves behind (ADR-016). */
  readonly cardCustomerNumber?: number;
}

/** A household in the register: one grown-up and one child on slot 49 unless a test says so. */
function customerRecord(overrides: CustomerOverrides = {}): RegisteredCustomer {
  const customerNumber = overrides.customerNumber ?? 49;
  const details: CustomerDetails = {
    firstName: overrides.firstName ?? "Mira",
    lastName: overrides.lastName ?? "Aalto",
    birthDate: new Date(GROWN_UP),
    address: { street: "Hauptstraße", houseNumber: "1", zip: "33129", city: "Delbrück" },
    certificate: { type: "Jobcenter", validUntil: new Date(CERTIFICATE_UNTIL) },
    householdMembers: overrides.householdMembers ?? [member(GROWN_UP), member(CHILD)],
    notes: "",
  };
  return {
    id: overrides.id ?? 1,
    customerNumber,
    status: "ACTIVE",
    blockReason: null,
    archiveReason: null,
    archivedAt: null,
    reminderCount: 0,
    card: {
      customerNumber: overrides.cardCustomerNumber ?? customerNumber,
      index: 1,
      issuedAt: new Date(STARTED),
      reason: "FIRST_ISSUE",
      countsAtIssue: composition(details.householdMembers, new Date(STARTED)),
    },
    registeredOn: new Date(STARTED),
    previousCustomerId: null,
    details,
  };
}

/** What {@link customerRecord}'s household comes to once frozen — all nine captured values. */
function receipt(overrides: Partial<HandoutReceipt> = {}): HandoutReceipt {
  return {
    customerNumber: 49,
    firstName: "Mira",
    lastName: "Aalto",
    grownUps: 1,
    children: 1,
    cardCustomerNumber: 49,
    cardIndex: 1,
    certificateValidUntil: new Date(CERTIFICATE_UNTIL),
    reminderCount: 0,
    ...overrides,
  };
}

/** The receipts the store holds for one afternoon — empty where it holds none. */
function frozenIn(
  records: FakeDistributionRecordRepository,
  sessionId = RUNNING_ID,
): ReadonlyArray<FrozenHandout> {
  return records.frozen.get(sessionId) ?? [];
}

describe("startDistributionSession", () => {
  let sessions: FakeDistributionSessionRepository;
  let audit: FakeAuditLog;

  beforeEach(() => {
    sessions = new FakeDistributionSessionRepository();
    audit = new FakeAuditLog();
  });

  function deps(at = STARTED) {
    return { sessions, audit, clock: fakeClock(at) };
  }

  it("starts the afternoon at the instant the button was pressed", async () => {
    const started = await startDistributionSession(deps(), { groups: ["BLUE"] });

    expect(started.startedAt).toEqual(new Date(STARTED));
    expect(started.endedAt).toBeNull();
    expect(started.groups).toEqual(["BLUE"]);
    expect(await sessions.findRunning()).toEqual(started);
  });

  it("refuses a second session while one is running", async () => {
    sessions = new FakeDistributionSessionRepository(session());

    await expect(startDistributionSession(deps(), { groups: ["RED"] })).rejects.toBeInstanceOf(
      DistributionSessionAlreadyRunning,
    );
    expect(sessions.rows).toHaveLength(1);
  });

  it("refuses a session that serves no group", async () => {
    await expect(startDistributionSession(deps(), { groups: [] })).rejects.toBeInstanceOf(
      MissingRequiredField,
    );
    expect(sessions.rows).toHaveLength(0);
  });

  it("orders the chosen groups RED before BLUE, whichever way the form sent them", async () => {
    const started = await startDistributionSession(deps(), { groups: ["BLUE", "RED"] });

    expect(started.groups).toEqual(["RED", "BLUE"]);
  });

  it("writes nothing to the log when a session is started", async () => {
    // A session that began and never ended is nowhere in the log: the entry is written at the end,
    // where it can name both instants at once (US-34, FR-13).
    await startDistributionSession(deps(), { groups: ["RED"] });

    expect(audit.entries).toHaveLength(0);
  });
});

describe("discardDistributionSession", () => {
  let sessions: FakeDistributionSessionRepository;
  let records: FakeDistributionRecordRepository;
  let reminders: FakeReminderLogRepository;
  let audit: FakeAuditLog;

  beforeEach(() => {
    sessions = new FakeDistributionSessionRepository(session());
    records = new FakeDistributionRecordRepository();
    reminders = new FakeReminderLogRepository();
    audit = new FakeAuditLog();
  });

  function deps() {
    return { sessions, records, reminders, audit, clock: fakeClock(ENDED) };
  }

  it("discards a session nobody was served at", async () => {
    await discardDistributionSession(deps());

    expect(await sessions.findRunning()).toBeNull();
    expect(await sessions.lastEnded()).toBeNull();
    // Stamped, never deleted (ADR-010): the row is still there, it is simply nobody's afternoon.
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0]?.discardedAt).toEqual(new Date(ENDED));
  });

  it("refuses to discard a session that served somebody", async () => {
    records = new FakeDistributionRecordRepository([handout(1, 500 as Cents)]);

    await expect(discardDistributionSession(deps())).rejects.toBeInstanceOf(
      DistributionSessionNotEmpty,
    );
    expect(await sessions.findRunning()).not.toBeNull();
  });

  it("refuses to discard a session that only logged a reminder", async () => {
    reminders = new FakeReminderLogRepository(1);

    await expect(discardDistributionSession(deps())).rejects.toBeInstanceOf(
      DistributionSessionNotEmpty,
    );
    expect(await sessions.findRunning()).not.toBeNull();
  });

  it("refuses to discard when no session is running", async () => {
    sessions = new FakeDistributionSessionRepository();

    await expect(discardDistributionSession(deps())).rejects.toBeInstanceOf(
      NoDistributionSessionRunning,
    );
  });

  it("writes nothing to the log when a session is discarded", async () => {
    await discardDistributionSession(deps());

    expect(audit.entries).toHaveLength(0);
  });
});

describe("endDistributionSession", () => {
  let sessions: FakeDistributionSessionRepository;
  let records: FakeDistributionRecordRepository;
  let customers: FakeCustomerRepository;
  let audit: FakeAuditLog;

  beforeEach(() => {
    sessions = new FakeDistributionSessionRepository(
      session({ groups: createSessionGroups(["RED", "BLUE"]) }),
    );
    records = new FakeDistributionRecordRepository();
    customers = new FakeCustomerRepository(
      customerRecord(),
      customerRecord({ id: 2, customerNumber: 50, firstName: "Jonas", lastName: "Behrens" }),
    );
    audit = new FakeAuditLog();
  });

  function deps(at = ENDED) {
    return { sessions, records, customers, audit, clock: fakeClock(at) };
  }

  it("counts what was taken when the session ends", async () => {
    records = new FakeDistributionRecordRepository([
      handout(1, 500 as Cents),
      handout(2, 250 as Cents),
      // An earlier afternoon's hand-out, which this summary may not count.
      handout(3, 900 as Cents, EARLIER_ID),
    ]);

    const summary = await endDistributionSession(deps());

    expect(summary).toEqual({ households: 2, totalPaidCents: 750 });
    expect(await sessions.findRunning()).toBeNull();
    expect((await sessions.lastEnded())?.endedAt).toEqual(new Date(ENDED));
  });

  it("summarises an afternoon nobody came to as nothing taken", async () => {
    const summary = await endDistributionSession(deps());

    expect(summary).toEqual({ households: 0, totalPaidCents: 0 });
  });

  it("writes one audit entry naming the start and the end", async () => {
    records = new FakeDistributionRecordRepository([handout(1, 500 as Cents)]);

    await endDistributionSession(deps());

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toEqual({
      what: "distribution.session.ended",
      changedFields: ["startedAt", "endedAt", "groups"],
      when: new Date(ENDED),
      why: `startedAt=${STARTED}, groups=RED,BLUE, households=1, totalPaid=500`,
    });
  });

  it("refuses to end when no session is running", async () => {
    sessions = new FakeDistributionSessionRepository();

    await expect(endDistributionSession(deps())).rejects.toBeInstanceOf(
      NoDistributionSessionRunning,
    );
    expect(audit.entries).toHaveLength(0);
  });

  it("freezes every hand-out of the session when it is ended", async () => {
    records = new FakeDistributionRecordRepository([
      handout(1, 500 as Cents),
      handout(2, 250 as Cents),
      // An earlier afternoon's hand-out: neither frozen here nor even looked up, which is why the
      // register below need not hold household 3 at all.
      handout(3, 900 as Cents, EARLIER_ID),
    ]);

    await endDistributionSession(deps());

    expect(frozenIn(records)).toEqual([
      { recordId: 1, receipt: receipt() },
      {
        recordId: 2,
        receipt: receipt({
          customerNumber: 50,
          cardCustomerNumber: 50,
          firstName: "Jonas",
          lastName: "Behrens",
        }),
      },
    ]);
    expect(records.frozen.has(EARLIER_ID)).toBe(false);
  });

  it("captures the card's own slot, not the one its holder has moved to", async () => {
    customers = new FakeCustomerRepository(
      customerRecord({ customerNumber: 51, cardCustomerNumber: 49 }),
    );
    records = new FakeDistributionRecordRepository([handout(1, 500 as Cents)]);

    await endDistributionSession(deps());

    expect(frozenIn(records)[0]?.receipt).toEqual(
      receipt({ customerNumber: 51, cardCustomerNumber: 49 }),
    );
  });

  it("keeps following corrections while the session is still running", async () => {
    records = new FakeDistributionRecordRepository([handout(1, 500 as Cents)]);
    // The spelling is noticed after the household has collected and put right before the afternoon
    // is closed: until the ending, the record is what the receipt will say.
    const { birthDate, address, householdMembers } = customerRecord().details;
    await customers.updateDetails(
      1,
      { firstName: "Mira", lastName: "Aalto-Rinne", birthDate, address },
      householdMembers,
    );

    await endDistributionSession(deps());

    expect(frozenIn(records)[0]?.receipt).toEqual(receipt({ lastName: "Aalto-Rinne" }));
  });

  it("counts a child who turned 13 before the session was ended as a grown-up", async () => {
    customers = new FakeCustomerRepository(
      customerRecord({ householdMembers: [member(GROWN_UP), member(CHILD_TURNING_13)] }),
    );
    records = new FakeDistributionRecordRepository([handout(1, 500 as Cents)]);

    // The price charged in the afternoon was a grown-up's and a child's; the receipt says two
    // grown-ups. The divergence is real and is not to be "fixed" (US-35.3) — it is the one
    // `Card.grownUpsAtIssue` already exposes.
    await endDistributionSession(deps(ENDED_AFTER_MIDNIGHT));

    expect(frozenIn(records)[0]?.receipt).toEqual(receipt({ grownUps: 2, children: 0 }));
  });

  it("keeps the household that was served after its number is given to another", async () => {
    records = new FakeDistributionRecordRepository([handout(1, 500 as Cents)]);

    await endDistributionSession(deps());

    // The household leaves the register and slot 49 is handed to the next applicant.
    await customers.archive(1, "weggezogen", new Date(LATER));
    customers.holders.push(
      customerRecord({ id: 3, customerNumber: 49, firstName: "Selma", lastName: "Nowak" }),
    );

    expect((await customers.findByCustomerNumber(49))?.details.firstName).toBe("Selma");
    expect(frozenIn(records)).toEqual([{ recordId: 1, receipt: receipt() }]);
  });

  it("freezes nothing for an afternoon nobody came to", async () => {
    await endDistributionSession(deps());

    expect(frozenIn(records)).toEqual([]);
    expect(await sessions.findRunning()).toBeNull();
  });

  it("leaves the session running when the freeze fails", async () => {
    records = new FakeDistributionRecordRepository([handout(1, 500 as Cents)]);
    records.freezeFails = true;

    await expect(endDistributionSession(deps())).rejects.toThrowError("the store refused");
    expect((await sessions.findRunning())?.id).toBe(RUNNING_ID);
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses to end an afternoon naming a household the register does not hold", async () => {
    records = new FakeDistributionRecordRepository([handout(9, 500 as Cents)]);

    await expect(endDistributionSession(deps())).rejects.toBeInstanceOf(CustomerNotFound);
    expect((await sessions.findRunning())?.id).toBe(RUNNING_ID);
  });
});

describe("reopenDistributionSession", () => {
  let sessions: FakeDistributionSessionRepository;
  let records: FakeDistributionRecordRepository;
  let customers: FakeCustomerRepository;
  let audit: FakeAuditLog;

  beforeEach(() => {
    sessions = new FakeDistributionSessionRepository(
      session({ id: EARLIER_ID, endedAt: new Date("2026-01-01T17:00:00.000Z") }),
      session({ endedAt: new Date(ENDED) }),
    );
    // The afternoon as ending left it: one hand-out, frozen with the household that collected.
    records = new FakeDistributionRecordRepository([handout(1, 500 as Cents)]);
    records.frozen.set(RUNNING_ID, [{ recordId: 1, receipt: receipt() }]);
    customers = new FakeCustomerRepository(customerRecord());
    audit = new FakeAuditLog();
  });

  function deps() {
    return { sessions, records, audit, clock: fakeClock(LATER) };
  }

  it("reopens the session that ended last, and records why", async () => {
    await reopenDistributionSession(deps(), {
      sessionId: RUNNING_ID,
      reason: "Zahlung nachtragen",
    });

    expect((await sessions.findRunning())?.id).toBe(RUNNING_ID);
    expect(audit.entries).toEqual([
      {
        what: "distribution.session.reopened",
        changedFields: ["endedAt"],
        when: new Date(LATER),
        why: "Zahlung nachtragen",
      },
    ]);
  });

  it("refuses to reopen a session with another one running", async () => {
    sessions = new FakeDistributionSessionRepository(session({ endedAt: new Date(ENDED) }), {
      id: 20,
      startedAt: new Date(LATER),
      endedAt: null,
      groups: createSessionGroups(["BLUE"]),
    });

    await expect(
      reopenDistributionSession(deps(), { sessionId: RUNNING_ID, reason: "Zahlung nachtragen" }),
    ).rejects.toBeInstanceOf(DistributionSessionNotReopenable);
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses to reopen anything but the afternoon that ended last", async () => {
    await expect(
      reopenDistributionSession(deps(), { sessionId: EARLIER_ID, reason: "Zahlung nachtragen" }),
    ).rejects.toBeInstanceOf(DistributionSessionNotReopenable);
    expect((await sessions.findById(EARLIER_ID))?.endedAt).not.toBeNull();
    expect(frozenIn(records)).toHaveLength(1);
  });

  it("thaws the frozen state when the session is reopened", async () => {
    await reopenDistributionSession(deps(), {
      sessionId: RUNNING_ID,
      reason: "Zahlung nachtragen",
    });

    expect(records.frozen.has(RUNNING_ID)).toBe(false);
  });

  it("freezes it again when the reopened session is ended", async () => {
    await reopenDistributionSession(deps(), {
      sessionId: RUNNING_ID,
      reason: "Name falsch geschrieben",
    });

    // The correction the reopening was for, and then the second ending that closes it again.
    const { birthDate, address, householdMembers } = customerRecord().details;
    await customers.updateDetails(
      1,
      { firstName: "Mira", lastName: "Aalto-Rinne", birthDate, address },
      householdMembers,
    );
    await endDistributionSession({ sessions, records, customers, audit, clock: fakeClock(LATER) });

    expect(frozenIn(records)).toEqual([
      { recordId: 1, receipt: receipt({ lastName: "Aalto-Rinne" }) },
    ]);
  });

  it("refuses to reopen a session the register does not hold", async () => {
    await expect(
      reopenDistributionSession(deps(), { sessionId: 999, reason: "Zahlung nachtragen" }),
    ).rejects.toBeInstanceOf(DistributionSessionNotReopenable);
  });

  it("refuses a reopening with no reason", async () => {
    await expect(
      reopenDistributionSession(deps(), { sessionId: RUNNING_ID, reason: "   " }),
    ).rejects.toThrowError(new MissingAuditReason("distribution.session.reopened").message);
    expect((await sessions.lastEnded())?.endedAt).not.toBeNull();
    expect(audit.entries).toHaveLength(0);
  });
});

describe("readDistributionSessionState", () => {
  /** Every screen reads the state; what it holds of the afternoon is read from the rows themselves. */
  function deps(
    sessions: FakeDistributionSessionRepository,
    records: FakeDistributionRecordRepository = new FakeDistributionRecordRepository(),
    reminders: FakeReminderLogRepository = new FakeReminderLogRepository(),
  ) {
    return { sessions, records, reminders };
  }

  it("proposes the group that was not up last time when nothing is running", async () => {
    const sessions = new FakeDistributionSessionRepository(
      session({ id: EARLIER_ID, endedAt: new Date(ENDED), groups: createSessionGroups(["RED"]) }),
    );

    const state = await readDistributionSessionState(deps(sessions));

    expect(state.running).toBeNull();
    expect(state.lastEnded?.session.id).toBe(EARLIER_ID);
    expect(state.proposedGroups).toEqual(["BLUE"]);
  });

  it("preselects nothing before the first afternoon has ever taken place", async () => {
    const state = await readDistributionSessionState(deps(new FakeDistributionSessionRepository()));

    expect(state).toEqual({ running: null, lastEnded: null, proposedGroups: null });
  });

  it("reports the running session, and still proposes from the one before it", async () => {
    const sessions = new FakeDistributionSessionRepository(
      session({ id: EARLIER_ID, endedAt: new Date(ENDED), groups: createSessionGroups(["BLUE"]) }),
      session({ groups: createSessionGroups(["RED"]) }),
    );

    const state = await readDistributionSessionState(deps(sessions));

    expect(state.running?.session.id).toBe(RUNNING_ID);
    expect(state.proposedGroups).toEqual(["RED"]);
  });

  it("sums what the running session has come to so far", async () => {
    const sessions = new FakeDistributionSessionRepository(session());
    const records = new FakeDistributionRecordRepository([
      handout(1, 400 as Cents),
      handout(2, 250 as Cents),
      handout(3, 500 as Cents, EARLIER_ID),
    ]);

    const state = await readDistributionSessionState(deps(sessions, records));

    expect(state.running?.summary).toEqual({ households: 2, totalPaidCents: 650 });
  });

  it("offers to discard a session that has served nobody and reminded nobody", async () => {
    const state = await readDistributionSessionState(
      deps(new FakeDistributionSessionRepository(session())),
    );

    expect(state.running?.canDiscard).toBe(true);
  });

  it("withdraws the discard once the first household has collected", async () => {
    const sessions = new FakeDistributionSessionRepository(session());
    const records = new FakeDistributionRecordRepository([handout(1, 400 as Cents)]);

    const state = await readDistributionSessionState(deps(sessions, records));

    expect(state.running?.canDiscard).toBe(false);
  });

  it("withdraws the discard once the first reminder has been logged", async () => {
    const sessions = new FakeDistributionSessionRepository(session());

    const state = await readDistributionSessionState(
      deps(sessions, new FakeDistributionRecordRepository(), new FakeReminderLogRepository(1)),
    );

    expect(state.running?.canDiscard).toBe(false);
  });

  it("sums what the afternoon that ended last came to", async () => {
    const sessions = new FakeDistributionSessionRepository(
      session({ id: EARLIER_ID, endedAt: new Date(ENDED) }),
    );
    const records = new FakeDistributionRecordRepository([
      handout(1, 400 as Cents, EARLIER_ID),
      handout(2, 250 as Cents, EARLIER_ID),
    ]);

    const state = await readDistributionSessionState(deps(sessions, records));

    expect(state.lastEnded?.summary).toEqual({ households: 2, totalPaidCents: 650 });
  });

  it("offers to reopen the afternoon that ended last", async () => {
    const sessions = new FakeDistributionSessionRepository(
      session({ id: EARLIER_ID, endedAt: new Date(ENDED) }),
    );

    const state = await readDistributionSessionState(deps(sessions));

    expect(state.lastEnded?.canReopen).toBe(true);
  });

  it("withholds the reopening while another afternoon is running", async () => {
    const sessions = new FakeDistributionSessionRepository(
      session({ id: EARLIER_ID, endedAt: new Date(ENDED) }),
      session({ startedAt: new Date(LATER) }),
    );

    const state = await readDistributionSessionState(deps(sessions));

    expect(state.lastEnded?.session.id).toBe(EARLIER_ID);
    expect(state.lastEnded?.canReopen).toBe(false);
  });
});
