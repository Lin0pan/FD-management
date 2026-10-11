import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import type { CardIssueReason, IssuedCard } from "@/domain/card/card";
import {
  createCustomerDetails,
  type CustomerStatus,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import type { GroupCounts } from "@/domain/customer/group";
import type { ArchivedCustomer, CustomerRepository } from "../ports";
import { countCardsToPrint, justPrintedCard, listCardsToPrint } from "./cards-to-print";

/** Hand-written fakes and synthetic data only. */

faker.seed(20261001);

const ISSUED = new Date("2026-09-14T10:00:00.000Z");

/** A register the query reads and nothing else; every write belongs to another suite. */
class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];

  list(): Promise<ReadonlyArray<RegisteredCustomer>> {
    return Promise.resolve([]);
  }

  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>> {
    // Customer number ascending, like the adapter's `orderBy`.
    return Promise.resolve(
      this.holders
        .filter((customer) => customer.status === status)
        .sort((a, b) => a.customerNumber - b.customerNumber),
    );
  }

  findById(id: number): Promise<RegisteredCustomer | null> {
    return Promise.resolve(this.holders.find((customer) => customer.id === id) ?? null);
  }

  findByCustomerNumber(): Promise<RegisteredCustomer | null> {
    return Promise.reject(new Error("the list never looks a number up"));
  }

  takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    return Promise.reject(new Error("the list allocates no number"));
  }

  groupCounts(): Promise<GroupCounts> {
    return Promise.reject(new Error("the list counts no group"));
  }

  searchArchived(): Promise<ReadonlyArray<ArchivedCustomer>> {
    return Promise.reject(new Error("the list searches no archive"));
  }

  create(): Promise<RegisteredCustomer> {
    return Promise.reject(new Error("the list writes nothing"));
  }

  updateHousehold(): Promise<void> {
    return Promise.reject(new Error("the list writes nothing"));
  }

  updateDetails(): Promise<void> {
    return Promise.reject(new Error("the list writes nothing"));
  }

  updateNotes(): Promise<void> {
    return Promise.reject(new Error("the list writes nothing"));
  }

  changeCustomerNumber(): Promise<IssuedCard> {
    return Promise.reject(new Error("the list writes nothing"));
  }

  setStatus(): Promise<void> {
    return Promise.reject(new Error("the list writes nothing"));
  }

  archive(): Promise<void> {
    return Promise.reject(new Error("the list writes nothing"));
  }
}

interface HouseholdOptions {
  readonly id: number;
  readonly customerNumber: number;
  readonly status?: CustomerStatus;
  /** Which card of the run they hold. Defaults to the first. */
  readonly cardIndex?: number;
  readonly reason?: CardIssueReason;
  readonly issuedAt?: Date;
  /** `null` — the default — is a card still to be printed. */
  readonly printedAt?: Date | null;
}

/** A customer as the register already holds them, holding the card a test needs. */
function household({
  id,
  customerNumber,
  status = "ACTIVE",
  cardIndex = 1,
  reason = "FIRST_ISSUE",
  issuedAt = ISSUED,
  printedAt = null,
}: HouseholdOptions): RegisteredCustomer {
  const self = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: new Date("1985-03-11T00:00:00.000Z"),
  };
  const details = createCustomerDetails(
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
    ISSUED,
  );
  return {
    id,
    customerNumber,
    status,
    blockReason: status === "BLOCKED" ? "Hausverbot" : null,
    archiveReason: status === "ARCHIVED" ? "Weggezogen" : null,
    archivedAt: status === "ARCHIVED" ? ISSUED : null,
    reminderCount: 0,
    details,
    card: {
      customerNumber,
      index: cardIndex,
      issuedAt,
      reason,
      countsAtIssue: { grownUps: 1, children: 0 },
      printedAt,
    },
    registeredOn: ISSUED,
    previousCustomerId: null,
  };
}

