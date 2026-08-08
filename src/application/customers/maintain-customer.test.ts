import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createCustomerDetails,
  NOTES_MAX_LENGTH,
  type CustomerStatus,
  type HouseholdMemberDetails,
  type NewCustomer,
  type PersonalDetails,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import type { Group, GroupCounts } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import type { DistributionRecord } from "@/domain/distribution/distributionRecord";
import {
  BirthDateInFuture,
  CustomerArchived,
  CustomerNotFound,
  EmptyHousehold,
  GroupUnchanged,
  MissingRequiredField,
  NotesTooLong,
} from "@/domain/errors";
import { createSettings, type SettingsVersion } from "@/domain/policy/settings";
import type {
  ArchivedCustomer,
  AuditEntry,
  AuditLog,
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  ReminderLogEntry,
  ReminderLogRepository,
  SettingsRepository,
} from "../ports";
import { listCardsDueForReissue } from "./cards-due-for-reissue";
import { changeGroup } from "./change-group";
import { lookupCustomer } from "./lookup-customer";
import { updateCustomerDetails, type UpdateCustomerDetailsInput } from "./update-customer-details";
import { updateHousehold } from "./update-household";
import { updateNotes } from "./update-notes";

/**
 * Hand-written fakes and synthetic data only, per the testing standard.
 *
 * The birthdates are fixed rather than faked, because every count in this suite is derived from
 * them: the grown-up was born in 1985 and the child on `2015-06-02`, which leaves them a child on
 * {@link TODAY}.
 */

faker.seed(20260729);

const TODAY = "2026-07-29T09:00:00.000Z";

const GROWN_UP_BIRTH_DATE = new Date("1985-03-11T00:00:00.000Z");
const CHILD_BIRTH_DATE = new Date("2015-06-02T00:00:00.000Z");

function fakeClock(now: string): Clock {
  return { now: () => new Date(now) };
}

function member(overrides: Partial<HouseholdMemberDetails> = {}): HouseholdMemberDetails {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: GROWN_UP_BIRTH_DATE,
    ...overrides,
  };
}

class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

/**
 * The three stores the **counter lookup** needs, and nothing else in this file does.
 *
 * They are here because one rule of US-16.3 is about a consequence rather than a write: a note saved
 * on the record has to turn up at the counter. That is provable only by driving the real
 * `lookupCustomer` over the same register, the way `updateHousehold`'s tests drive the real
 * cards-due list — an assertion on the stored column would prove the write and not the reading of it.
 */
class FakeSettingsRepository implements SettingsRepository {
  readonly versions: SettingsVersion[] = [];

  constructor(...versions: SettingsVersion[]) {
    this.versions.push(...versions);
  }

  listVersions(): Promise<SettingsVersion[]> {
    return Promise.resolve([...this.versions]);
  }

  append(version: SettingsVersion): Promise<void> {
    this.versions.push(version);
    return Promise.resolve();
  }
}

/** No household in this file has ever collected, so every read is the empty history. */
class FakeDistributionRecordRepository implements DistributionRecordRepository {
  listForCustomer(): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve([]);
  }

  listForDay(): Promise<ReadonlyArray<DistributionRecord>> {
    return Promise.resolve([]);
  }

  findById(): Promise<DistributionRecord | null> {
    return Promise.resolve(null);
  }

  create(): Promise<DistributionRecord> {
    return Promise.reject(new Error("No use case in this file records a hand-out"));
  }

  setPaid(): Promise<DistributionRecord> {
    return Promise.reject(new Error("No use case in this file corrects a hand-out"));
  }

  remove(): Promise<void> {
    return Promise.reject(new Error("No use case in this file removes a hand-out"));
  }
}

/** No reminder has ever been logged here, so today's is always still open. */
class FakeReminderLogRepository implements ReminderLogRepository {
  findOnDay(): Promise<ReminderLogEntry | null> {
    return Promise.resolve(null);
  }

  record(): Promise<void> {
    return Promise.reject(new Error("No use case in this file logs a reminder"));
  }
}

