/**
 * Integration tests for the SQLite distribution-record adapter.
 *
 * Thin and test-after, per the testing approach (CLAUDE.md): what is worth proving here is what the
 * pure layers cannot state — that `(customerId, dayKey)` is unique on the **Berlin** calendar day, so
 * a second hand-out on the same day cannot be written even if the use-case guard is bypassed, that the
 * key is Berlin and not UTC (a boundary two minutes either side of Berlin midnight is two days), that
 * the constraint is scoped to the customer so two households may collect on the same day, and that a
 * record outlives its customer's status changes and is never cascade-deleted (US-05.3, FR-6). The
 * once-per-day rule itself is unit-tested in src/domain; the correction rules in src/application.
 *
 * Each run migrates a throwaway database file which is deleted afterwards, so nothing touches
 * data/fd.db. Synthetic data only (Faker), seeded so a failing run is reproducible.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NewDistributionRecord } from "@/domain/distribution/distributionRecord";
import { AlreadyServedToday, DistributionRecordNotFound } from "@/domain/errors";
import type { Cents } from "@/domain/money";
import { PrismaDistributionRecordRepository } from "./distribution-record-repository";

faker.seed(20260724);

// Berlin is CEST (UTC+2) in July, so its midnight is 22:00 UTC the day before.
const MORNING = new Date("2026-07-23T09:00:00.000Z"); // Berlin 2026-07-23 11:00
const AFTERNOON = new Date("2026-07-23T16:00:00.000Z"); // Berlin 2026-07-23 18:00 — same day
const NEXT_DAY = new Date("2026-08-06T09:00:00.000Z"); // Berlin 2026-08-06 — a later day
const JUST_BEFORE_MIDNIGHT = new Date("2026-07-23T21:59:00.000Z"); // Berlin 2026-07-23 23:59
const JUST_AFTER_MIDNIGHT = new Date("2026-07-23T22:01:00.000Z"); // Berlin 2026-07-24 00:01

const PRICE = 550 as Cents;

let directory: string;
let prisma: PrismaClient;
let repository: PrismaDistributionRecordRepository;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-distribution-"));
  const url = `file:${join(directory, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaDistributionRecordRepository(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.distributionRecord.deleteMany();
  await prisma.customer.deleteMany();
});

/** A customer holding the given slot, written straight through Prisma — records are what is tested. */
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

/** A hand-out for the customer, with sensible defaults so a test only names what it cares about. */
function handOut(
  customerId: number,
  overrides: Partial<NewDistributionRecord> = {},
): NewDistributionRecord {
  return {
    customerId,
    date: MORNING,
    showedUp: true,
    paid: true,
    priceCents: PRICE,
    ...overrides,
  };
}

