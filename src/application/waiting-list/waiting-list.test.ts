import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  CustomerStatus,
  HouseholdMemberDetails,
  NewCustomer,
  RegisteredCustomer,
} from "@/domain/customer/customer";
import type { WaitingListDetails } from "@/domain/customer/waitingList";
import {
  CertificateExpired,
  EmptyHousehold,
  MissingAuditReason,
  NoFreeCustomerNumber,
  WaitingListEntryNotFound,
} from "@/domain/errors";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type {
  ArchivedCustomer,
  AuditEntry,
  AuditLog,
  Clock,
  CustomerRepository,
  NewWaitingListEntry,
  SettingsRepository,
  WaitingListEntry,
  WaitingListRepository,
} from "../ports";
import { addToWaitingList } from "./add-to-waiting-list";
import { listWaiting } from "./list-waiting";
import { promoteFromWaitingList } from "./promote-from-waiting-list";
import {
  registerFromWaitingList,
  type RegisterFromWaitingListInput,
} from "./register-from-waiting-list";
import { removeFromWaitingList } from "./remove-from-waiting-list";

/** Hand-written fakes and synthetic data only, per the testing standard. */

faker.seed(20260727);

const TODAY = "2026-07-20T09:00:00.000Z";

function at(isoDate: string, time = "00:00:00.000"): Date {
  return new Date(`${isoDate}T${time}Z`);
}

class FakeClock implements Clock {
  constructor(public instant: Date) {}

  now(): Date {
    return this.instant;
  }
}

/**
 * The waiting list as a list of the rows that are still waiting, plus the removals it was asked for.
 * Removed rows leave `waiting` and stay in `removals`, which is what the real store does with a
 * `removedOn` stamp — the entry is gone from the queue and kept as history.
 */
class FakeWaitingList implements WaitingListRepository {
  readonly waiting: WaitingListEntry[] = [];
  readonly removals: Array<{ entryId: number; reason: string; removedOn: Date }> = [];
  private nextId: number;

  constructor(...entries: WaitingListEntry[]) {
    this.waiting.push(...entries);
    this.nextId = Math.max(0, ...entries.map((entry) => entry.id)) + 1;
  }

  listWaiting(): Promise<ReadonlyArray<WaitingListEntry>> {
    return Promise.resolve([...this.waiting]);
  }

  findWaiting(entryId: number): Promise<WaitingListEntry | null> {
    return Promise.resolve(this.waiting.find((entry) => entry.id === entryId) ?? null);
  }

  add(entry: NewWaitingListEntry): Promise<WaitingListEntry> {
    const stored = { ...entry, id: this.nextId };
    this.nextId += 1;
    this.waiting.push(stored);
    return Promise.resolve(stored);
  }

  remove(entryId: number, reason: string, removedOn: Date): Promise<void> {
    this.removals.push({ entryId, reason, removedOn });
    this.waiting.splice(
      this.waiting.findIndex((entry) => entry.id === entryId),
      1,
    );
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

class FakeSettingsRepository implements SettingsRepository {
  constructor(private readonly quotaN: number) {}

  listVersions(): Promise<SettingsVersion[]> {
    return Promise.resolve([
      { recordedAt: at("2026-01-01"), settings: createSettings(settingsInput(this.quotaN)) },
    ]);
  }

  append(): Promise<void> {
    return Promise.reject(new Error("A waiting-list use case never writes settings"));
  }
}

/** The register, as far as registration and the free-slot check need it. */
class FakeCustomerRepository implements CustomerRepository {
  readonly customers: RegisteredCustomer[] = [];

  constructor(...takenNumbers: number[]) {
    this.customers.push(...takenNumbers.map((number, index) => storedCustomer(number, index + 1)));
  }

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    return Promise.resolve(
      this.customers
        .filter((customer) => customer.status !== "ARCHIVED")
        .map((customer) => customer.customerNumber),
    );
  }

  groupCounts(): Promise<{ red: number; blue: number }> {
    return Promise.resolve({ red: 0, blue: 0 });
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.customers.find((customer) => customer.id === id) ?? null);
  }

  findByCustomerNumber(customerNumber: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(
      this.customers.find((customer) => customer.customerNumber === customerNumber) ?? null,
    );
  }