/** The policy in force throughout: DF's own numbers, anchored so that `2026-07-29` is a RED week. */
const SETTINGS: SettingsVersion = {
  recordedAt: new Date("2026-01-01T00:00:00.000Z"),
  settings: createSettings({
    quotaN: 240,
    portionsPerGrownUp: 2,
    portionsPerChild: 1,
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 3,
    pricePerGrownUp: 200,
    pricePerChild: 100,
    priceCap: null,
  }),
};

/**
 * A register that stores a household the way the adapter does: `updateHousehold` **replaces** the
 * rows, so a test can prove the previous composition is gone rather than stacked behind the new one.
 */
class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];

  constructor(...holders: RegisteredCustomer[]) {
    this.holders.push(...holders);
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.holders.find((customer) => customer.id === id) ?? null);
  }

  findByCustomerNumber(customerNumber: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(
      this.holders.find((customer) => customer.customerNumber === customerNumber) ?? null,
    );
  }

  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve(
      this.holders
        .filter((customer) => customer.status === status)
        .sort((a, b) => a.customerNumber - b.customerNumber),
    );
  }

  /**
   * No use case in this file browses the register (US-15.1); the method is here because the port
   * has it. Answering with nothing is honest — nothing here asks the list a question.
   */
  list(): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve([]);
  }

  /**
   * No use case in this file searches the archive (US-11.1); the method is here because the port has
   * it, and an edit never looks for an archived household — it is handed the id of one it holds.
   */
  searchArchived(): Promise<ReadonlyArray<ArchivedCustomer>> {
    return Promise.resolve([]);
  }

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    return Promise.resolve(
      this.holders
        .filter((customer) => customer.status !== "ARCHIVED")
        .map((customer) => customer.customerNumber),
    );
  }

  /**
   * The two group sizes, counted off the holders like the adapter counts rows — archived households
   * excluded, because they turn up to nothing. `changeGroup` reports these numbers back to its
   * caller, so a stub would prove only that a constant travels.
   */
  groupCounts(): Promise<GroupCounts> {
    const onRegister = this.holders.filter((customer) => customer.status !== "ARCHIVED");
    return Promise.resolve({
      red: onRegister.filter((customer) => customer.group === "RED").length,
      blue: onRegister.filter((customer) => customer.group === "BLUE").length,
    });
  }

  create(customer: NewCustomer): Promise<RegisteredCustomer> {
    const registered: RegisteredCustomer = {
      ...customer,
      id: this.holders.length + 1,
      blockReason: null,
      archiveReason: null,
      archivedAt: null,
      registeredOn: customer.card.issuedAt,
    };
    this.holders.push(registered);
    return Promise.resolve(registered);
  }

  // Like the adapter's single statement: the rows the household had are replaced by the ones given,
  // and nothing else on the record — the card and its printed counts above all — is touched.
  updateHousehold(id: number, members: ReadonlyArray<HouseholdMemberDetails>): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    const held = this.holders[index];
    this.holders[index] = {
      ...held,
      details: { ...held.details, householdMembers: [...members] },
    };
    return Promise.resolve();
  }

  // Like the adapter's transaction: the personal data and the household land together, so a test
  // can prove the customer's own member row moved with their name rather than lagging behind it.
  updateDetails(
    id: number,
    details: PersonalDetails,
    household: ReadonlyArray<HouseholdMemberDetails>,
  ): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    const held = this.holders[index];
    this.holders[index] = {
      ...held,
      details: { ...held.details, ...details, householdMembers: [...household] },
    };
    return Promise.resolve();
  }

  updateNotes(id: number, notes: string): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    const held = this.holders[index];
    this.holders[index] = { ...held, details: { ...held.details, notes } };
    return Promise.resolve();
  }

  setGroup(id: number, group: Group): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    this.holders[index] = { ...this.holders[index], group };
    return Promise.resolve();
  }

  setStatus(id: number, status: CustomerStatus, blockReason: string | null): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    this.holders[index] = { ...this.holders[index], status, blockReason };
    return Promise.resolve();
  }

  archive(id: number, reason: string, archivedAt: Date): Promise<void> {
    const index = this.holders.findIndex((customer) => customer.id === id);
    if (index === -1) {
      return Promise.reject(new CustomerNotFound(id));
    }
    this.holders[index] = {
      ...this.holders[index],
      status: "ARCHIVED",
      blockReason: null,
      archiveReason: reason,
      archivedAt,
    };
    return Promise.resolve();
  }
}

