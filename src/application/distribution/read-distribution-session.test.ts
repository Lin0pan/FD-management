import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";
import type { IssuedCard } from "@/domain/card/card";
import type {
  CustomerDetails,
  HouseholdMemberDetails,
  RegisteredCustomer,
} from "@/domain/customer/customer";
import { composition } from "@/domain/customer/householdComposition";
import type { DistributionRecord } from "@/domain/distribution/distributionRecord";
import type { HandoutReceipt } from "@/domain/distribution/handoutReceipt";
import {
  createSessionGroups,
  type DistributionSession,
  type SessionSummary,
} from "@/domain/distribution/session";
import { CustomerNotFound, DistributionSessionNotFound } from "@/domain/errors";
import type { Cents } from "@/domain/money";
import type {
  ArchivedCustomer,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  DistributionSessionRepository,
  FrozenHandout,
} from "../ports";
import { readDistributionSession } from "./read-distribution-session";

/** Hand-written fakes throughout, per the testing standard — no mocking library. */

faker.seed(20260921);

const SESSION_ID = 12;
const STARTED = "2026-01-08T14:00:00.000Z";
const ENDED = "2026-01-08T17:30:00.000Z";
/** A week after the afternoon: the register has moved on, the receipt has not. */
const TODAY = "2026-01-15T10:00:00.000Z";

const GROWN_UP = "1985-03-11T00:00:00.000Z";
const CHILD = "2020-06-01T00:00:00.000Z";
const CERTIFICATE_UNTIL = "2027-01-31T00:00:00.000Z";
/** The renewed date the register carries once the household has brought a new certificate. */
const RENEWED_UNTIL = "2028-01-31T00:00:00.000Z";

function fakeClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

function ended(id = SESSION_ID): DistributionSession {
  return {
    id,
    startedAt: new Date(STARTED),
    endedAt: new Date(ENDED),
    groups: createSessionGroups(["RED"]),
  };
}

function running(id = SESSION_ID): DistributionSession {
  return {
    id,
    startedAt: new Date(STARTED),
    endedAt: null,
    groups: createSessionGroups(["RED"]),
  };
}

/** The session register, stamping a discarded session rather than forgetting it, as the adapter. */
class FakeDistributionSessionRepository implements DistributionSessionRepository {
  private readonly rows: { discarded: boolean; readonly session: DistributionSession }[] = [];

  constructor(...sessions: DistributionSession[]) {
    this.rows.push(...sessions.map((session) => ({ discarded: false, session })));
  }

  findById(sessionId: number): Promise<DistributionSession | null> {
    return Promise.resolve(
      this.rows.find((row) => !row.discarded && row.session.id === sessionId)?.session ?? null,
    );
  }

  discard(sessionId: number): Promise<void> {
    const row = this.rows.find((one) => one.session.id === sessionId);
    if (row === undefined) {
      throw new Error(`No session ${sessionId}`);
    }
    row.discarded = true;
    return Promise.resolve();
  }

  findRunning(): Promise<DistributionSession | null> {
    return Promise.reject(new Error("The detail view is opened on an id, never on what runs"));
  }

  lastEnded(): Promise<DistributionSession | null> {
    return Promise.reject(new Error("The detail view is opened on an id, never on the last one"));
  }

  listEnded(): Promise<ReadonlyArray<DistributionSession>> {
    return Promise.reject(new Error("The overview of past afternoons has a suite of its own"));
  }

  start(): Promise<DistributionSession> {
    return Promise.reject(new Error("Starting a session has a suite of its own"));
  }

  end(): Promise<void> {
    return Promise.reject(new Error("Ending a session has a suite of its own"));
  }

  reopen(): Promise<void> {
    return Promise.reject(new Error("Reopening a session has a suite of its own"));
  }
}

/**
 * The hand-outs of an afternoon and the receipts it was frozen with, held apart exactly as the
 * store holds them: a reopening drops the receipts, and a test that wants them left behind simply
 * does not drop them.
 */
class FakeDistributionRecordRepository implements DistributionRecordRepository {
  constructor(
    private readonly rows: ReadonlyArray<DistributionRecord> = [],
    private readonly frozen: ReadonlyArray<FrozenHandout> = [],
  ) {}