  /**
   * No use case in this file browses the register (US-15.1); the method is here because the port
   * has it. Answering with nothing is honest — nothing here asks the list a question.
   */
  list(): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve([]);
  }

  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve(this.customers.filter((customer) => customer.status === status));
  }

  searchArchived(): Promise<ReadonlyArray<ArchivedCustomer>> {
    return Promise.resolve([]);
  }

  create(customer: NewCustomer): Promise<RegisteredCustomer> {
    const registered = {
      ...customer,
      id: this.customers.length + 1,
      blockReason: null,
      archiveReason: null,
      archivedAt: null,
      registeredOn: customer.card.issuedAt,
    };
    this.customers.push(registered);
    return Promise.resolve(registered);
  }

  updateHousehold(): Promise<void> {
    return Promise.reject(new Error("A waiting-list use case never edits a customer's household"));
  }

  updateDetails(): Promise<void> {
    return Promise.reject(new Error("A waiting-list use case never corrects a customer's record"));
  }

  updateNotes(): Promise<void> {
    return Promise.reject(new Error("A waiting-list use case never edits a customer's notes"));
  }

  setStatus(): Promise<void> {
    return Promise.reject(new Error("A waiting-list use case never changes a customer's status"));
  }

  archive(): Promise<void> {
    return Promise.reject(new Error("A waiting-list use case never archives a customer"));
  }
}

function settingsInput(quotaN: number): SettingsInput {
  return {
    quotaN,
    portionsPerGrownUp: 2,
    portionsPerChild: 1,
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 4,
    pricePerGrownUp: 200,
    pricePerChild: 100,
  };
}

/** A customer already on the register — only their number and status matter to these tests. */
function storedCustomer(customerNumber: number, id: number): RegisteredCustomer {
  const member: HouseholdMemberDetails = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: at("1980-02-02"),
  };
  return {
    id,
    details: {
      firstName: member.firstName,
      lastName: member.lastName,
      birthDate: member.birthDate,
      address: address(),
      certificate: { type: "Jobcenter", validUntil: at("2027-01-31") },
      householdMembers: [member],
      notes: "",
    },
    customerNumber,
    group: "RED",
    status: "ACTIVE",
    reminderCount: 0,
    card: {
      index: 1,
      issuedAt: at("2026-01-05"),
      reason: "FIRST_ISSUE",
      countsAtIssue: { grownUps: 1, children: 0 },
    },
    previousCustomerId: null,
    blockReason: null,
    archiveReason: null,
    archivedAt: null,
    registeredOn: at("2026-01-05"),
  };
}

function address() {
  return {
    street: faker.location.street(),
    houseNumber: faker.location.buildingNumber(),
    zip: faker.location.zipCode("#####"),
    city: faker.location.city(),
  };
}

/** What staff type into the "auf die Warteliste setzen" form. */
function application(overrides: Partial<WaitingListDetails> = {}): WaitingListDetails {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: at("1988-03-17"),
    address: address(),
    contactNote: "",
    certificate: { type: "Jobcenter", validUntil: at("2027-01-31") },
    ...overrides,
  };
}

/** An applicant the store already holds — `addedOn` and `id` are what the ordering turns on. */
function entry(id: number, addedOn: Date, validUntil = "2027-01-31"): WaitingListEntry {
  return {
    ...application({ certificate: { type: "Jobcenter", validUntil: at(validUntil) } }),
    id,
    addedOn,
  };
}

let clock: FakeClock;
let audit: FakeAuditLog;

beforeEach(() => {
  clock = new FakeClock(new Date(TODAY));
  audit = new FakeAuditLog();
});

describe("addToWaitingList", () => {
  it("dates the entry from the clock rather than from the form", async () => {
    const waitingList = new FakeWaitingList();

    const added = await addToWaitingList({ waitingList, audit, clock }, application());

    expect(added.addedOn).toEqual(new Date(TODAY));
    expect(waitingList.waiting).toEqual([added]);
  });

  it("refuses an applicant whose certificate has already expired", async () => {
    const waitingList = new FakeWaitingList();
    const lapsed = application({
      certificate: { type: "Jobcenter", validUntil: at("2026-07-19") },
    });

    await expect(addToWaitingList({ waitingList, audit, clock }, lapsed)).rejects.toThrow(
      CertificateExpired,
    );
    expect(waitingList.waiting).toEqual([]);
    expect(audit.entries).toEqual([]);
  });

  it("records the applicant joining the list in the audit log", async () => {
    const waitingList = new FakeWaitingList();

    await addToWaitingList({ waitingList, audit, clock }, application());

    expect(audit.entries).toEqual([
      { what: "waitingList.added", changedFields: ["addedOn"], when: new Date(TODAY), why: "" },
    ]);
  });
});

