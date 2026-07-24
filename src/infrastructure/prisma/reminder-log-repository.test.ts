/**
 * Integration tests for the SQLite reminder-log adapter.
 *
 * Thin and test-after, per the testing approach (CLAUDE.md): what is worth proving here is what the
 * pure layers cannot state — that the unique `(customerId, loggedOn)` constraint caps reminders at
 * one per customer per day even when the use-case guard is bypassed or raced past (US-06.3), that
 * the constraint is scoped to the customer, and that `record` writes the log entry and the
 * customer's new `reminderCount` in one transaction, so a rejected entry moves no count. The
 * once-per-day rule itself is unit-tested in src/application.
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
import { ReminderAlreadyLoggedToday } from "@/domain/errors";
import { PrismaReminderLogRepository } from "./reminder-log-repository";

faker.seed(20260724);

const TODAY = "2026-07-23";
const TOMORROW = "2026-07-24";

let directory: string;
let prisma: PrismaClient;
let repository: PrismaReminderLogRepository;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-reminders-"));
  const url = `file:${join(directory, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaReminderLogRepository(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.reminderLog.deleteMany();
  await prisma.customer.deleteMany();
});

/** A customer holding the given slot, written straight through Prisma — the trail is what is tested. */
async function insertCustomer(customerNumber: number, reminderCount = 0): Promise<number> {
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
      status: "ACTIVE",
      reminderCount,
      notes: "",
    },
    select: { id: true },
  });
  return row.id;
}

async function countOf(customerId: number): Promise<number> {
  const row = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { reminderCount: true },
  });
  return row.reminderCount;
}

describe("PrismaReminderLogRepository.record", () => {
  it("writes the log entry and the customer's new count together", async () => {
    const customerId = await insertCustomer(50, 1);

    await repository.record(customerId, { loggedOn: TODAY, resultingCount: 2 });

    expect(await repository.findOnDay(customerId, TODAY)).toEqual({
      loggedOn: TODAY,
      resultingCount: 2,
    });
    expect(await countOf(customerId)).toBe(2);
  });

  it("refuses a second reminder on the same day as ReminderAlreadyLoggedToday, and writes nothing", async () => {
    const customerId = await insertCustomer(50);
    await repository.record(customerId, { loggedOn: TODAY, resultingCount: 1 });

    await expect(
      repository.record(customerId, { loggedOn: TODAY, resultingCount: 2 }),
    ).rejects.toBeInstanceOf(ReminderAlreadyLoggedToday);

    expect(await prisma.reminderLog.count({ where: { customerId } })).toBe(1);
    expect(await countOf(customerId)).toBe(1);
  });

  it("lets neither of two simultaneous reminders on one day leave two entries or a wrong count", async () => {
    const customerId = await insertCustomer(50);

    const results = await Promise.allSettled([
      repository.record(customerId, { loggedOn: TODAY, resultingCount: 1 }),
      repository.record(customerId, { loggedOn: TODAY, resultingCount: 1 }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(ReminderAlreadyLoggedToday);
    expect(await prisma.reminderLog.count({ where: { customerId } })).toBe(1);
    expect(await countOf(customerId)).toBe(1);
  });

  it("lets the trail continue on a later day", async () => {
    const customerId = await insertCustomer(50);
    await repository.record(customerId, { loggedOn: TODAY, resultingCount: 1 });

    await repository.record(customerId, { loggedOn: TOMORROW, resultingCount: 2 });

    expect(await prisma.reminderLog.count({ where: { customerId } })).toBe(2);
    expect(await countOf(customerId)).toBe(2);
  });

  it("scopes the once-per-day rule to the customer, so two households may be reminded the same day", async () => {
    const one = await insertCustomer(50);
    const other = await insertCustomer(51);

    await repository.record(one, { loggedOn: TODAY, resultingCount: 1 });
    await expect(
      repository.record(other, { loggedOn: TODAY, resultingCount: 1 }),
    ).resolves.toBeUndefined();
  });
});

describe("PrismaReminderLogRepository.findOnDay", () => {
  it("answers null for a day no reminder was logged on", async () => {
    const customerId = await insertCustomer(50);
    await repository.record(customerId, { loggedOn: TODAY, resultingCount: 1 });

    expect(await repository.findOnDay(customerId, TOMORROW)).toBeNull();
  });
});