interface HouseholdOptions {
  readonly id: number;
  readonly customerNumber: number;
  readonly status?: CustomerStatus;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly notes?: string;
  /**
   * The household on file. Defaults to the customer themselves plus one child born `2015-06-02` —
   * the shape a registration leaves behind, where the first row *is* the registered person.
   */
  readonly members?: ReadonlyArray<HouseholdMemberDetails>;
  /** Which half of the cycle they collect in. Defaults to `RED`, which their card also prints. */
  readonly group?: Group;
}

/** A customer as the register already holds them, with a card printing what they were at issue. */
function household({
  id,
  customerNumber,
  status = "ACTIVE",
  firstName = faker.person.firstName(),
  lastName = faker.person.lastName(),
  notes = "",
  members,
  group = "RED",
}: HouseholdOptions): RegisteredCustomer {
  const details = createCustomerDetails(
    {
      firstName,
      lastName,
      birthDate: GROWN_UP_BIRTH_DATE,
      address: {
        street: faker.location.street(),
        houseNumber: faker.location.buildingNumber(),
        zip: faker.location.zipCode("#####"),
        city: faker.location.city(),
      },
      certificate: { type: "Jobcenter", validUntil: new Date("2027-01-31T00:00:00.000Z") },
      householdMembers: members ?? [
        { firstName, lastName, birthDate: GROWN_UP_BIRTH_DATE },
        member({ birthDate: CHILD_BIRTH_DATE }),
      ],
      notes,
    },
    new Date(TODAY),
  );
  return {
    id,
    customerNumber,
    group,
    status,
    blockReason: status === "BLOCKED" ? "Hausverbot" : null,
    archiveReason: status === "ARCHIVED" ? "Weggezogen" : null,
    archivedAt: status === "ARCHIVED" ? new Date(TODAY) : null,
    reminderCount: 0,
    details,
    card: {
      index: 1,
      issuedAt: new Date(TODAY),
      reason: "FIRST_ISSUE",
      countsAtIssue: composition(details.householdMembers, new Date(TODAY)),
      groupAtIssue: group,
    },
    registeredOn: new Date(TODAY),
    previousCustomerId: null,
  };
}