describe("PrismaDistributionRecordRepository.create", () => {
  it("stores the day, showed-up, paid flag and the price the hand-out was taken at", async () => {
    const customerId = await insertCustomer(50);

    const record = await repository.create(handOut(customerId, { paid: false }));

    expect(record).toEqual({
      id: expect.any(Number),
      customerId,
      date: MORNING,
      showedUp: true,
      paid: false,
      priceCents: PRICE,
    });
    expect(await prisma.distributionRecord.count({ where: { customerId } })).toBe(1);
  });

  it("stores a Berlin day-key column the unique constraint rests on", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId));

    const [row] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT "dayKey" FROM "DistributionRecord" WHERE "customerId" = ${customerId}`,
    );
    expect(row.dayKey).toBe("2026-07-23");
  });

  it("refuses a second hand-out on the same Berlin day, as AlreadyServedToday", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId, { date: MORNING }));

    await expect(
      repository.create(handOut(customerId, { date: AFTERNOON })),
    ).rejects.toBeInstanceOf(AlreadyServedToday);
    expect(await prisma.distributionRecord.count({ where: { customerId } })).toBe(1);
  });

  it("keys the day in Europe/Berlin, not UTC — two minutes either side of midnight is two days", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId, { date: JUST_BEFORE_MIDNIGHT }));

    // Same UTC day, but the Berlin day rolled over at 00:00 CEST — so this is a new day, not a clash.
    await expect(
      repository.create(handOut(customerId, { date: JUST_AFTER_MIDNIGHT })),
    ).resolves.toBeDefined();
    expect(await prisma.distributionRecord.count({ where: { customerId } })).toBe(2);
  });

  it("lets the same customer collect again on a later day", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId, { date: MORNING }));

    await expect(repository.create(handOut(customerId, { date: NEXT_DAY }))).resolves.toBeDefined();
    expect(await prisma.distributionRecord.count({ where: { customerId } })).toBe(2);
  });

  it("scopes the once-per-day rule to the customer, so two households may collect the same day", async () => {
    const one = await insertCustomer(50);
    const other = await insertCustomer(51);

    await repository.create(handOut(one, { date: MORNING }));
    await expect(repository.create(handOut(other, { date: MORNING }))).resolves.toBeDefined();
  });

  it("lets neither of two simultaneous hand-outs on one day leave two records", async () => {
    const customerId = await insertCustomer(50);

    const results = await Promise.allSettled([
      repository.create(handOut(customerId, { date: MORNING })),
      repository.create(handOut(customerId, { date: AFTERNOON })),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(AlreadyServedToday);
    expect(await prisma.distributionRecord.count({ where: { customerId } })).toBe(1);
  });
});

describe("a record outliving its customer's status changes", () => {
  it("keeps the record when the customer is archived — records survive status changes", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId));

    await prisma.customer.update({ where: { id: customerId }, data: { status: "ARCHIVED" } });

    expect(await prisma.distributionRecord.count({ where: { customerId } })).toBe(1);
  });

  it("refuses to hard-delete a customer who holds records, rather than cascading them away", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId));

    await expect(prisma.customer.delete({ where: { id: customerId } })).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    expect(await prisma.distributionRecord.count({ where: { customerId } })).toBe(1);
  });
});

describe("PrismaDistributionRecordRepository reads and corrections", () => {
  it("lists every record for the customer, oldest first", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId, { date: NEXT_DAY }));
    await repository.create(handOut(customerId, { date: MORNING }));

    const records = await repository.listForCustomer(customerId);

    expect(records.map((record) => record.date)).toEqual([MORNING, NEXT_DAY]);
  });

  it("lists only the records of the customer asked about", async () => {
    const one = await insertCustomer(50);
    const other = await insertCustomer(51);
    await repository.create(handOut(one, { date: MORNING }));
    await repository.create(handOut(other, { date: MORNING }));

    expect(await repository.listForCustomer(one)).toHaveLength(1);
  });

  it("finds a record by id, and answers null for an id nobody holds", async () => {
    const customerId = await insertCustomer(50);
    const created = await repository.create(handOut(customerId));

    expect(await repository.findById(created.id)).toEqual(created);
    expect(await repository.findById(9_999)).toBeNull();
  });

  it("amends the paid flag of a record made today", async () => {
    const customerId = await insertCustomer(50);
    const created = await repository.create(handOut(customerId, { paid: true }));

    const amended = await repository.setPaid(created.id, false);

    expect(amended.paid).toBe(false);
    expect((await repository.findById(created.id))?.paid).toBe(false);
  });

  it("removes a record made today, the one deletion the history permits", async () => {
    const customerId = await insertCustomer(50);
    const created = await repository.create(handOut(customerId));

    await repository.remove(created.id);

    expect(await repository.findById(created.id)).toBeNull();
  });

  it("reports DistributionRecordNotFound when a correction names no record", async () => {
    await expect(repository.setPaid(9_999, false)).rejects.toBeInstanceOf(
      DistributionRecordNotFound,
    );
    await expect(repository.remove(9_999)).rejects.toBeInstanceOf(DistributionRecordNotFound);
  });
});
