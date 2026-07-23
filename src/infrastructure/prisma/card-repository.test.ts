/**
 * Integration tests for the SQLite card adapter.
 *
 * Thin and test-after, per the testing approach (CLAUDE.md): what is worth proving here is the pair
 * of facts the pure layers cannot state — that `(customerId, index)` is unique, so two cards can
 * never share the highest index, and that the constraint is scoped to the *customer id* rather than
 * the card number, so two households may each hold `50k1` (FR-6). The rules about which index falls
 * due are covered in src/application.
 *
 * Each run migrates a throwaway database file which is deleted afterwards, so nothing touches
 * data/fd.db. Synthetic data only (Faker), seeded so a failing run is reproducible.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { formatCardNumber } from "@/domain/card/cardNumber";
import { CardIndexTaken, InvalidCustomerRecord } from "@/domain/errors";
import { PrismaCardRepository } from "./card-repository";

faker.seed(20260723);

const TODAY = new Date("2026-07-23T09:00:00.000Z");
const LATER = new Date("2026-09-01T09:00:00.000Z");

let directory: string;
let prisma: PrismaClient;
let repository: PrismaCardRepository;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-cards-"));
  const url = `file:${join(directory, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaCardRepository(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.customer.deleteMany();
});

/** A customer holding the given slot, written straight through Prisma — cards are what is tested. */
async function insertCustomer(customerNumber: number, status = "ACTIVE"): Promise<number> {
  const row = await prisma.customer.create({
    data: {
      customerNumber,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      birthDate: new Date("1990-01-01T00:00:00.000Z"),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: "RED",
      status,
      reminderCount: 0,
      notes: "",
    },
    select: { id: true },
  });
  return row.id;
}

describe("PrismaCardRepository.issue", () => {
  it("stores the index, the issue date and the reason the card was handed over", async () => {
    const customerId = await insertCustomer(50);

    const card = await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
    });

    expect(card).toEqual({ index: 1, issuedAt: TODAY, reason: "FIRST_ISSUE" });
    const rows = await prisma.card.findMany({ where: { customerId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("FIRST_ISSUE");
  });

  it("keeps the superseded card on file, so an old card is recognisable at the counter", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, { index: 1, issuedAt: TODAY, reason: "FIRST_ISSUE" });

    await repository.issue(customerId, { index: 2, issuedAt: LATER, reason: "LOST" });

    expect(await prisma.card.count({ where: { customerId } })).toBe(2);
  });

  it("stores no valid flag — validity is being the highest index", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, { index: 1, issuedAt: TODAY, reason: "FIRST_ISSUE" });

    const [row] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "Card" WHERE "customerId" = ${customerId}`,
    );
    expect(Object.keys(row)).not.toContain("valid");
  });

  it("refuses a second card on an index another issue took, as CardIndexTaken", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, { index: 1, issuedAt: TODAY, reason: "FIRST_ISSUE" });

    await expect(
      repository.issue(customerId, { index: 1, issuedAt: LATER, reason: "LOST" }),
    ).rejects.toBeInstanceOf(CardIndexTaken);
  });

  it("lets neither of two simultaneous issues of the same index leave two current cards", async () => {
    const customerId = await insertCustomer(50);

    const results = await Promise.allSettled([
      repository.issue(customerId, { index: 1, issuedAt: TODAY, reason: "FIRST_ISSUE" }),
      repository.issue(customerId, { index: 1, issuedAt: TODAY, reason: "LOST" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(CardIndexTaken);
    expect(await prisma.card.count({ where: { customerId } })).toBe(1);
  });
});

describe("the card number across customers", () => {
  it("lets two different customers both hold card number 50k1", async () => {
    const first = await insertCustomer(50, "ARCHIVED");
    const second = await insertCustomer(50);

    await repository.issue(first, { index: 1, issuedAt: TODAY, reason: "FIRST_ISSUE" });
    await repository.issue(second, { index: 1, issuedAt: LATER, reason: "FIRST_ISSUE" });

    const [firstCard, secondCard] = await Promise.all([
      repository.currentCard(first),
      repository.currentCard(second),
    ]);
    expect(formatCardNumber(50, firstCard?.index ?? 0)).toBe("50k1");
    expect(formatCardNumber(50, secondCard?.index ?? 0)).toBe("50k1");
  });
});

describe("PrismaCardRepository.currentCard", () => {
  it("gives null for a customer who holds no card yet", async () => {
    expect(await repository.currentCard(await insertCustomer(50))).toBeNull();
  });

  it("gives null for an id that belongs to nobody", async () => {
    expect(await repository.currentCard(9_999)).toBeNull();
  });

  it("reports the highest index, so a reissued card supersedes the first", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, { index: 1, issuedAt: TODAY, reason: "FIRST_ISSUE" });
    await repository.issue(customerId, { index: 2, issuedAt: LATER, reason: "LOST" });

    expect(await repository.currentCard(customerId)).toEqual({
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
    });
  });

  it("reports the highest index even where the run has a gap", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, { index: 1, issuedAt: TODAY, reason: "FIRST_ISSUE" });
    await repository.issue(customerId, { index: 4, issuedAt: LATER, reason: "OTHER" });

    expect((await repository.currentCard(customerId))?.index).toBe(4);
  });

  it("refuses a hand-edited reason rather than quietly reading it as OTHER", async () => {
    const customerId = await insertCustomer(50);
    await prisma.card.create({
      data: { customerId, index: 1, issuedAt: TODAY, reason: "VERLOREN" },
    });

    await expect(repository.currentCard(customerId)).rejects.toBeInstanceOf(InvalidCustomerRecord);
  });
});
