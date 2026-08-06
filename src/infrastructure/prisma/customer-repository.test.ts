/**
 * Integration tests for the SQLite customer adapter.
 *
 * Per the testing approach (CLAUDE.md) infrastructure is tested *after* the fact and thinly: these
 * specs prove the mapping and the constraints — above all the partial unique index, which is the
 * one rule the pure layers cannot enforce. The business rules themselves are covered by the tests
 * in src/domain and src/application. Each run migrates a throwaway database file which is deleted
 * afterwards, so nothing touches data/fd.db.
 *
 * Synthetic data only (Faker), seeded so a failing run is reproducible.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listCardsDueForReissue } from "@/application/customers/cards-due-for-reissue";
import type { CustomerListQuery } from "@/application/ports";
import { validUntilRangeFor } from "@/domain/customer/certificate";
import {
  createCustomerDetails,
  type CustomerStatus,
  type NewCustomer,
} from "@/domain/customer/customer";
import { foldName } from "@/domain/customer/nameSearch";
import type { Group } from "@/domain/customer/group";
import { CustomerNotFound, CustomerNumberTaken, InvalidCustomerRecord } from "@/domain/errors";
import { PrismaCustomerCounter, PrismaCustomerRepository } from "./customer-repository";
import { clearRegister } from "./test-support";

faker.seed(20260722);

const TODAY = new Date("2026-07-22T09:00:00.000Z");

let directory: string;
let url: string;
let prisma: PrismaClient;
let repository: PrismaCustomerRepository;
let counter: PrismaCustomerCounter;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-customers-"));
  url = `file:${join(directory, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaCustomerRepository(prisma);
  counter = new PrismaCustomerCounter(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await clearRegister(prisma);
});

/**
 * The same registration as {@link newCustomer}, on a slot a household has already been through: its
 * card continues the slot's run rather than starting at 1 again (US-25). Which index the use case
 * works out is src/application's business; what this file needs is a second registration on one
 * number that the `(customerNumber, index)` constraint will accept.
 */
function nextOnTheSlot(overrides: Partial<Omit<NewCustomer, "details">> = {}): NewCustomer {
  const customer = newCustomer(overrides);
  return { ...customer, card: { ...customer.card, index: customer.card.index + 1 } };
}

/** A registrable two-person household: one grown-up and one child, with fixed birthdates. */
function newCustomer(overrides: Partial<Omit<NewCustomer, "details">> = {}): NewCustomer {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  return {
    details: createCustomerDetails(
      {
        firstName,
        lastName,
        birthDate: new Date("1985-04-11T00:00:00.000Z"),
        address: {
          street: faker.location.street(),
          houseNumber: faker.location.buildingNumber(),
          zip: faker.location.zipCode("#####"),
          city: faker.location.city(),
        },
        certificate: {
          type: faker.lorem.word(),
          validUntil: new Date("2027-01-31T00:00:00.000Z"),
        },
        householdMembers: [
          { firstName, lastName, birthDate: new Date("1985-04-11T00:00:00.000Z") },
          {
            firstName: faker.person.firstName(),
            lastName,
            birthDate: new Date("2019-09-02T00:00:00.000Z"),
          },
        ],
        notes: "",
      },
      TODAY,
    ),
    customerNumber: 50,
    group: "RED",
    status: "ACTIVE",
    reminderCount: 0,
    card: {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: { grownUps: 1, children: 1 },
      groupAtIssue: "RED",
    },
    previousCustomerId: null,
    ...overrides,
  };
}

/** Write a row straight through Prisma, for the states no use case can reach yet. */
async function insertCustomer(
  customerNumber: number,
  status: string,
  group: Group = "RED",
): Promise<void> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  await prisma.customer.create({
    data: {
      customerNumber,
      firstName,
      lastName,
      // The folded search keys the adapter derives; a fixture that skipped them would be a row the
      // archive search could never find (US-11.1).
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: new Date("1990-01-01T00:00:00.000Z"),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group,
      status,
      reminderCount: 0,
      notes: "",
    },
  });
}