describe("updateHousehold", () => {
  let customers: FakeCustomerRepository;
  let audit: FakeAuditLog;

  function deps() {
    return { customers, audit, clock: fakeClock(TODAY) };
  }

  /** The household on file, as the register holds it after whatever the use case did. */
  function storedMembers(id = 1): ReadonlyArray<HouseholdMemberDetails> {
    const stored = customers.holders.find((customer) => customer.id === id);
    return stored === undefined ? [] : stored.details.householdMembers;
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository(household({ id: 1, customerNumber: 50 }));
    audit = new FakeAuditLog();
  });

  it("replaces the household with the members it was given", async () => {
    const members = [member(), member(), member({ birthDate: CHILD_BIRTH_DATE })];

    await updateHousehold(deps(), { customerId: 1, members });

    expect(storedMembers()).toEqual(members);
  });

  it("keeps no history of the composition it replaced", async () => {
    const before = storedMembers();

    await updateHousehold(deps(), { customerId: 1, members: [member()] });

    expect(storedMembers()).toHaveLength(1);
    expect(storedMembers()).not.toContainEqual(before[1]);
  });

  it("stores the members trimmed, by registration's rules rather than a second set", async () => {
    await updateHousehold(deps(), {
      customerId: 1,
      members: [member({ firstName: "  Anna  ", lastName: " Meier " })],
    });

    expect(storedMembers()[0].firstName).toBe("Anna");
    expect(storedMembers()[0].lastName).toBe("Meier");
  });

  it("rejects an empty household, exactly as a registration would", async () => {
    await expect(updateHousehold(deps(), { customerId: 1, members: [] })).rejects.toThrow(
      EmptyHousehold,
    );
  });

  it("rejects a member born after today, exactly as a registration would", async () => {
    const members = [member({ birthDate: new Date("2026-07-30T00:00:00.000Z") })];

    await expect(updateHousehold(deps(), { customerId: 1, members })).rejects.toThrow(
      BirthDateInFuture,
    );
  });

  it("rejects a member whose name was left blank", async () => {
    const members = [member({ firstName: "   " })];

    await expect(updateHousehold(deps(), { customerId: 1, members })).rejects.toThrow(
      MissingRequiredField,
    );
  });

  it("leaves the household and the log untouched when the edit is rejected", async () => {
    const before = storedMembers();

    await expect(updateHousehold(deps(), { customerId: 1, members: [] })).rejects.toThrow(
      EmptyHousehold,
    );

    expect(storedMembers()).toEqual(before);
    expect(audit.entries).toEqual([]);
  });

  it("writes no count, portion or price — the record still carries none", async () => {
    await updateHousehold(deps(), { customerId: 1, members: [member(), member()] });

    const stored = customers.holders[0];
    expect(Object.keys(stored)).not.toContain("grownUps");
    expect(Object.keys(stored.details)).not.toContain("grownUps");
    // What the card prints is a snapshot of a physical object and stays as it was issued — a
    // reissue, not an edit, is how the household's change reaches the card (US-13.3).
    expect(stored.card.countsAtIssue).toEqual({ grownUps: 1, children: 1 });
  });

  it("puts the household on the cards-due list when the edit changed the counts", async () => {
    await updateHousehold(deps(), {
      customerId: 1,
      members: [member(), member({ birthDate: CHILD_BIRTH_DATE }), member()],
    });

    const due = await listCardsDueForReissue({ customers, clock: fakeClock(TODAY) });

    expect(due).toHaveLength(1);
    expect(due[0].customerId).toBe(1);
    expect(due[0].reason).toBe("HOUSEHOLD_CHANGE");
    expect(due[0].countsToday).toEqual({ grownUps: 2, children: 1 });
  });

  it("leaves a spelling fix off the cards-due list — the printed counts still hold", async () => {
    const [grownUp, child] = storedMembers();

    await updateHousehold(deps(), {
      customerId: 1,
      members: [{ ...grownUp, lastName: "Meier" }, child],
    });

    expect(await listCardsDueForReissue({ customers, clock: fakeClock(TODAY) })).toEqual([]);
  });

  it("records the change under a stable event name, with no actor", async () => {
    await updateHousehold(deps(), { customerId: 1, members: [member()] });

    expect(audit.entries).toEqual([
      {
        what: "customer.householdUpdated",
        changedFields: ["householdMembers"],
        when: new Date(TODAY),
        why: "",
      },
    ]);
  });

  it("edits a blocked household — a block pauses the counter, not the record", async () => {
    customers.holders.push(household({ id: 2, customerNumber: 51, status: "BLOCKED" }));

    await updateHousehold(deps(), { customerId: 2, members: [member()] });

    expect(storedMembers(2)).toHaveLength(1);
  });

  it("refuses to edit an archived household, whose record is read-only", async () => {
    customers.holders.push(household({ id: 2, customerNumber: 51, status: "ARCHIVED" }));

    await expect(updateHousehold(deps(), { customerId: 2, members: [member()] })).rejects.toThrow(
      CustomerArchived,
    );
    expect(storedMembers(2)).toHaveLength(2);
    expect(audit.entries).toEqual([]);
  });

  it("refuses an id that belongs to nobody rather than editing nothing at all", async () => {
    await expect(updateHousehold(deps(), { customerId: 99, members: [member()] })).rejects.toThrow(
      CustomerNotFound,
    );
    expect(audit.entries).toEqual([]);
  });
});