describe("listWaiting", () => {
  it("numbers the applicants in the order they joined, whatever order the store returns", async () => {
    const first = entry(9, at("2026-05-04"));
    const second = entry(2, at("2026-06-04"));
    const third = entry(5, at("2026-07-04"));
    const waitingList = new FakeWaitingList(third, first, second);

    const places = await listWaiting({ waitingList, clock });

    expect(places.map((place) => [place.position, place.entry.id])).toEqual([
      [1, 9],
      [2, 2],
      [3, 5],
    ]);
  });

  it("flags an applicant whose certificate expired while they waited, without moving them", async () => {
    const lapsedAtTheHead = entry(1, at("2026-01-04"), "2026-06-30");
    const validBehindThem = entry(2, at("2026-02-04"));
    const waitingList = new FakeWaitingList(lapsedAtTheHead, validBehindThem);

    const places = await listWaiting({ waitingList, clock });

    expect(places).toEqual([
      { position: 1, entry: lapsedAtTheHead, daysWaiting: 197, certificateExpired: true },
      { position: 2, entry: validBehindThem, daysWaiting: 166, certificateExpired: false },
    ]);
  });

  it("states how long each applicant has waited, counted from the day they joined", async () => {
    const joinedToday = entry(1, at("2026-07-20"));
    const joinedYesterday = entry(2, at("2026-07-19"));
    const waitingList = new FakeWaitingList(joinedYesterday, joinedToday);

    const places = await listWaiting({ waitingList, clock });

    expect(places.map((place) => place.daysWaiting)).toEqual([1, 0]);
  });

  it("reports an empty waiting list as an empty list", async () => {
    expect(await listWaiting({ waitingList: new FakeWaitingList(), clock })).toEqual([]);
  });
});

describe("removeFromWaitingList", () => {
  it("takes the applicant off the list and records why in the audit log", async () => {
    const withdrawn = entry(4, at("2026-05-04"));
    const waitingList = new FakeWaitingList(withdrawn, entry(5, at("2026-06-04")));

    await removeFromWaitingList(
      { waitingList, audit, clock },
      { entryId: 4, reason: "  zieht weg  " },
    );

    expect(waitingList.removals).toEqual([
      { entryId: 4, reason: "zieht weg", removedOn: new Date(TODAY) },
    ]);
    expect(waitingList.waiting.map((waiting) => waiting.id)).toEqual([5]);
    expect(audit.entries).toEqual([
      {
        what: "waitingList.removed",
        changedFields: ["removedOn", "removalReason"],
        when: new Date(TODAY),
        why: "zieht weg",
      },
    ]);
  });

  it("refuses a removal that gives no reason", async () => {
    const waitingList = new FakeWaitingList(entry(4, at("2026-05-04")));

    await expect(
      removeFromWaitingList({ waitingList, audit, clock }, { entryId: 4, reason: "   " }),
    ).rejects.toThrow(MissingAuditReason);
    expect(waitingList.removals).toEqual([]);
    expect(waitingList.waiting).toHaveLength(1);
  });

  it("refuses to remove an applicant who is no longer waiting", async () => {
    const waitingList = new FakeWaitingList(entry(4, at("2026-05-04")));

    await expect(
      removeFromWaitingList({ waitingList, audit, clock }, { entryId: 99, reason: "zieht weg" }),
    ).rejects.toThrow(WaitingListEntryNotFound);
    expect(waitingList.removals).toEqual([]);
  });
});