describe("PrismaCustomerRepository.create", () => {
  it("stores the customer, the household, the certificate and the first card together", async () => {
    const customer = newCustomer();

    const registered = await repository.create(customer);

    const row = await prisma.customer.findUniqueOrThrow({
      where: { id: registered.id },
      include: { householdMembers: true, certificates: true, cards: true },
    });
    expect(row.customerNumber).toBe(50);
    expect(row.firstName).toBe(customer.details.firstName);
    expect(row.city).toBe(customer.details.address.city);
    expect(row.group).toBe("RED");
    expect(row.status).toBe("ACTIVE");
    expect(row.reminderCount).toBe(0);
    expect(row.householdMembers).toHaveLength(2);
    expect(row.certificates).toHaveLength(1);
    expect(row.certificates[0].validUntil).toEqual(customer.details.certificate.validUntil);
    expect(row.certificates[0].recordedAt).toEqual(TODAY);
    expect(row.cards).toHaveLength(1);
    expect(row.cards[0].index).toBe(1);
    expect(row.cards[0].issuedAt).toEqual(TODAY);
    expect(row.cards[0].reason).toBe("FIRST_ISSUE");
  });

  it("returns the customer with the surrogate id the database assigned", async () => {
    const registered = await repository.create(newCustomer());

    expect(registered.id).toBeGreaterThan(0);
    expect(registered.customerNumber).toBe(50);
  });

  it("stores no grown-up or children count — the household is only birthdates", async () => {
    const registered = await repository.create(newCustomer());

    const [row] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "Customer" WHERE "id" = ${registered.id}`,
    );
    expect(Object.keys(row)).not.toContain("grownUps");
    expect(Object.keys(row)).not.toContain("children");
  });

  it("rejects a number another registration already holds, as CustomerNumberTaken", async () => {
    await repository.create(newCustomer());

    await expect(repository.create(newCustomer())).rejects.toBeInstanceOf(CustomerNumberTaken);
  });

  it("leaves no partial customer behind when the number was taken", async () => {
    await repository.create(newCustomer());

    await expect(repository.create(newCustomer())).rejects.toThrow();

    expect(await prisma.customer.count()).toBe(1);
    expect(await prisma.householdMember.count()).toBe(2);
    expect(await prisma.card.count()).toBe(1);
  });

  it("lets a new registration fill the number an archived household released", async () => {
    await insertCustomer(50, "ARCHIVED");

    const registered = await repository.create(newCustomer());

    expect(registered.customerNumber).toBe(50);
  });

  it("keeps a blocked household's number reserved — only archiving releases a slot", async () => {
    await insertCustomer(50, "BLOCKED");

    await expect(repository.create(newCustomer())).rejects.toBeInstanceOf(CustomerNumberTaken);
  });
});

/**
 * US-11.3 — a returning household is a *new* row that merely points at the old one. These specs are
 * about the column and its foreign key: that the link is stored and read back, that it is null for
 * everyone else, that the predecessor's row is not touched by the registration that names it, and
 * that the database refuses a link to nobody.
 */
describe("the link to an archived predecessor", () => {
  /** An archived household with a card and a certificate, as the register really holds one. */
  async function archivedPredecessor(customerNumber: number): Promise<number> {
    const registered = await repository.create(newCustomer({ customerNumber }));
    await repository.archive(registered.id, "weggezogen", new Date("2025-11-04T09:00:00.000Z"));
    return registered.id;
  }

  it("stores the archived record a registration was pre-filled from", async () => {
    const previousCustomerId = await archivedPredecessor(50);

    const registered = await repository.create(nextOnTheSlot({ previousCustomerId }));

    expect(registered.previousCustomerId).toBe(previousCustomerId);
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: registered.id } });
    expect(row.previousCustomerId).toBe(previousCustomerId);
  });

  it("reads the link back off the record", async () => {
    const previousCustomerId = await archivedPredecessor(50);
    const registered = await repository.create(nextOnTheSlot({ previousCustomerId }));

    const found = await repository.findById(registered.id);

    expect(found?.previousCustomerId).toBe(previousCustomerId);
  });

  it("leaves the link null for a household that walked in off the street", async () => {
    const registered = await repository.create(newCustomer());

    const found = await repository.findById(registered.id);

    expect(found?.previousCustomerId).toBeNull();
  });

  it("copies nothing across the link — the predecessor keeps its number, status and cards", async () => {
    const previousCustomerId = await archivedPredecessor(50);
    const before = await prisma.customer.findUniqueOrThrow({
      where: { id: previousCustomerId },
      include: { householdMembers: true, certificates: true, cards: true },
    });

    await repository.create(newCustomer({ previousCustomerId, customerNumber: 51 }));

    const after = await prisma.customer.findUniqueOrThrow({
      where: { id: previousCustomerId },
      include: { householdMembers: true, certificates: true, cards: true },
    });
    expect(after).toEqual(before);
  });

  it("lets the returning household take a number while the predecessor keeps showing its own", async () => {
    const previousCustomerId = await archivedPredecessor(50);

    const registered = await repository.create(nextOnTheSlot({ previousCustomerId }));

    expect(registered.customerNumber).toBe(50);
    const rows = await prisma.customer.findMany({
      where: { customerNumber: 50 },
      orderBy: { id: "asc" },
    });
    expect(rows.map((row) => row.status)).toEqual(["ARCHIVED", "ACTIVE"]);
  });

  it("refuses a link to a customer who does not exist, as CustomerNotFound", async () => {
    await expect(
      repository.create(newCustomer({ previousCustomerId: 404 })),
    ).rejects.toBeInstanceOf(CustomerNotFound);
    expect(await prisma.customer.count()).toBe(0);
  });

  it("refuses to delete a household another record was registered from", async () => {
    const previousCustomerId = await archivedPredecessor(50);
    await repository.create(newCustomer({ previousCustomerId, customerNumber: 51 }));
    await prisma.card.deleteMany({ where: { customerId: previousCustomerId } });
    await prisma.certificate.deleteMany({ where: { customerId: previousCustomerId } });
    await prisma.householdMember.deleteMany({ where: { customerId: previousCustomerId } });

    await expect(prisma.customer.delete({ where: { id: previousCustomerId } })).rejects.toThrow();
  });
});

describe("the customer number slot constraint", () => {
  it("lets two archived customers both hold customer number 50", async () => {
    await insertCustomer(50, "ARCHIVED");
    await insertCustomer(50, "ARCHIVED");

    const archived = await prisma.customer.findMany({ where: { customerNumber: 50 } });
    expect(archived).toHaveLength(2);
  });

  it("refuses a second customer on the register with the same number", async () => {
    await insertCustomer(50, "ACTIVE");

    await expect(insertCustomer(50, "ACTIVE")).rejects.toThrow();
  });

  it("refuses a blocked customer sharing an active customer's number — a block occupies the slot", async () => {
    await insertCustomer(50, "ACTIVE");

    await expect(insertCustomer(50, "BLOCKED")).rejects.toThrow();
  });

  it("refuses two blocked customers on the same number — only archiving is exempt", async () => {
    await insertCustomer(50, "BLOCKED");

    await expect(insertCustomer(50, "BLOCKED")).rejects.toThrow();
  });

  it("lets a blocked customer hold the number an archived household released", async () => {
    await insertCustomer(50, "ARCHIVED");

    await insertCustomer(50, "BLOCKED");

    const rows = await prisma.customer.findMany({ where: { customerNumber: 50 } });
    expect(rows.map((row) => row.status).sort()).toEqual(["ARCHIVED", "BLOCKED"]);
  });
});

describe("PrismaCustomerRepository.updateHousehold", () => {
  /** A member as staff would type them onto the record, with a birthdate a test can count on. */
  function newMember(birthDate: string) {
    return {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      birthDate: new Date(birthDate),
    };
  }

  it("replaces the household, leaving no row of the old composition behind", async () => {
    const { id } = await repository.create(newCustomer());
    const members = [newMember("1985-04-11"), newMember("2022-02-14"), newMember("2019-09-02")];

    await repository.updateHousehold(id, members);

    const stored = await repository.findById(id);
    expect(stored?.details.householdMembers).toEqual(members);
    expect(await prisma.householdMember.count({ where: { customerId: id } })).toBe(3);
  });

  it("touches nothing else on the record — number, status, card and certificate stay", async () => {
    const { id } = await repository.create(newCustomer());
    const before = await repository.findById(id);

    await repository.updateHousehold(id, [newMember("1985-04-11")]);

    const after = await repository.findById(id);
    expect(after?.customerNumber).toBe(before?.customerNumber);
    expect(after?.status).toBe(before?.status);
    expect(after?.card).toEqual(before?.card);
    expect(after?.details.certificate).toEqual(before?.details.certificate);
  });

  it("leaves another household's members alone", async () => {
    const { id } = await repository.create(newCustomer());
    const other = await repository.create(newCustomer({ customerNumber: 51 }));

    await repository.updateHousehold(id, [newMember("1985-04-11")]);

    expect(await prisma.householdMember.count({ where: { customerId: other.id } })).toBe(2);
  });
});

describe("PrismaCustomerRepository.updateDetails", () => {
  const ADDRESS = { street: "Lange Straße", houseNumber: "7a", zip: "33129", city: "Delbrück" };

  /** The corrected personal data every test below writes; the surname carries an umlaut on purpose. */
  const CORRECTED = {
    firstName: "Anna",
    lastName: "Grünberg",
    birthDate: new Date("1986-05-02T00:00:00.000Z"),
    address: ADDRESS,
  };

  it("stores the corrected name, birthdate and address", async () => {
    const customer = await repository.create(newCustomer());

    await repository.updateDetails(customer.id, CORRECTED, customer.details.householdMembers);

    const stored = await repository.findById(customer.id);
    expect(stored?.details.firstName).toBe("Anna");
    expect(stored?.details.lastName).toBe("Grünberg");
    expect(stored?.details.birthDate).toEqual(new Date("1986-05-02T00:00:00.000Z"));
    expect(stored?.details.address).toEqual(ADDRESS);
  });

  it("rewrites the folded search keys with the names, so the archive search still finds them", async () => {
    const customer = await repository.create(newCustomer());

    await repository.updateDetails(customer.id, CORRECTED, customer.details.householdMembers);

    const row = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(row.firstNameFolded).toBe(foldName("Anna"));
    expect(row.lastNameFolded).toBe(foldName("Grünberg"));
    expect(row.lastNameFolded).toBe("gruenberg");
  });

  it("writes the household it was handed in the same transaction as the personal data", async () => {
    const customer = await repository.create(newCustomer());
    const household = [
      {
        firstName: CORRECTED.firstName,
        lastName: CORRECTED.lastName,
        birthDate: CORRECTED.birthDate,
      },
      customer.details.householdMembers[1],
    ];

    await repository.updateDetails(customer.id, CORRECTED, household);

    const stored = await repository.findById(customer.id);
    expect(stored?.details.householdMembers).toEqual(household);
  });

  it("leaves the customer number, status, card and certificate exactly as they were", async () => {
    const customer = await repository.create(newCustomer());
    const before = await repository.findById(customer.id);

    await repository.updateDetails(customer.id, CORRECTED, customer.details.householdMembers);

    const after = await repository.findById(customer.id);
    expect(after?.customerNumber).toBe(before?.customerNumber);
    expect(after?.status).toBe(before?.status);
    expect(after?.card).toEqual(before?.card);
    expect(after?.details.certificate).toEqual(before?.details.certificate);
    expect(after?.registeredOn).toEqual(before?.registeredOn);
  });

  it("leaves another household's members alone", async () => {
    const customer = await repository.create(newCustomer());
    const other = await repository.create(newCustomer({ customerNumber: 51 }));

    await repository.updateDetails(customer.id, CORRECTED, [
      { firstName: "Anna", lastName: "Grünberg", birthDate: CORRECTED.birthDate },
    ]);

    expect(await prisma.householdMember.count({ where: { customerId: other.id } })).toBe(2);
  });
});

describe("PrismaCustomerRepository.setGroup", () => {
  it("moves the customer to the other balancing group", async () => {
    const { id } = await repository.create(newCustomer({ group: "RED" }));

    await repository.setGroup(id, "BLUE");

    expect((await repository.findById(id))?.group).toBe("BLUE");
  });

  it("leaves the card printing the group it was issued with", async () => {
    const { id } = await repository.create(newCustomer({ group: "RED" }));

    await repository.setGroup(id, "BLUE");

    // The snapshot is what makes the move visible as a stale card (US-16.4); updating it here would
    // hide the very difference the cards-due list is derived from.
    expect((await repository.findById(id))?.card.groupAtIssue).toBe("RED");
  });

  it("touches nothing else on the record", async () => {
    const { id } = await repository.create(newCustomer());
    const before = await repository.findById(id);

    await repository.setGroup(id, "BLUE");

    const after = await repository.findById(id);
    expect(after?.customerNumber).toBe(before?.customerNumber);
    expect(after?.status).toBe(before?.status);
    expect(after?.details).toEqual(before?.details);
    expect(after?.card).toEqual(before?.card);
  });
});

describe("PrismaCustomerRepository.updateNotes", () => {
  it("stores the note, line breaks and all", async () => {
    const { id } = await repository.create(newCustomer());

    await repository.updateNotes(id, "Klingel defekt\nBitte anrufen");

    expect((await repository.findById(id))?.details.notes).toBe("Klingel defekt\nBitte anrufen");
  });

  it("clears the note when it is saved empty", async () => {
    const { id } = await repository.create(newCustomer());
    await repository.updateNotes(id, "Klingel defekt");

    await repository.updateNotes(id, "");

    expect((await repository.findById(id))?.details.notes).toBe("");
  });

  it("touches nothing else on the record", async () => {
    const { id } = await repository.create(newCustomer());
    const before = await repository.findById(id);

    await repository.updateNotes(id, "Neue Notiz");

    const after = await repository.findById(id);
    expect(after?.details.firstName).toBe(before?.details.firstName);
    expect(after?.details.householdMembers).toEqual(before?.details.householdMembers);
    expect(after?.card).toEqual(before?.card);
  });
});

describe("PrismaCustomerRepository.setStatus", () => {
  /**
   * The invariant US-08 rests on: a customer carries a block reason exactly while they are blocked.
   * `setStatus` writes the status and the reason in one statement, so blocking stores the reason and
   * unblocking (or archiving) clears it — a row can never be left BLOCKED without a why, nor
   * ACTIVE/ARCHIVED with a stale one. `(blockReason !== null) === (status === "BLOCKED")` is the
   * invariant said literally.
   */
  const holdsInvariant = (row: { status: string; blockReason: string | null }): boolean =>
    (row.blockReason !== null) === (row.status === "BLOCKED");

  it("holds blockReason non-null exactly while BLOCKED — set on block, cleared on unblock", async () => {
    const { id } = await repository.create(newCustomer());

    await repository.setStatus(id, "BLOCKED", "Ausweis wiederholt vergessen");
    const blocked = await prisma.customer.findUniqueOrThrow({ where: { id } });
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.blockReason).toBe("Ausweis wiederholt vergessen");
    expect(holdsInvariant(blocked)).toBe(true);

    await repository.setStatus(id, "ACTIVE", null);
    const unblocked = await prisma.customer.findUniqueOrThrow({ where: { id } });
    expect(unblocked.status).toBe("ACTIVE");
    expect(unblocked.blockReason).toBeNull();
    expect(holdsInvariant(unblocked)).toBe(true);
  });

  it("leaves no block reason behind when a blocked customer is archived", async () => {
    const { id } = await repository.create(newCustomer());
    await repository.setStatus(id, "BLOCKED", "vorübergehend gesperrt");

    await repository.setStatus(id, "ARCHIVED", null);

    const archived = await prisma.customer.findUniqueOrThrow({ where: { id } });
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.blockReason).toBeNull();
    expect(holdsInvariant(archived)).toBe(true);
  });
});

describe("PrismaCustomerRepository.archive", () => {
  const ARCHIVED_AT = new Date("2026-07-22T11:30:00.000Z");

  it("writes the status, the reason and the instant, and clears any block reason", async () => {
    const { id } = await repository.create(newCustomer());
    await repository.setStatus(id, "BLOCKED", "vorübergehend gesperrt");

    await repository.archive(id, "nach Hamburg verzogen", ARCHIVED_AT);

    const row = await prisma.customer.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("ARCHIVED");
    expect(row.archiveReason).toBe("nach Hamburg verzogen");
    expect(row.archivedAt).toEqual(ARCHIVED_AT);
    expect(row.blockReason).toBeNull();
  });

  it("keeps the number and every related row — archiving is a status change, not a delete", async () => {
    const { id } = await repository.create(newCustomer());

    await repository.archive(id, "verzogen", ARCHIVED_AT);

    const row = await prisma.customer.findUniqueOrThrow({
      where: { id },
      include: { householdMembers: true, certificates: true, cards: true },
    });
    expect(row.customerNumber).toBe(50);
    expect(row.householdMembers).toHaveLength(2);
    expect(row.certificates).toHaveLength(1);
    expect(row.cards).toHaveLength(1);
  });

  it("frees the slot at once — the next registration may take the number", async () => {
    const { id } = await repository.create(newCustomer());

    await repository.archive(id, "verzogen", ARCHIVED_AT);

    const successor = await repository.create(nextOnTheSlot());
    expect(successor.customerNumber).toBe(50);
    expect(await repository.takenActiveNumbers()).toEqual([50]);
  });

  it("reads the archive reason and date back on the record", async () => {
    const { id } = await repository.create(newCustomer());

    await repository.archive(id, "verzogen", ARCHIVED_AT);

    const found = await repository.findById(id);
    expect(found?.archiveReason).toBe("verzogen");
    expect(found?.archivedAt).toEqual(ARCHIVED_AT);
  });
});

/**
 * Archiving is the only way out of the register, so no relation in schema.prisma cascades on delete
 * (US-10.3). These specs prove the database itself refuses the hard delete rather than trusting that
 * no code will ever ask for one — a cascade left in place would take the household's members,
 * certificates and cards with it silently the first time something did.
 */
describe("a household that cannot be hard-deleted", () => {
  it("refuses to delete a customer who owns members, certificates and cards", async () => {
    const { id } = await repository.create(newCustomer());

    await expect(prisma.customer.delete({ where: { id } })).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it("leaves the refused household's rows untouched — the delete takes nothing with it", async () => {
    const { id } = await repository.create(newCustomer());

    await expect(prisma.customer.delete({ where: { id } })).rejects.toThrow();

    const row = await prisma.customer.findUniqueOrThrow({
      where: { id },
      include: { householdMembers: true, certificates: true, cards: true },
    });
    expect(row.householdMembers).toHaveLength(2);
    expect(row.certificates).toHaveLength(1);
    expect(row.cards).toHaveLength(1);
  });

  it("refuses it just the same once the household is archived", async () => {
    const { id } = await repository.create(newCustomer());
    await repository.archive(id, "verzogen", new Date("2026-07-22T11:30:00.000Z"));

    await expect(prisma.customer.delete({ where: { id } })).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    expect(await prisma.customer.count({ where: { id } })).toBe(1);
  });
});

describe("PrismaCustomerRepository.takenActiveNumbers", () => {
  it("is empty for an empty register", async () => {
    expect(await repository.takenActiveNumbers()).toEqual([]);
  });

  it("reports the numbers held by active and blocked customers, but not archived ones", async () => {
    await insertCustomer(1, "ACTIVE");
    await insertCustomer(2, "BLOCKED");
    await insertCustomer(3, "ARCHIVED");

    expect(await repository.takenActiveNumbers()).toEqual([1, 2]);
  });
});

describe("PrismaCustomerRepository.groupCounts", () => {
  it("counts the two groups separately", async () => {
    await insertCustomer(1, "ACTIVE", "RED");
    await insertCustomer(2, "ACTIVE", "BLUE");
    await insertCustomer(3, "BLOCKED", "BLUE");

    expect(await repository.groupCounts()).toEqual({ red: 1, blue: 2 });
  });

  it("does not count archived customers — they turn up to no distribution", async () => {
    await insertCustomer(1, "ARCHIVED", "RED");

    expect(await repository.groupCounts()).toEqual({ red: 0, blue: 0 });
  });
});

describe("PrismaCustomerCounter", () => {
  it("counts everyone who holds a slot, archived customers excluded", async () => {
    await insertCustomer(1, "ACTIVE");
    await insertCustomer(2, "BLOCKED");
    await insertCustomer(3, "ARCHIVED");

    expect(await counter.countActive()).toBe(2);
  });
});

describe("PrismaCustomerRepository.listWithStatus", () => {
  it("returns only the customers in the status asked for", async () => {
    await repository.create(newCustomer({ customerNumber: 1 }));
    await repository.create(newCustomer({ customerNumber: 2, status: "BLOCKED" }));
    await repository.create(newCustomer({ customerNumber: 3, status: "ARCHIVED" }));

    const active = await repository.listWithStatus("ACTIVE");

    expect(active.map((customer) => customer.customerNumber)).toEqual([1]);
  });

  it("orders by customer number, so the screen does not have to sort", async () => {
    await repository.create(newCustomer({ customerNumber: 70 }));
    await repository.create(newCustomer({ customerNumber: 12 }));
    await repository.create(newCustomer({ customerNumber: 51 }));

    const active = await repository.listWithStatus("ACTIVE");

    expect(active.map((customer) => customer.customerNumber)).toEqual([12, 51, 70]);
  });

  it("attaches the household and the card each customer holds", async () => {
    await repository.create(newCustomer());
    await prisma.card.create({
      data: {
        customerId: (await repository.findByCustomerNumber(50))?.id ?? 0,
        // The slot the card is printed under, the same one the customer holds (US-25).
        customerNumber: 50,
        index: 2,
        issuedAt: TODAY,
        reason: "LOST",
        grownUpsAtIssue: 2,
        childrenAtIssue: 0,
        groupAtIssue: "RED",
      },
    });

    const [customer] = await repository.listWithStatus("ACTIVE");

    expect(customer.details.householdMembers).toHaveLength(2);
    expect(customer.card.index).toBe(2);
    expect(customer.card.countsAtIssue).toEqual({ grownUps: 2, children: 0 });
  });

  it("is empty for an empty register", async () => {
    expect(await repository.listWithStatus("ACTIVE")).toEqual([]);
  });
});

describe("the cards-due-for-reissue list over the real register", () => {
  it("puts a household on the list once their card's printed counts fall behind a birthday", async () => {
    // Registered with one grown-up and a child born 2019-09-02, so the card printed 1/1 (US-13.3).
    await repository.create(newCustomer());
    const deps = { customers: repository, clock: { now: () => TODAY } };

    const beforeTheBirthday = await listCardsDueForReissue(deps);
    // The child's 13th birthday, with nothing written to the database in between.
    const afterTheBirthday = await listCardsDueForReissue({
      ...deps,
      clock: { now: () => new Date("2032-09-02T09:00:00.000Z") },
    });

    expect(beforeTheBirthday).toEqual([]);
    expect(afterTheBirthday).toMatchObject([
      {
        customerNumber: 50,
        cardNumber: "50k1",
        countsOnCard: { grownUps: 1, children: 1 },
        countsToday: { grownUps: 2, children: 0 },
        reason: "AGE_13",
      },
    ]);
  });
});

describe("PrismaCustomerRepository.findById", () => {
  it("reads a customer back whole, household, certificate and card included", async () => {
    const written = newCustomer();
    const created = await repository.create(written);

    const found = await repository.findById(created.id);

    expect(found?.customerNumber).toBe(written.customerNumber);
    expect(found?.details.lastName).toBe(written.details.lastName);
    expect(found?.details.householdMembers).toHaveLength(2);
    expect(found?.details.certificate.type).toBe(written.details.certificate.type);
    expect(found?.card.index).toBe(1);
    expect(found?.card.reason).toBe("FIRST_ISSUE");
  });

  it("narrows the stored group and status strings back into the domain's types", async () => {
    const created = await repository.create(newCustomer({ group: "BLUE", status: "BLOCKED" }));

    const found = await repository.findById(created.id);

    expect(found?.group).toBe("BLUE");
    expect(found?.status).toBe("BLOCKED");
  });

  it("gives null for an id that belongs to nobody", async () => {
    expect(await repository.findById(9_999)).toBeNull();
  });

  it("returns an archived customer — their data stays queryable", async () => {
    const created = await repository.create(newCustomer({ status: "ARCHIVED" }));

    expect((await repository.findById(created.id))?.status).toBe("ARCHIVED");
  });

  it("reports the highest card index, so a reissued card supersedes the first", async () => {
    const created = await repository.create(newCustomer());
    await prisma.card.create({
      data: {
        customerId: created.id,
        // The slot the card is printed under, the same one the customer holds (US-25).
        customerNumber: 50,
        index: 2,
        issuedAt: TODAY,
        reason: "LOST",
        grownUpsAtIssue: 1,
        childrenAtIssue: 1,
        groupAtIssue: "RED",
      },
    });

    expect((await repository.findById(created.id))?.card.index).toBe(2);
  });

  it("dates the household's start from their first card, not from the one a reissue gave them", async () => {
    const created = await repository.create(newCustomer());
    await prisma.card.create({
      data: {
        customerId: created.id,
        // The slot the card is printed under, the same one the customer holds (US-25).
        customerNumber: 50,
        index: 2,
        issuedAt: new Date("2026-08-06T09:00:00.000Z"),
        reason: "LOST",
        grownUpsAtIssue: 1,
        childrenAtIssue: 1,
        groupAtIssue: "RED",
      },
    });

    // The registration wrote card 1 on `TODAY`; the replacement two weeks later must not move the
    // household's start, which is what the no-show count counts back to (US-10.1).
    expect((await repository.findById(created.id))?.registeredOn).toEqual(TODAY);
  });
});

describe("PrismaCustomerRepository.findByCustomerNumber", () => {
  it("resolves a reassigned number to its active holder, not the household it was taken from", async () => {
    const archived = await repository.create(newCustomer({ status: "ARCHIVED" }));
    const active = await repository.create(nextOnTheSlot());

    const found = await repository.findByCustomerNumber(50);

    expect(found?.id).toBe(active.id);
    expect(found?.id).not.toBe(archived.id);
    expect(found?.status).toBe("ACTIVE");
  });

  it("resolves to a blocked holder, who is turned away but still holds the slot", async () => {
    const blocked = await repository.create(newCustomer({ status: "BLOCKED" }));

    expect((await repository.findByCustomerNumber(50))?.id).toBe(blocked.id);
  });

  it("names the most recently archived holder when the number stands empty", async () => {
    await repository.create(newCustomer({ status: "ARCHIVED" }));
    const later = await repository.create(nextOnTheSlot({ status: "ARCHIVED" }));

    const found = await repository.findByCustomerNumber(50);

    expect(found?.id).toBe(later.id);
    expect(found?.status).toBe("ARCHIVED");
  });

  it("gives null for a number nobody has ever held", async () => {
    expect(await repository.findByCustomerNumber(51)).toBeNull();
  });

  it("reads the household, the certificate and the current card back with the customer", async () => {
    const written = newCustomer();
    const created = await repository.create(written);
    await prisma.card.create({
      data: {
        customerId: created.id,
        // The slot the card is printed under, the same one the customer holds (US-25).
        customerNumber: 50,
        index: 2,
        issuedAt: TODAY,
        reason: "LOST",
        grownUpsAtIssue: 1,
        childrenAtIssue: 1,
        groupAtIssue: "RED",
      },
    });

    const found = await repository.findByCustomerNumber(50);

    expect(found?.details.householdMembers).toHaveLength(2);
    expect(found?.details.certificate.type).toBe(written.details.certificate.type);
    expect(found?.card.index).toBe(2);
  });

  it("costs the same number of queries however large the household — the counter never fans out", async () => {
    const queriesForHousehold = async (memberCount: number): Promise<number> => {
      await clearRegister(prisma);
      const created = await repository.create(newCustomer());
      await prisma.householdMember.createMany({
        data: Array.from({ length: memberCount - 2 }, () => ({
          customerId: created.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          birthDate: new Date("2001-06-15T00:00:00.000Z"),
        })),
      });

      // A throwaway client per measurement, because a query listener cannot be detached again.
      const logged = new PrismaClient({
        datasourceUrl: url,
        log: [{ emit: "event", level: "query" }],
      });
      let queries = 0;
      logged.$on("query", () => {
        queries += 1;
      });
      const found = await new PrismaCustomerRepository(logged).findByCustomerNumber(50);
      await logged.$disconnect();

      expect(found?.details.householdMembers).toHaveLength(memberCount);
      return queries;
    };

    expect(await queriesForHousehold(7)).toBe(await queriesForHousehold(2));
  });
});

describe("the counter lookup indexes", () => {
  it("indexes customerNumber and status, so the counter query stays instant", async () => {
    const indexes = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA index_list("Customer")`,
    );

    const names = indexes.map((index) => index.name);
    expect(names).toContain("Customer_customerNumber_idx");
    expect(names).toContain("Customer_status_idx");
  });
});