describe("updateCustomerDetails", () => {
  let customers: FakeCustomerRepository;
  let audit: FakeAuditLog;

  const ADDRESS = { street: "Lange Straße", houseNumber: "7a", zip: "33129", city: "Delbrück" };

  function deps() {
    return { customers, audit, clock: fakeClock(TODAY) };
  }

  function stored(id = 1): RegisteredCustomer {
    const held = customers.holders.find((customer) => customer.id === id);
    if (held === undefined) {
      throw new Error(`the fixture holds no customer ${id}`);
    }
    return held;
  }

  /** The correction the tests below start from: everything named, so nothing is left to a default. */
  function correction(overrides: Partial<UpdateCustomerDetailsInput> = {}) {
    return {
      customerId: 1,
      firstName: "Anna",
      lastName: "Schmidt",
      birthDate: GROWN_UP_BIRTH_DATE,
      address: ADDRESS,
      ...overrides,
    };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository(
      household({ id: 1, customerNumber: 50, firstName: "Anna", lastName: "Meier" }),
    );
    audit = new FakeAuditLog();
  });

  it("stores the corrected name, birthdate and address", async () => {
    await updateCustomerDetails(deps(), correction());

    expect(stored().details.firstName).toBe("Anna");
    expect(stored().details.lastName).toBe("Schmidt");
    expect(stored().details.address).toEqual(ADDRESS);
  });

  it("trims every field, by registration's rules rather than a second set", async () => {
    await updateCustomerDetails(
      deps(),
      correction({
        firstName: "  Anna  ",
        lastName: " Schmidt ",
        address: { ...ADDRESS, city: "  Delbrück " },
      }),
    );

    expect(stored().details.firstName).toBe("Anna");
    expect(stored().details.lastName).toBe("Schmidt");
    expect(stored().details.address.city).toBe("Delbrück");
  });

  it("moves the customer's own household row with their name, so the two cannot disagree", async () => {
    await updateCustomerDetails(deps(), correction());

    expect(stored().details.householdMembers[0]).toEqual({
      firstName: "Anna",
      lastName: "Schmidt",
      birthDate: GROWN_UP_BIRTH_DATE,
    });
  });

  it("leaves the rest of the household exactly as it was", async () => {
    const child = stored().details.householdMembers[1];

    await updateCustomerDetails(deps(), correction());

    expect(stored().details.householdMembers).toHaveLength(2);
    expect(stored().details.householdMembers[1]).toEqual(child);
  });

  it("carries a corrected birthdate into the household row too", async () => {
    await updateCustomerDetails(
      deps(),
      correction({ birthDate: new Date("1986-03-11T00:00:00.000Z") }),
    );

    expect(stored().details.householdMembers[0].birthDate).toEqual(
      new Date("1986-03-11T00:00:00.000Z"),
    );
  });

  it("leaves the household alone when no row was ever the customer", async () => {
    customers.holders.push(
      household({
        id: 2,
        customerNumber: 51,
        firstName: "Bert",
        lastName: "Kranz",
        members: [member(), member({ birthDate: CHILD_BIRTH_DATE })],
      }),
    );
    const before = stored(2).details.householdMembers;

    await updateCustomerDetails(deps(), correction({ customerId: 2 }));

    expect(stored(2).details.householdMembers).toEqual(before);
    expect(stored(2).details.lastName).toBe("Schmidt");
  });

  it("cannot touch the customer number — the input has no field for one", async () => {
    await updateCustomerDetails(deps(), correction());

    expect(stored().customerNumber).toBe(50);
    expect(Object.keys(correction())).not.toContain("customerNumber");
  });

  it("leaves a corrected name off the cards-due list — the printed counts still hold", async () => {
    await updateCustomerDetails(deps(), correction());

    expect(await listCardsDueForReissue({ customers, clock: fakeClock(TODAY) })).toEqual([]);
  });

  it("puts the household on the cards-due list when the corrected birthdate changed the counts", async () => {
    // The customer was recorded as born in 1985 and is in truth a child of the household: their row
    // moves with the correction, so the counts follow it without anything being enqueued.
    await updateCustomerDetails(deps(), correction({ birthDate: CHILD_BIRTH_DATE }));

    const due = await listCardsDueForReissue({ customers, clock: fakeClock(TODAY) });

    expect(due).toHaveLength(1);
    expect(due[0].reason).toBe("HOUSEHOLD_CHANGE");
    expect(due[0].countsToday).toEqual({ grownUps: 0, children: 2 });
  });

  it("rejects a name left blank, exactly as a registration would", async () => {
    await expect(updateCustomerDetails(deps(), correction({ lastName: "   " }))).rejects.toThrow(
      MissingRequiredField,
    );
  });

  it("rejects an address part left blank, exactly as a registration would", async () => {
    const address = { ...ADDRESS, zip: "" };

    await expect(updateCustomerDetails(deps(), correction({ address }))).rejects.toThrow(
      MissingRequiredField,
    );
  });

  it("rejects a birthdate after today, exactly as a registration would", async () => {
    const birthDate = new Date("2026-07-30T00:00:00.000Z");

    await expect(updateCustomerDetails(deps(), correction({ birthDate }))).rejects.toThrow(
      BirthDateInFuture,
    );
  });

  it("leaves the record and the log untouched when the correction is rejected", async () => {
    const before = stored().details;

    await expect(updateCustomerDetails(deps(), correction({ firstName: " " }))).rejects.toThrow(
      MissingRequiredField,
    );

    expect(stored().details).toEqual(before);
    expect(audit.entries).toEqual([]);
  });

  it("records the change under a stable event name, with no actor", async () => {
    await updateCustomerDetails(deps(), correction());

    expect(audit.entries).toEqual([
      {
        what: "customer.detailsUpdated",
        changedFields: ["firstName", "lastName", "birthDate", "address"],
        when: new Date(TODAY),
        why: "",
      },
    ]);
  });

  it("corrects a blocked household — a block pauses the counter, not the record", async () => {
    customers.holders.push(household({ id: 2, customerNumber: 51, status: "BLOCKED" }));

    await updateCustomerDetails(deps(), correction({ customerId: 2 }));

    expect(stored(2).details.lastName).toBe("Schmidt");
  });

  it("refuses to correct an archived household, whose record is read-only", async () => {
    customers.holders.push(
      household({ id: 2, customerNumber: 51, status: "ARCHIVED", lastName: "Kranz" }),
    );

    await expect(updateCustomerDetails(deps(), correction({ customerId: 2 }))).rejects.toThrow(
      CustomerArchived,
    );
    expect(stored(2).details.lastName).toBe("Kranz");
    expect(audit.entries).toEqual([]);
  });

  it("refuses an id that belongs to nobody rather than correcting nothing at all", async () => {
    await expect(updateCustomerDetails(deps(), correction({ customerId: 99 }))).rejects.toThrow(
      CustomerNotFound,
    );
    expect(audit.entries).toEqual([]);
  });
});