describe("promoteFromWaitingList", () => {
  it("hands back a registration draft filled in from the entry, and the number it would take", async () => {
    const applicant = entry(4, at("2026-05-04"));
    const waitingList = new FakeWaitingList(applicant);
    const customers = new FakeCustomerRepository(1, 3);

    const promotion = await promoteFromWaitingList(
      { waitingList, customers, settings: new FakeSettingsRepository(240), clock },
      { entryId: 4 },
    );

    expect(promotion).toEqual({
      entryId: 4,
      customerNumber: 2,
      certificateExpired: false,
      draft: {
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        birthDate: applicant.birthDate,
        address: applicant.address,
        certificate: applicant.certificate,
        householdMembers: [
          {
            firstName: applicant.firstName,
            lastName: applicant.lastName,
            birthDate: applicant.birthDate,
          },
        ],
        notes: applicant.contactNote,
      },
    });
  });

  it("registers nobody and leaves the applicant waiting", async () => {
    const waitingList = new FakeWaitingList(entry(4, at("2026-05-04")));
    const customers = new FakeCustomerRepository();

    await promoteFromWaitingList(
      { waitingList, customers, settings: new FakeSettingsRepository(240), clock },
      { entryId: 4 },
    );

    expect(waitingList.waiting).toHaveLength(1);
    expect(waitingList.removals).toEqual([]);
    expect(customers.customers).toEqual([]);
    expect(audit.entries).toEqual([]);
  });

  it("refuses to promote anybody while every slot up to the quota is taken", async () => {
    const waitingList = new FakeWaitingList(entry(4, at("2026-05-04")));
    const customers = new FakeCustomerRepository(1, 2);

    await expect(
      promoteFromWaitingList(
        { waitingList, customers, settings: new FakeSettingsRepository(2), clock },
        { entryId: 4 },
      ),
    ).rejects.toThrow(NoFreeCustomerNumber);
    expect(waitingList.waiting).toHaveLength(1);
  });

  it("promotes an applicant whose certificate lapsed while they waited, flagging the lapse", async () => {
    const waitingList = new FakeWaitingList(entry(4, at("2026-05-04"), "2026-06-30"));

    const promotion = await promoteFromWaitingList(
      {
        waitingList,
        customers: new FakeCustomerRepository(),
        settings: new FakeSettingsRepository(240),
        clock,
      },
      { entryId: 4 },
    );

    expect(promotion).toMatchObject({ certificateExpired: true, customerNumber: 1 });
  });

  it("refuses an entry that is no longer waiting", async () => {
    await expect(
      promoteFromWaitingList(
        {
          waitingList: new FakeWaitingList(),
          customers: new FakeCustomerRepository(),
          settings: new FakeSettingsRepository(240),
          clock,
        },
        { entryId: 4 },
      ),
    ).rejects.toThrow(WaitingListEntryNotFound);
  });
});

describe("registerFromWaitingList", () => {
  function registerInput(
    overrides: Partial<RegisterFromWaitingListInput> = {},
  ): RegisterFromWaitingListInput {
    const applicant = application();
    return {
      entryId: 4,
      firstName: applicant.firstName,
      lastName: applicant.lastName,
      birthDate: applicant.birthDate,
      address: applicant.address,
      certificate: applicant.certificate,
      householdMembers: [
        {
          firstName: applicant.firstName,
          lastName: applicant.lastName,
          birthDate: applicant.birthDate,
        },
      ],
      notes: "",
      ...overrides,
    };
  }

  it("takes the applicant off the list once their registration has succeeded", async () => {
    const waitingList = new FakeWaitingList(entry(4, at("2026-05-04")));
    const customers = new FakeCustomerRepository(1);

    const customer = await registerFromWaitingList(
      { waitingList, customers, settings: new FakeSettingsRepository(240), clock, audit },
      registerInput(),
    );

    expect(customer.customerNumber).toBe(2);
    expect(waitingList.waiting).toEqual([]);
    expect(waitingList.removals).toEqual([
      { entryId: 4, reason: "customerNumber=2", removedOn: customer.registeredOn },
    ]);
  });

  it("leaves the applicant on the list when the registration fails", async () => {
    const waiting = entry(4, at("2026-05-04"));
    const waitingList = new FakeWaitingList(waiting);
    const customers = new FakeCustomerRepository();

    await expect(
      registerFromWaitingList(
        { waitingList, customers, settings: new FakeSettingsRepository(240), clock, audit },
        registerInput({ householdMembers: [] }),
      ),
    ).rejects.toThrow(EmptyHousehold);
    expect(waitingList.waiting).toEqual([waiting]);
    expect(waitingList.removals).toEqual([]);
    expect(customers.customers).toEqual([]);
  });

  it("records the promotion, naming the number the applicant received", async () => {
    const waitingList = new FakeWaitingList(entry(4, at("2026-05-04")));

    await registerFromWaitingList(
      {
        waitingList,
        customers: new FakeCustomerRepository(),
        settings: new FakeSettingsRepository(240),
        clock,
        audit,
      },
      registerInput(),
    );

    expect(audit.entries.map((logged) => logged.what)).toEqual([
      "customer.registered",
      "waitingList.promoted",
    ]);
    expect(audit.entries[1]).toEqual({
      what: "waitingList.promoted",
      changedFields: ["removedOn", "removalReason"],
      when: new Date(TODAY),
      why: "customerNumber=1",
    });
  });

  it("refuses to register from an entry that is no longer waiting", async () => {
    const customers = new FakeCustomerRepository();

    await expect(
      registerFromWaitingList(
        {
          waitingList: new FakeWaitingList(),
          customers,
          settings: new FakeSettingsRepository(240),
          clock,
          audit,
        },
        registerInput(),
      ),
    ).rejects.toThrow(WaitingListEntryNotFound);
    expect(customers.customers).toEqual([]);
  });
});