describe("PrismaCustomerRepository.searchArchived", () => {
  /**
   * A household that went through the register and left it: created like any other, then archived by
   * the same call the use case makes — so the row the search reads is the one archiving leaves,
   * folded search keys and all.
   */
  async function archivedHousehold(seed: {
    firstName: string;
    lastName: string;
    birthDate?: string;
    customerNumber?: number;
    archivedAt: string;
    reason?: string;
  }): Promise<number> {
    const base = newCustomer({ customerNumber: seed.customerNumber ?? 50 });
    const created = await repository.create({
      ...base,
      details: createCustomerDetails(
        {
          ...base.details,
          firstName: seed.firstName,
          lastName: seed.lastName,
          birthDate: new Date(seed.birthDate ?? "1985-04-11T00:00:00.000Z"),
        },
        TODAY,
      ),
    });
    await repository.archive(created.id, seed.reason ?? "verzogen", new Date(seed.archivedAt));
    return created.id;
  }

  /** A household still on the register, under a name the archive search will be given. */
  async function activeHousehold(lastName: string, customerNumber: number): Promise<void> {
    const base = newCustomer({ customerNumber });
    await repository.create({
      ...base,
      details: createCustomerDetails({ ...base.details, lastName }, TODAY),
    });
  }

  it("finds two archived namesakes and leaves the household still on the register out", async () => {
    await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      archivedAt: "2024-03-04T10:00:00.000Z",
    });
    await archivedHousehold({
      firstName: "Bernd",
      lastName: "Schneider",
      customerNumber: 51,
      archivedAt: "2026-01-09T10:00:00.000Z",
    });
    await activeHousehold("Schneider", 52);

    const found = await repository.searchArchived({ lastName: "Schneider" }, 21);

    expect(found.map((customer) => customer.details.firstName)).toEqual(["Bernd", "Anke"]);
    expect(found.every((customer) => customer.status === "ARCHIVED")).toBe(true);
  });

  it("matches Müller when Mueller is typed — the stored key is folded, not the query", async () => {
    await archivedHousehold({
      firstName: "Anke",
      lastName: "Müller",
      archivedAt: "2026-01-09T10:00:00.000Z",
    });

    const found = await repository.searchArchived({ lastName: "mueller" }, 21);

    expect(found).toHaveLength(1);
    expect(found[0].details.lastName).toBe("Müller");
  });

  it("matches on the first letters of the name, before it is typed out", async () => {
    await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      archivedAt: "2026-01-09T10:00:00.000Z",
    });

    expect(await repository.searchArchived({ lastName: "Schn" }, 21)).toHaveLength(1);
  });

  it("tells two namesakes apart by the date of birth", async () => {
    await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      birthDate: "1985-04-11T00:00:00.000Z",
      archivedAt: "2026-01-09T10:00:00.000Z",
    });
    await archivedHousehold({
      firstName: "Bernd",
      lastName: "Schneider",
      customerNumber: 51,
      birthDate: "1972-11-30T00:00:00.000Z",
      archivedAt: "2026-02-09T10:00:00.000Z",
    });

    const found = await repository.searchArchived(
      { lastName: "Schneider", birthDate: new Date("1972-11-30T00:00:00.000Z") },
      21,
    );

    expect(found.map((customer) => customer.details.firstName)).toEqual(["Bernd"]);
  });

  it("returns no more rows than the limit it was given", async () => {
    for (let index = 0; index < 3; index += 1) {
      await archivedHousehold({
        firstName: "Anke",
        lastName: "Schneider",
        customerNumber: index + 1,
        archivedAt: `2026-0${index + 1}-09T10:00:00.000Z`,
      });
    }

    expect(await repository.searchArchived({ lastName: "Schneider" }, 2)).toHaveLength(2);
  });

  it("carries the number the household held, the archive instant and the reason", async () => {
    await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      customerNumber: 37,
      archivedAt: "2026-01-09T10:00:00.000Z",
      reason: "zwei Jahre nicht erschienen",
    });

    const [found] = await repository.searchArchived({ lastName: "Schneider" }, 21);

    expect(found.customerNumber).toBe(37);
    expect(found.archivedAt).toEqual(new Date("2026-01-09T10:00:00.000Z"));
    expect(found.archiveReason).toBe("zwei Jahre nicht erschienen");
    expect(found.details.householdMembers).toHaveLength(2);
  });

  it("refuses an archived row whose reason is missing rather than showing none", async () => {
    const customerId = await archivedHousehold({
      firstName: "Anke",
      lastName: "Schneider",
      archivedAt: "2026-01-09T10:00:00.000Z",
    });
    // Only a hand-edited database can be in this state: `archive` writes the status, the reason and
    // the instant in one statement.
    await prisma.customer.update({ where: { id: customerId }, data: { archiveReason: null } });

    await expect(repository.searchArchived({ lastName: "Schneider" }, 21)).rejects.toBeInstanceOf(
      InvalidCustomerRecord,
    );
  });

  it("indexes the folded last name with the birthdate, the pair the search filters on", async () => {
    const indexes = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA index_list("Customer")`,
    );

    expect(indexes.map((index) => index.name)).toContain("Customer_lastNameFolded_birthDate_idx");
  });
});

describe("PrismaCustomerRepository.list over a register of fifty households", () => {
  /**
   * The register the customer list is asked about: fifty synthetic households across both groups,
   * all three statuses and the three certificate states (US-15.2).
   *
   * It is a *table*, not a loop with conditions in it, because every expectation below is read off
   * it — numbers 1–30 are Red and 31–50 Blue, 41–45 are blocked and 46–50 archived. Two households
   * carry names chosen to exercise the fold from either side, and three carry certificates that put
   * them in a state the rest are not in. Everything else is Faker's.
   */
  const RED_UNTIL = 30;
  const BLOCKED_FROM = 41;
  const ARCHIVED_FROM = 46;
  const REGISTER_SIZE = 50;

  /**
   * The households whose name the search assertions name explicitly.
   *
   * Both are spelled so that no Faker surname can fold onto them: Faker's list contains `Mueller`,
   * and a fixture whose expected result set depends on the other forty-nine draws missing it is a
   * flake waiting for a reseed. The searches below therefore ask for a prefix long enough to reach
   * the invented part of the name.
   */
  const NAMED = new Map<number, { firstName: string; lastName: string }>([
    [12, { firstName: "Anke", lastName: "Müllerhoff" }],
    [33, { firstName: "Ännelie", lastName: "Behrens" }],
  ]);
  /** The certificate a household's row carries, where it is not the far-future default. */
  const CERTIFICATES = new Map<number, string>([
    // Lapsed three weeks before today.
    [5, "2026-06-30T00:00:00.000Z"],
    // Lapsed too — but renewed below, which is the household the EXPIRED filter must *not* find.
    [6, "2026-05-31T00:00:00.000Z"],
    // Inside the thirty-day window that ends 2026-08-21.
    [7, "2026-08-10T00:00:00.000Z"],
  ]);
  const DEFAULT_VALID_UNTIL = "2027-01-31T00:00:00.000Z";

  function groupOf(customerNumber: number): Group {
    return customerNumber <= RED_UNTIL ? "RED" : "BLUE";
  }

  function statusOf(customerNumber: number): CustomerStatus {
    if (customerNumber >= ARCHIVED_FROM) {
      return "ARCHIVED";
    }
    return customerNumber >= BLOCKED_FROM ? "BLOCKED" : "ACTIVE";
  }

  /** The customer numbers in `from..to`, which is how every expected result set is written. */
  function numbers(from: number, to: number): number[] {
    return Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
  }

  /** What the query answered, as customer numbers — the only column the expectations compare. */
  async function found(query: CustomerListQuery): Promise<number[]> {
    const rows = await repository.list(query);
    return rows.map((customer) => customer.customerNumber);
  }

  /** The statuses the screen asks for by default: everyone still on the register. */
  const ON_THE_REGISTER: ReadonlyArray<CustomerStatus> = ["ACTIVE", "BLOCKED"];

  beforeEach(async () => {
    for (const customerNumber of numbers(1, REGISTER_SIZE)) {
      const named = NAMED.get(customerNumber);
      const base = newCustomer({
        customerNumber,
        group: groupOf(customerNumber),
        status: statusOf(customerNumber),
      });
      await repository.create({
        ...base,
        details: createCustomerDetails(
          {
            ...base.details,
            ...named,
            certificate: {
              type: "Jobcenter-Bescheid",
              validUntil: new Date(CERTIFICATES.get(customerNumber) ?? DEFAULT_VALID_UNTIL),
            },
          },
          TODAY,
        ),
      });
    }
    // Household 6 brought a new notice after the old one lapsed. The renewal stacks on top rather
    // than replacing the row (US-06.3), so the register holds a household whose certificate history
    // contains an expired one and whose *current* certificate is valid — the case a `some` filter
    // gets wrong.
    const renewed = await repository.findByCustomerNumber(6);
    await prisma.certificate.create({
      data: {
        customerId: renewed?.id ?? 0,
        type: "Jobcenter-Bescheid",
        validUntil: new Date("2027-06-30T00:00:00.000Z"),
        // After the row `create` wrote, or it would not be the certificate on file.
        recordedAt: new Date("2026-07-22T10:00:00.000Z"),
      },
    });
  }, 30_000);

  it("shows everyone still on the register, lowest customer number first", async () => {
    expect(await found({ statuses: ON_THE_REGISTER })).toEqual(numbers(1, 45));
  });

  it("shows only the households in the statuses asked for", async () => {
    expect(await found({ statuses: ["BLOCKED"] })).toEqual(numbers(41, 45));
    expect(await found({ statuses: ["ARCHIVED"] })).toEqual(numbers(46, 50));
  });

  it("narrows to one balancing group without touching the status filter", async () => {
    expect(await found({ statuses: ON_THE_REGISTER, group: "BLUE" })).toEqual(numbers(31, 45));
    expect(await found({ statuses: ON_THE_REGISTER, group: "RED" })).toEqual(numbers(1, 30));
  });

  it("matches a customer number exactly, so 1 does not drag in 10 to 19", async () => {
    expect(
      await found({
        statuses: ON_THE_REGISTER,
        search: { kind: "CUSTOMER_NUMBER", customerNumber: 1 },
      }),
    ).toEqual([1]);
  });

  it("finds Müllerhoff when muellerh is typed, on the folded key the archive search uses", async () => {
    expect(
      await found({ statuses: ON_THE_REGISTER, search: { kind: "NAME", name: "muellerh" } }),
    ).toEqual([12]);
  });

  it("matches a first name too — staff type whichever of the two they were given", async () => {
    expect(
      await found({ statuses: ON_THE_REGISTER, search: { kind: "NAME", name: "Aennel" } }),
    ).toEqual([33]);
  });

  it("finds nobody rather than everybody for a name no household answers to", async () => {
    expect(
      await found({ statuses: ON_THE_REGISTER, search: { kind: "NAME", name: "Zzzzz" } }),
    ).toEqual([]);
  });

  it("lists the expired certificates, leaving out the household that renewed theirs", async () => {
    expect(
      await found({
        statuses: ON_THE_REGISTER,
        certificate: validUntilRangeFor("EXPIRED", TODAY),
      }),
    ).toEqual([5]);
  });

  it("lists the certificates lapsing inside the next thirty days on their own", async () => {
    expect(
      await found({
        statuses: ON_THE_REGISTER,
        certificate: validUntilRangeFor("EXPIRING_SOON", TODAY),
      }),
    ).toEqual([7]);
  });

  it("counts the renewed household among the valid ones, on the notice it holds today", async () => {
    const valid = await found({
      statuses: ON_THE_REGISTER,
      certificate: validUntilRangeFor("VALID", TODAY),
    });

    expect(valid).toEqual(numbers(1, 45).filter((customerNumber) => customerNumber !== 5));
  });

  it("combines the filters rather than choosing between them", async () => {
    expect(
      await found({
        statuses: ["BLOCKED"],
        group: "BLUE",
        certificate: validUntilRangeFor("VALID", TODAY),
      }),
    ).toEqual(numbers(41, 45));
  });

  it("counts both groups over the whole register, blocked included and archived not", async () => {
    // 1–30 are Red and all still registered; of the Blue half only 31–45 are, because 46–50 left.
    expect(await repository.groupCounts()).toEqual({ red: 30, blue: 15 });
  });

  it("filters in the database, not by loading the register and sieving it in JavaScript", async () => {
    // A throwaway client per measurement, because a query listener cannot be detached again.
    const logged = new PrismaClient({
      datasourceUrl: url,
      log: [{ emit: "event", level: "query" }],
    });
    const statements: string[] = [];
    logged.$on("query", (event) => {
      statements.push(event.query);
    });

    await new PrismaCustomerRepository(logged).list({
      statuses: ["ACTIVE"],
      group: "BLUE",
      search: { kind: "NAME", name: "mueller" },
    });
    await logged.$disconnect();

    const customerQuery =
      statements.find((statement) => statement.includes("FROM `main`.`Customer`")) ?? "";
    expect(customerQuery).toContain("WHERE");
    // Every criterion reaches SQLite as a `WHERE` clause — read off the generated statement, past
    // the select list, where the column names appear whatever the query does. The assertion is
    // coarse on purpose: what must not regress is that the filtering happens *there* at all.
    const where = customerQuery.slice(customerQuery.indexOf("WHERE"));
    for (const column of ["status", "group", "lastNameFolded", "firstNameFolded"]) {
      expect(where).toContain(column);
    }
  });

  it("indexes the group and the folded first name, the two columns the list added", async () => {
    const indexes = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA index_list("Customer")`,
    );

    const names = indexes.map((index) => index.name);
    expect(names).toContain("Customer_group_idx");
    expect(names).toContain("Customer_firstNameFolded_idx");
  });
});