describe("updateNotes", () => {
  let customers: FakeCustomerRepository;
  let audit: FakeAuditLog;

  function deps() {
    return { customers, audit, clock: fakeClock(TODAY) };
  }

  function storedNotes(id = 1): string {
    const held = customers.holders.find((customer) => customer.id === id);
    return held === undefined ? "" : held.details.notes;
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository(
      household({ id: 1, customerNumber: 50, notes: "Klingel defekt" }),
    );
    audit = new FakeAuditLog();
  });

  it("saves the note as it was written, line breaks and all", async () => {
    await updateNotes(deps(), { customerId: 1, notes: "Klingel defekt\nBitte anrufen" });

    expect(storedNotes()).toBe("Klingel defekt\nBitte anrufen");
  });

  it("accepts an empty note — most households need none", async () => {
    await updateNotes(deps(), { customerId: 1, notes: "" });

    expect(storedNotes()).toBe("");
  });

  it("shows the saved note at the counter, where it is meant to be read", async () => {
    await updateNotes(deps(), { customerId: 1, notes: "Holt für die Nachbarin mit ab" });

    const lookup = await lookupCustomer(
      {
        customers,
        settings: new FakeSettingsRepository(SETTINGS),
        records: new FakeDistributionRecordRepository(),
        reminders: new FakeReminderLogRepository(),
        clock: fakeClock(TODAY),
      },
      "50",
    );

    expect(lookup.customer?.notes).toBe("Holt für die Nachbarin mit ab");
  });

  it("rejects a note longer than the record keeps, writing nothing", async () => {
    const before = storedNotes();

    await expect(
      updateNotes(deps(), { customerId: 1, notes: "x".repeat(NOTES_MAX_LENGTH + 1) }),
    ).rejects.toThrow(NotesTooLong);

    expect(storedNotes()).toBe(before);
    expect(audit.entries).toEqual([]);
  });

  it("accepts a note of exactly the maximum length", async () => {
    await updateNotes(deps(), { customerId: 1, notes: "x".repeat(NOTES_MAX_LENGTH) });

    expect(storedNotes()).toHaveLength(NOTES_MAX_LENGTH);
  });

  it("records the change under a stable event name, without repeating the note itself", async () => {
    await updateNotes(deps(), { customerId: 1, notes: "Neue Notiz" });

    expect(audit.entries).toEqual([
      {
        what: "customer.notesUpdated",
        changedFields: ["notes"],
        when: new Date(TODAY),
        why: "",
      },
    ]);
  });

  it("annotates a blocked household — a block pauses the counter, not the record", async () => {
    customers.holders.push(household({ id: 2, customerNumber: 51, status: "BLOCKED" }));

    await updateNotes(deps(), { customerId: 2, notes: "Termin vereinbart" });

    expect(storedNotes(2)).toBe("Termin vereinbart");
  });

  it("refuses to annotate an archived household, whose record is read-only", async () => {
    customers.holders.push(
      household({ id: 2, customerNumber: 51, status: "ARCHIVED", notes: "Weggezogen" }),
    );

    await expect(updateNotes(deps(), { customerId: 2, notes: "Neue Notiz" })).rejects.toThrow(
      CustomerArchived,
    );
    expect(storedNotes(2)).toBe("Weggezogen");
    expect(audit.entries).toEqual([]);
  });

  it("refuses an id that belongs to nobody rather than annotating nothing at all", async () => {
    await expect(updateNotes(deps(), { customerId: 99, notes: "Neue Notiz" })).rejects.toThrow(
      CustomerNotFound,
    );
    expect(audit.entries).toEqual([]);
  });
});

