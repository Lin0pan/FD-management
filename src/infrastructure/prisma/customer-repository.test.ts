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
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCustomerDetails, type NewCustomer } from "@/domain/customer/customer";
import type { Group } from "@/domain/customer/group";
import { CustomerNumberTaken } from "@/domain/errors";
import { PrismaCustomerCounter, PrismaCustomerRepository } from "./customer-repository";

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
  await prisma.customer.deleteMany();
});

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
    card: { index: 1, issuedAt: TODAY, reason: "FIRST_ISSUE" },
    ...overrides,
  };
}

/** Write a row straight through Prisma, for the states no use case can reach yet. */
async function insertCustomer(
  customerNumber: number,
  status: string,
  group: Group = "RED",
): Promise<void> {
  await prisma.customer.create({
    data: {
      customerNumber,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
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
      data: { customerId: created.id, index: 2, issuedAt: TODAY, reason: "LOST" },
    });

    expect((await repository.findById(created.id))?.card.index).toBe(2);
  });
});

describe("PrismaCustomerRepository.findByCustomerNumber", () => {
  it("resolves a reassigned number to its active holder, not the household it was taken from", async () => {
    const archived = await repository.create(newCustomer({ status: "ARCHIVED" }));
    const active = await repository.create(newCustomer());

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
    const later = await repository.create(newCustomer({ status: "ARCHIVED" }));

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
      data: { customerId: created.id, index: 2, issuedAt: TODAY, reason: "LOST" },
    });

    const found = await repository.findByCustomerNumber(50);

    expect(found?.details.householdMembers).toHaveLength(2);
    expect(found?.details.certificate.type).toBe(written.details.certificate.type);
    expect(found?.card.index).toBe(2);
  });

  it("costs the same number of queries however large the household — the counter never fans out", async () => {
    const queriesForHousehold = async (memberCount: number): Promise<number> => {
      await prisma.customer.deleteMany();
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