describe("listCardsToPrint", () => {
  let customers: FakeCustomerRepository;

  beforeEach(() => {
    customers = new FakeCustomerRepository();
  });

  it("lists a household whose card is not yet printed", async () => {
    customers.holders.push(household({ id: 4, customerNumber: 12, cardIndex: 2, reason: "LOST" }));
    const [holder] = customers.holders;

    expect(await listCardsToPrint({ customers })).toEqual([
      {
        customerId: 4,
        customerNumber: 12,
        firstName: holder.details.firstName,
        lastName: holder.details.lastName,
        blocked: false,
        index: 2,
        cardNumber: "12k2",
        issuedAt: ISSUED,
        reason: "LOST",
      },
    ]);
  });

  it("leaves out a household whose card is printed", async () => {
    customers.holders.push(household({ id: 1, customerNumber: 12, printedAt: ISSUED }));

    expect(await listCardsToPrint({ customers })).toEqual([]);
  });

  it("lists only the card a household holds", async () => {
    // The register's read model carries the current card alone, so a replaced one cannot appear —
    // and the row names the replacement, not the card before it (D4).
    customers.holders.push(household({ id: 1, customerNumber: 12, cardIndex: 3 }));

    const rows = await listCardsToPrint({ customers });

    expect(rows.map((row) => row.cardNumber)).toEqual(["12k3"]);
  });

  it("keeps a blocked household on the list", async () => {
    customers.holders.push(household({ id: 1, customerNumber: 12, status: "BLOCKED" }));

    const [row] = await listCardsToPrint({ customers });

    expect(row.blocked).toBe(true);
  });

  it("drops an archived household from the list", async () => {
    customers.holders.push(household({ id: 1, customerNumber: 12, status: "ARCHIVED" }));

    expect(await listCardsToPrint({ customers })).toEqual([]);
  });

  it("puts the longest-waiting card first", async () => {
    customers.holders.push(
      household({ id: 1, customerNumber: 7, issuedAt: new Date("2026-09-20T10:00:00.000Z") }),
      household({
        id: 2,
        customerNumber: 30,
        status: "BLOCKED",
        issuedAt: new Date("2026-09-02T10:00:00.000Z"),
      }),
      household({ id: 3, customerNumber: 15, issuedAt: new Date("2026-09-10T10:00:00.000Z") }),
    );

    const rows = await listCardsToPrint({ customers });

    expect(rows.map((row) => row.customerNumber)).toEqual([30, 15, 7]);
  });

  it("breaks a tie on the issue instant by customer number", async () => {
    customers.holders.push(
      household({ id: 1, customerNumber: 40, status: "BLOCKED" }),
      household({ id: 2, customerNumber: 9 }),
      household({ id: 3, customerNumber: 21 }),
    );

    const rows = await listCardsToPrint({ customers });

    expect(rows.map((row) => row.customerNumber)).toEqual([9, 21, 40]);
  });
});

describe("countCardsToPrint", () => {
  let customers: FakeCustomerRepository;

  beforeEach(() => {
    customers = new FakeCustomerRepository();
  });

  it("counts exactly the rows it lists", async () => {
    customers.holders.push(
      household({ id: 1, customerNumber: 12 }),
      household({ id: 2, customerNumber: 13, printedAt: ISSUED }),
      household({ id: 3, customerNumber: 14, status: "BLOCKED" }),
      household({ id: 4, customerNumber: 15, status: "ARCHIVED" }),
    );

    const rows = await listCardsToPrint({ customers });

    expect(await countCardsToPrint({ customers })).toBe(rows.length);
    expect(rows).toHaveLength(2);
  });
});

describe("justPrintedCard", () => {
  const PRINTED = new Date("2026-10-01T09:00:00.000Z");
  let customers: FakeCustomerRepository;

  beforeEach(() => {
    customers = new FakeCustomerRepository();
  });

  it("offers the undo for the card just ticked off", async () => {
    customers.holders.push(
      household({ id: 4, customerNumber: 12, cardIndex: 2, printedAt: PRINTED }),
    );
    const [holder] = customers.holders;

    expect(await justPrintedCard({ customers }, { customerId: 4, index: 2 })).toEqual({
      customerId: 4,
      index: 2,
      cardNumber: "12k2",
      firstName: holder.details.firstName,
      lastName: holder.details.lastName,
    });
  });

  it("offers the undo for a blocked household's card", async () => {
    customers.holders.push(
      household({ id: 4, customerNumber: 12, status: "BLOCKED", printedAt: PRINTED }),
    );

    expect(await justPrintedCard({ customers }, { customerId: 4, index: 1 })).not.toBeNull();
  });

  it("offers no undo for a card that is not printed", async () => {
    customers.holders.push(household({ id: 4, customerNumber: 12 }));

    expect(await justPrintedCard({ customers }, { customerId: 4, index: 1 })).toBeNull();
  });

  it("offers no undo for a card that has been replaced", async () => {
    customers.holders.push(
      household({ id: 4, customerNumber: 12, cardIndex: 3, printedAt: PRINTED }),
    );

    expect(await justPrintedCard({ customers }, { customerId: 4, index: 2 })).toBeNull();
  });

  it("offers no undo for an archived household's card", async () => {
    customers.holders.push(
      household({ id: 4, customerNumber: 12, status: "ARCHIVED", printedAt: PRINTED }),
    );

    expect(await justPrintedCard({ customers }, { customerId: 4, index: 1 })).toBeNull();
  });

  it("offers no undo for a household that does not exist", async () => {
    expect(await justPrintedCard({ customers }, { customerId: 99, index: 1 })).toBeNull();
  });
});