/**
 * `changeGroup` (US-16.4).
 *
 * Two things are asserted by driving the *real* downstream reads rather than the stored column: the
 * counter's verdict, which is what "in force immediately" means, and the cards-due list, which is
 * the consequence the household is left carrying. Neither is a flag this use case sets.
 */
describe("changeGroup", () => {
  /** A Wednesday in a RED week under {@link SETTINGS}; {@link TODAY} itself falls in a BLUE one. */
  const RED_DISTRIBUTION_DAY = "2026-08-05T09:00:00.000Z";

  let customers: FakeCustomerRepository;
  let audit: FakeAuditLog;

  function deps(now = TODAY) {
    return { customers, audit, clock: fakeClock(now) };
  }

  function storedGroup(id = 1): Group | undefined {
    return customers.holders.find((customer) => customer.id === id)?.group;
  }

  /** The counter reading the same register, so the verdict is derived and not asserted from a flag. */
  function counterDeps(now: string) {
    return {
      customers,
      settings: new FakeSettingsRepository(SETTINGS),
      records: new FakeDistributionRecordRepository(),
      reminders: new FakeReminderLogRepository(),
      clock: fakeClock(now),
    };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository(
      household({ id: 1, customerNumber: 50, group: "BLUE" }),
      household({ id: 2, customerNumber: 51, group: "RED" }),
      household({ id: 3, customerNumber: 52, group: "RED" }),
    );
    audit = new FakeAuditLog();
  });

  it("moves the customer to the group it was given", async () => {
    await changeGroup(deps(), { customerId: 1, group: "RED" });

    expect(storedGroup()).toBe("RED");
  });

  it("reports the group sizes as they stand after the move, not before it", async () => {
    const counts = await changeGroup(deps(), { customerId: 1, group: "RED" });

    expect(counts).toEqual({ red: 3, blue: 0 });
  });

  it("counts only households still on the register in the sizes it reports", async () => {
    customers.holders.push(household({ id: 4, customerNumber: 53, status: "ARCHIVED" }));

    const counts = await changeGroup(deps(), { customerId: 1, group: "RED" });

    expect(counts).toEqual({ red: 3, blue: 0 });
  });

  it("serves a household moved to Red in a Red week on the same day", async () => {
    // Before the move they are BLUE in a RED week, which the counter turns away.
    const before = await lookupCustomer(counterDeps(RED_DISTRIBUTION_DAY), "50");
    expect(before.verdict.kind).toBe("WRONG_GROUP");

    await changeGroup(deps(RED_DISTRIBUTION_DAY), { customerId: 1, group: "RED" });

    const after = await lookupCustomer(counterDeps(RED_DISTRIBUTION_DAY), "50");
    expect(after.verdict.kind).toBe("CLEAR_TO_SERVE");
  });

  it("puts the household on the cards-due list, because the card prints the group", async () => {
    await changeGroup(deps(), { customerId: 1, group: "RED" });

    const due = await listCardsDueForReissue({ customers, clock: fakeClock(TODAY) });

    expect(due).toHaveLength(1);
    expect(due[0].customerId).toBe(1);
    expect(due[0].reason).toBe("GROUP_CHANGE");
    expect(due[0].groupOnCard).toBe("BLUE");
    expect(due[0].groupToday).toBe("RED");
  });

  it("leaves the counts printed on the card exactly as they were", async () => {
    await changeGroup(deps(), { customerId: 1, group: "RED" });

    // A group move changes no birthdate, so the printed counts are still true — only the week is
    // wrong, which is what the reason above says.
    const stored = customers.holders[0];
    expect(stored.card.countsAtIssue).toEqual({ grownUps: 1, children: 1 });
    expect(stored.card.groupAtIssue).toBe("BLUE");
  });

  it("records the change under a stable event name, naming the group as the field that moved", async () => {
    await changeGroup(deps(), { customerId: 1, group: "RED" });

    expect(audit.entries).toEqual([
      {
        what: "customer.groupChanged",
        changedFields: ["group"],
        when: new Date(TODAY),
        why: "",
      },
    ]);
  });

  it("refuses a move to the group the household is already in, writing nothing", async () => {
    await expect(changeGroup(deps(), { customerId: 1, group: "BLUE" })).rejects.toThrow(
      GroupUnchanged,
    );

    expect(storedGroup()).toBe("BLUE");
    expect(audit.entries).toEqual([]);
  });

  it("moves a blocked household — balancing the groups is DF's business, not theirs", async () => {
    customers.holders.push(household({ id: 4, customerNumber: 53, status: "BLOCKED" }));

    await changeGroup(deps(), { customerId: 4, group: "BLUE" });

    expect(storedGroup(4)).toBe("BLUE");
  });

  it("refuses to move an archived household, whose record is read-only", async () => {
    customers.holders.push(household({ id: 4, customerNumber: 53, status: "ARCHIVED" }));

    await expect(changeGroup(deps(), { customerId: 4, group: "BLUE" })).rejects.toThrow(
      CustomerArchived,
    );
    expect(storedGroup(4)).toBe("RED");
    expect(audit.entries).toEqual([]);
  });

  it("refuses an id that belongs to nobody rather than moving nothing at all", async () => {
    await expect(changeGroup(deps(), { customerId: 99, group: "BLUE" })).rejects.toThrow(
      CustomerNotFound,
    );
    expect(audit.entries).toEqual([]);
  });
});
