import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createCustomerDetails,
  type CustomerStatus,
  type HouseholdMemberDetails,
  type NewCustomer,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import type { GroupCounts } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import {
  BirthDateInFuture,
  CustomerArchived,
  CustomerNotFound,
  EmptyHousehold,
  MissingRequiredField,
} from "@/domain/errors";
import type { ArchivedCustomer, AuditEntry, AuditLog, Clock, CustomerRepository } from "../ports";
import { listCardsDueForReissue } from "./cards-due-for-reissue";
import { updateHousehold } from "./update-household";

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

  groupCounts(): Promise<GroupCounts> {
    return Promise.resolve({ red: 0, blue: 0 });
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
  /** The household on file. Defaults to one grown-up and one child born `2015-06-02`. */
  readonly members?: ReadonlyArray<HouseholdMemberDetails>;
}

/** A customer as the register already holds them, with a card printing what they were at issue. */
function household({
  id,
  customerNumber,
  status = "ACTIVE",
  members = [member(), member({ birthDate: CHILD_BIRTH_DATE })],
}: HouseholdOptions): RegisteredCustomer {
  const details = createCustomerDetails(
    {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      birthDate: GROWN_UP_BIRTH_DATE,
      address: {
        street: faker.location.street(),
        houseNumber: faker.location.buildingNumber(),
        zip: faker.location.zipCode("#####"),
        city: faker.location.city(),
      },
      certificate: { type: "Jobcenter", validUntil: new Date("2027-01-31T00:00:00.000Z") },
      householdMembers: members,
      notes: "",
    },
    new Date(TODAY),
  );
  return {
    id,
    customerNumber,
    group: "RED",
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