  listForSession(sessionId: number): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve(this.rows.filter((row) => row.sessionId === sessionId));
  }

  listFrozen(sessionId: number): Promise<ReadonlyArray<FrozenHandout>> {
    const ofSession = this.rows.filter((row) => row.sessionId === sessionId).map((row) => row.id);
    return Promise.resolve(this.frozen.filter((one) => ofSession.includes(one.recordId)));
  }

  listForCustomer(): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.reject(new Error("A past afternoon is read whole, never one household"));
  }

  summariseBySession(): Promise<ReadonlyMap<number, SessionSummary>> {
    return Promise.reject(new Error("The overview of past afternoons has a suite of its own"));
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

  freezeSession(): Promise<void> {
    return Promise.reject(new Error("Ending a session has a suite of its own"));
  }

  thawSession(): Promise<void> {
    return Promise.reject(new Error("Reopening a session has a suite of its own"));
  }
}

/**
 * The register as it stands today. `findByCustomerNumber` rejects: a past afternoon names the
 * households it actually served, which are reached by their own id and never by the slot they held
 * — the slot may since have been given to somebody else (E-4).
 */
class FakeCustomerRepository implements CustomerRepository {
  private readonly holders: RegisteredCustomer[];

  constructor(...holders: RegisteredCustomer[]) {
    this.holders = holders;
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.holders.find((customer) => customer.id === id) ?? null);
  }

  findByCustomerNumber(): Promise<RegisteredCustomer | null> {
    return Promise.reject(new Error("A past afternoon names households, never slots"));
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

  updateDetails(): Promise<void> {
    return Promise.reject(new Error("Correcting a record has a suite of its own"));
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

  archive(): Promise<void> {
    return Promise.reject(new Error("Archiving a customer has a suite of its own"));
  }
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
  readonly certificateValidUntil?: string;
  readonly reminderCount?: number;
  readonly status?: RegisteredCustomer["status"];
  /** The slot the card was printed under, which a move leaves behind (ADR-016). */
  readonly cardCustomerNumber?: number;
  readonly cardIndex?: number;
}

/** A household as the register holds it today: one grown-up and one child on slot 49. */
function customerRecord(overrides: CustomerOverrides = {}): RegisteredCustomer {
  const customerNumber = overrides.customerNumber ?? 49;
  const details: CustomerDetails = {
    firstName: overrides.firstName ?? "Mira",
    lastName: overrides.lastName ?? "Berg",
    birthDate: new Date(GROWN_UP),
    address: { street: "Hauptstraße", houseNumber: "1", zip: "33129", city: "Delbrück" },
    certificate: {
      type: "Jobcenter",
      validUntil: new Date(overrides.certificateValidUntil ?? RENEWED_UNTIL),
    },
    householdMembers: overrides.householdMembers ?? [member(GROWN_UP), member(CHILD)],
    notes: "",
  };
  return {
    id: overrides.id ?? 1,
    customerNumber,
    status: overrides.status ?? "ACTIVE",
    blockReason: null,
    archiveReason: null,
    archivedAt: null,
    reminderCount: overrides.reminderCount ?? 0,
    card: {
      customerNumber: overrides.cardCustomerNumber ?? customerNumber,
      index: overrides.cardIndex ?? 1,
      issuedAt: new Date(STARTED),
      reason: "FIRST_ISSUE",
      countsAtIssue: composition(details.householdMembers, new Date(STARTED)),
    },
    registeredOn: new Date(STARTED),
    previousCustomerId: null,
    details,
  };
}

/** A hand-out of the afternoon under test. The record's id is the receipt's key. */
function handout(
  id: number,
  customerId: number,
  overrides: Partial<DistributionRecord> = {},
): DistributionRecord {
  return {
    id,
    customerId,
    sessionId: SESSION_ID,
    date: new Date(STARTED),
    showedUp: true,
    paidCents: (overrides.paidCents ?? 700) as Cents,
    priceCents: (overrides.priceCents ?? 500) as Cents,
    ...overrides,
  };
}

interface ReceiptOverrides {
  readonly customerNumber?: number;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly grownUps?: number;
  readonly children?: number;
  readonly cardCustomerNumber?: number;
  readonly cardIndex?: number;
  readonly certificateValidUntil?: string;
  readonly reminderCount?: number;
}

/** The household as it stood when the afternoon was closed — „Aalto" on 49, with two grown-ups. */
function receipt(recordId: number, overrides: ReceiptOverrides = {}): FrozenHandout {
  const customerNumber = overrides.customerNumber ?? 49;
  const frozen: HandoutReceipt = {
    customerNumber,
    firstName: overrides.firstName ?? "Mira",
    lastName: overrides.lastName ?? "Aalto",
    grownUps: overrides.grownUps ?? 2,
    children: overrides.children ?? 1,
    cardCustomerNumber: overrides.cardCustomerNumber ?? customerNumber,
    cardIndex: overrides.cardIndex ?? 1,
    certificateValidUntil: new Date(overrides.certificateValidUntil ?? CERTIFICATE_UNTIL),
    reminderCount: overrides.reminderCount ?? 2,
  };
  return { recordId, receipt: frozen };
}

describe("readDistributionSession", () => {
  it("shows the name as it stood at an ended session", async () => {
    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(ended()),
        records: new FakeDistributionRecordRepository([handout(1, 1)], [receipt(1)]),
        customers: new FakeCustomerRepository(customerRecord()),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    // The register says Berg, two people and a renewed certificate; the afternoon said Aalto.
    expect(detail.households).toEqual([
      {
        customerId: 1,
        customerNumber: 49,
        firstName: "Mira",
        lastName: "Aalto",
        cardNumber: "49k1",
        group: "RED",
        grownUps: 2,
        children: 1,
        priceCents: 500,
        certificateValidUntil: new Date(CERTIFICATE_UNTIL),
        reminderCount: 2,
        paidCents: 700,
        at: new Date(STARTED),
      },
    ]);
    expect(detail.frozen).toBe(true);
    expect(detail.session.id).toBe(SESSION_ID);
  });

  it("shows today's name while the session is still running", async () => {
    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(running()),
        records: new FakeDistributionRecordRepository([handout(1, 1)]),
        customers: new FakeCustomerRepository(customerRecord({ reminderCount: 1 })),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    expect(detail.households).toMatchObject([
      {
        lastName: "Berg",
        grownUps: 1,
        children: 1,
        certificateValidUntil: new Date(RENEWED_UNTIL),
        reminderCount: 1,
      },
    ]);
    expect(detail.frozen).toBe(false);
  });

  it("shows today's name again after the session is reopened", async () => {
    // The receipts are left in the store on purpose: what decides the two sources is whether the
    // afternoon is closed, not whether a freeze happens to be lying about (E-5).
    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(running()),
        records: new FakeDistributionRecordRepository([handout(1, 1)], [receipt(1)]),
        customers: new FakeCustomerRepository(customerRecord()),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    expect(detail.households).toMatchObject([{ lastName: "Berg", grownUps: 1 }]);
    expect(detail.frozen).toBe(false);
  });

  it("shows the household that was served after its number was given to another", async () => {
    const served = customerRecord({ id: 1, customerNumber: 49, status: "ARCHIVED" });
    const newcomer = customerRecord({ id: 2, customerNumber: 49, lastName: "Novak" });

    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(ended()),
        records: new FakeDistributionRecordRepository([handout(1, 1)], [receipt(1)]),
        customers: new FakeCustomerRepository(served, newcomer),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    expect(detail.households).toMatchObject([
      { customerId: 1, customerNumber: 49, lastName: "Aalto" },
    ]);
  });

  it("reads a session ended before the households were ever captured off their record", async () => {
    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(ended()),
        records: new FakeDistributionRecordRepository([handout(1, 1)]),
        customers: new FakeCustomerRepository(customerRecord()),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    // Today's figures, and the flag that lets the screen say so rather than print empty columns.
    expect(detail.households).toMatchObject([{ lastName: "Berg", grownUps: 1 }]);
    expect(detail.frozen).toBe(false);
  });

  it("names the card the household carried, not the slot it holds today", async () => {
    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(ended()),
        records: new FakeDistributionRecordRepository(
          [handout(1, 1)],
          [receipt(1, { customerNumber: 50, cardCustomerNumber: 49, cardIndex: 3 })],
        ),
        customers: new FakeCustomerRepository(customerRecord()),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    // The slot decides the group (ADR-017); the card keeps the one it was printed under (ADR-016).
    expect(detail.households).toMatchObject([
      { customerNumber: 50, group: "BLUE", cardNumber: "49k3" },
    ]);
  });

  it("reads the households in customer-number order, not in the order they were served", async () => {
    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(ended()),
        records: new FakeDistributionRecordRepository(
          [handout(1, 1), handout(2, 2), handout(3, 3)],
          [
            receipt(1, { customerNumber: 51 }),
            receipt(2, { customerNumber: 13 }),
            receipt(3, { customerNumber: 49 }),
          ],
        ),
        customers: new FakeCustomerRepository(customerRecord()),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    expect(detail.households.map((row) => row.customerNumber)).toEqual([13, 49, 51]);
  });

  it("takes the price and the amount handed over from the hand-out", async () => {
    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(ended()),
        records: new FakeDistributionRecordRepository(
          [handout(1, 1, { priceCents: 1250 as Cents, paidCents: 1000 as Cents })],
          [receipt(1)],
        ),
        customers: new FakeCustomerRepository(customerRecord()),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    // Not on the receipt and deliberately not copied onto it: one payment with two figures beside
    // it is the fault the capture is designed around (ADR-021).
    expect(detail.households).toMatchObject([{ priceCents: 1250, paidCents: 1000 }]);
  });

  it("answers an afternoon nobody collected at with no households", async () => {
    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(ended()),
        records: new FakeDistributionRecordRepository(),
        customers: new FakeCustomerRepository(),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    expect(detail.households).toEqual([]);
    expect(detail.frozen).toBe(true);
    expect(detail.summary).toEqual({ households: 0, totalPaidCents: 0 });
  });

  it("sums what the afternoon came to, so the screen states it rather than works it out", async () => {
    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(ended()),
        records: new FakeDistributionRecordRepository(
          [handout(1, 1, { paidCents: 700 as Cents }), handout(2, 2, { paidCents: 250 as Cents })],
          [receipt(1, { customerNumber: 49 }), receipt(2, { customerNumber: 51 })],
        ),
        customers: new FakeCustomerRepository(customerRecord()),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    // The sum handed over, never the sum asked for: the two differ on every corrected hand-out.
    expect(detail.summary).toEqual({ households: 2, totalPaidCents: 950 });
  });

  it("says an ended afternoon is not running", async () => {
    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(ended()),
        records: new FakeDistributionRecordRepository([handout(1, 1)], [receipt(1)]),
        customers: new FakeCustomerRepository(customerRecord()),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    expect(detail.running).toBe(false);
  });

  it("says an afternoon still under way is running", async () => {
    const detail = await readDistributionSession(
      {
        sessions: new FakeDistributionSessionRepository(running()),
        records: new FakeDistributionRecordRepository([handout(1, 1)]),
        customers: new FakeCustomerRepository(customerRecord()),
        clock: fakeClock(TODAY),
      },
      SESSION_ID,
    );

    // The flag the screen prints „vorläufig“ off, read here so the overview's row and this
    // afternoon's header cannot disagree about which one is open (US-37.1).
    expect(detail.running).toBe(true);
  });

  it("refuses an id the register holds no session under", async () => {
    await expect(
      readDistributionSession(
        {
          sessions: new FakeDistributionSessionRepository(ended()),
          records: new FakeDistributionRecordRepository(),
          customers: new FakeCustomerRepository(),
          clock: fakeClock(TODAY),
        },
        999,
      ),
    ).rejects.toThrow(DistributionSessionNotFound);
  });

  it("refuses a session that was discarded", async () => {
    const sessions = new FakeDistributionSessionRepository(running());
    await sessions.discard(SESSION_ID);

    await expect(
      readDistributionSession(
        {
          sessions,
          records: new FakeDistributionRecordRepository(),
          customers: new FakeCustomerRepository(),
          clock: fakeClock(TODAY),
        },
        SESSION_ID,
      ),
    ).rejects.toThrow(DistributionSessionNotFound);
  });

  it("refuses a hand-out naming a household the register does not hold", async () => {
    await expect(
      readDistributionSession(
        {
          sessions: new FakeDistributionSessionRepository(running()),
          records: new FakeDistributionRecordRepository([handout(1, 7)]),
          customers: new FakeCustomerRepository(customerRecord({ id: 1 })),
          clock: fakeClock(TODAY),
        },
        SESSION_ID,
      ),
    ).rejects.toThrow(CustomerNotFound);
  });
});
