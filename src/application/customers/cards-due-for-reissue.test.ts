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
import type { Clock, CustomerRepository } from "../ports";
import { listCardsDueForReissue } from "./cards-due-for-reissue";

/**
 * Hand-written fakes and synthetic data only, per the testing standard.
 *
 * The dates are the whole point of this suite, so they are fixed rather than faked: the child is
 * born on `2013-08-15`, which makes them twelve on {@link TODAY} and thirteen on {@link BIRTHDAY}.
 */

faker.seed(20260726);

const TODAY = "2026-07-22T09:00:00.000Z";
const BIRTHDAY = "2026-08-15T09:00:00.000Z";

const GROWN_UP_BIRTH_DATE = new Date("1985-03-11T00:00:00.000Z");
const CHILD_BIRTH_DATE = new Date("2013-08-15T00:00:00.000Z");

function fakeClock(now: string): Clock {
  return { now: () => new Date(now) };
}

function member(birthDate: Date): HouseholdMemberDetails {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate,
  };
}

/**
 * A register the query reads and nothing else. `writes` counts every mutating call, so a test can
 * prove a household reached the list without anybody having touched the record — which is the
 * substance of the story: the reclassification is a read-time derivation (US-13, §5).
 */
class FakeCustomerRepository implements CustomerRepository {
  readonly holders: RegisteredCustomer[] = [];
  writes = 0;

  constructor(...holders: RegisteredCustomer[]) {
    this.holders.push(...holders);
  }

  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>> {
    // Customer number ascending, like the adapter's `orderBy` — the query hands the order on
    // untouched, so a test that fixes the order here fixes what the screen shows.
    return Promise.resolve(
      this.holders
        .filter((customer) => customer.status === status)
        .sort((a, b) => a.customerNumber - b.customerNumber),
    );
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

  groupCounts(): Promise<GroupCounts> {
    return Promise.resolve({ red: 0, blue: 0 });
  }

  create(customer: NewCustomer): Promise<RegisteredCustomer> {
    this.writes += 1;
    const registered = {
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

  setStatus(): Promise<void> {
    this.writes += 1;
    return Promise.resolve();
  }

  archive(): Promise<void> {
    this.writes += 1;
    return Promise.resolve();
  }
}

interface HouseholdOptions {
  readonly id: number;
  readonly customerNumber: number;
  readonly status?: CustomerStatus;
  /** The household on file today. Defaults to one grown-up and one child born `2013-08-15`. */
  readonly members?: ReadonlyArray<HouseholdMemberDetails>;
  /** What the card in the customer's pocket has printed on it. Defaults to the household at issue. */
  readonly printed?: { grownUps: number; children: number };
  /** Which card of the run they hold — the card number is derived from it. Defaults to the first. */
  readonly cardIndex?: number;
}

/** A customer as the register already holds them, with a card that prints whatever a test needs. */
function household({
  id,
  customerNumber,
  status = "ACTIVE",
  members = [member(GROWN_UP_BIRTH_DATE), member(CHILD_BIRTH_DATE)],
  printed,
  cardIndex = 1,
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
      index: cardIndex,
      issuedAt: new Date(TODAY),
      reason: cardIndex === 1 ? "FIRST_ISSUE" : "LOST",
      countsAtIssue: printed ?? composition(details.householdMembers, new Date(TODAY)),
    },
    registeredOn: new Date(TODAY),
  };
}

describe("listCardsDueForReissue", () => {
  let customers: FakeCustomerRepository;

  function deps(today = TODAY) {
    return { customers, clock: fakeClock(today) };
  }

  beforeEach(() => {
    customers = new FakeCustomerRepository();
  });

  it("leaves out a household whose card still prints what they are", async () => {
    customers.holders.push(household({ id: 1, customerNumber: 50 }));

    expect(await listCardsDueForReissue(deps())).toEqual([]);
  });

  it("lists a household whose card a 13th birthday has overtaken", async () => {
    customers.holders.push(household({ id: 1, customerNumber: 50 }));

    expect(await listCardsDueForReissue(deps(BIRTHDAY))).toEqual([
      {
        customerId: 1,
        customerNumber: 50,
        firstName: customers.holders[0].details.firstName,
        lastName: customers.holders[0].details.lastName,
        cardNumber: "50k1",
        countsOnCard: { grownUps: 1, children: 1 },
        countsToday: { grownUps: 2, children: 0 },
        reason: "AGE_13",
      },
    ]);
  });

  it("puts a household on the list with no write in between the two readings", async () => {
    customers.holders.push(household({ id: 1, customerNumber: 50 }));

    const before = await listCardsDueForReissue(deps());
    const after = await listCardsDueForReissue(deps(BIRTHDAY));

    expect(before).toEqual([]);
    expect(after).toHaveLength(1);
    expect(customers.writes).toBe(0);
  });

  it("names a household change when somebody joined since the card was printed", async () => {
    customers.holders.push(
      household({ id: 1, customerNumber: 50, printed: { grownUps: 1, children: 0 } }),
    );

    const [due] = await listCardsDueForReissue(deps());

    expect(due.reason).toBe("HOUSEHOLD_CHANGE");
    expect(due.countsOnCard).toEqual({ grownUps: 1, children: 0 });
    expect(due.countsToday).toEqual({ grownUps: 1, children: 1 });
  });

  it("names the card the household actually holds, not the one it replaced", async () => {
    customers.holders.push(household({ id: 1, customerNumber: 50, cardIndex: 3 }));

    const [due] = await listCardsDueForReissue(deps(BIRTHDAY));

    expect(due.cardNumber).toBe("50k3");
  });

  it("leaves out a blocked household — they are not collecting", async () => {
    customers.holders.push(household({ id: 1, customerNumber: 50, status: "BLOCKED" }));

    expect(await listCardsDueForReissue(deps(BIRTHDAY))).toEqual([]);
  });

  it("leaves out an archived household — they hold no slot at all", async () => {
    customers.holders.push(household({ id: 1, customerNumber: 50, status: "ARCHIVED" }));

    expect(await listCardsDueForReissue(deps(BIRTHDAY))).toEqual([]);
  });

  it("keeps the register's order, lowest customer number first", async () => {
    customers.holders.push(
      household({ id: 1, customerNumber: 70 }),
      household({ id: 2, customerNumber: 12 }),
      household({ id: 3, customerNumber: 51 }),
    );

    const due = await listCardsDueForReissue(deps(BIRTHDAY));

    expect(due.map((entry) => entry.customerNumber)).toEqual([12, 51, 70]);
  });
});
