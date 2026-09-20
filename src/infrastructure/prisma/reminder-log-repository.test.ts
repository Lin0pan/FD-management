/**
 * Integration tests for the SQLite reminder-log adapter — thin and test-after (CLAUDE.md). What the
 * pure layers cannot state: that the unique `(customerId, sessionId)` constraint caps reminders at
 * one per session even when the use-case guard is raced past (US-06.3, US-34), that it is scoped to
 * the customer, and that `record` writes the entry and the new count in one transaction.
 *
 * Each run migrates a throwaway database file, so nothing touches `data/fd.db`.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSessionGroups } from "@/domain/distribution/session";
import { ReminderAlreadyLoggedInSession } from "@/domain/errors";
import { foldName } from "@/domain/customer/nameSearch";
import { PrismaDistributionSessionRepository } from "./distribution-session-repository";
import { PrismaReminderLogRepository } from "./reminder-log-repository";
import { clearRegister, migrateThrowawayDatabase } from "./test-support";

faker.seed(20260724);

const TODAY = new Date("2026-07-23T09:00:00.000Z");
const NEXT_WEEK = new Date("2026-07-30T09:00:00.000Z");

let directory: string;
let prisma: PrismaClient;
let repository: PrismaReminderLogRepository;
let sessions: PrismaDistributionSessionRepository;
/** The afternoon the reminders below are given at, and the one after it. */
let thisSession: number;
let nextSession: number;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-reminders-"));
  const url = `file:${join(directory, "test.db")}`;
  migrateThrowawayDatabase(url);
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaReminderLogRepository(prisma);
  sessions = new PrismaDistributionSessionRepository(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await clearRegister(prisma);
  // Two ended sessions rather than one running: a reminder belongs to the session it was given in,
  // and these tests are about the constraint, not about what may still be written.
  thisSession = (await sessions.start(createSessionGroups(["RED"]), TODAY)).id;
  await sessions.end(thisSession, TODAY);
  nextSession = (await sessions.start(createSessionGroups(["BLUE"]), NEXT_WEEK)).id;
  await sessions.end(nextSession, NEXT_WEEK);
});

/** A customer holding the given slot, written straight through Prisma — the trail is what is tested. */
async function insertCustomer(customerNumber: number, reminderCount = 0): Promise<number> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const row = await prisma.customer.create({
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

    await repository.record(customerId, { sessionId: thisSession, resultingCount: 2 });

    expect(await repository.findInSession(customerId, thisSession)).toEqual({
      sessionId: thisSession,
      resultingCount: 2,
    });
    expect(await countOf(customerId)).toBe(2);
  });

  it("refuses a second reminder in the same session, and writes nothing", async () => {
    const customerId = await insertCustomer(50);
    await repository.record(customerId, { sessionId: thisSession, resultingCount: 1 });

    await expect(
      repository.record(customerId, { sessionId: thisSession, resultingCount: 2 }),
    ).rejects.toBeInstanceOf(ReminderAlreadyLoggedInSession);

    expect(await prisma.reminderLog.count({ where: { customerId } })).toBe(1);
    expect(await countOf(customerId)).toBe(1);
  });

  it("lets neither of two simultaneous reminders in one session leave two entries or a wrong count", async () => {
    const customerId = await insertCustomer(50);

    const results = await Promise.allSettled([
      repository.record(customerId, { sessionId: thisSession, resultingCount: 1 }),
      repository.record(customerId, { sessionId: thisSession, resultingCount: 1 }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(ReminderAlreadyLoggedInSession);
    expect(await prisma.reminderLog.count({ where: { customerId } })).toBe(1);
    expect(await countOf(customerId)).toBe(1);
  });

  it("lets the trail continue at the next session", async () => {
    const customerId = await insertCustomer(50);
    await repository.record(customerId, { sessionId: thisSession, resultingCount: 1 });

    await repository.record(customerId, { sessionId: nextSession, resultingCount: 2 });

    expect(await prisma.reminderLog.count({ where: { customerId } })).toBe(2);
    expect(await countOf(customerId)).toBe(2);
  });

  it("scopes the once-per-session rule to the customer, so two households may be reminded at one", async () => {
    const one = await insertCustomer(50);
    const other = await insertCustomer(51);

    await repository.record(one, { sessionId: thisSession, resultingCount: 1 });
    await expect(
      repository.record(other, { sessionId: thisSession, resultingCount: 1 }),
    ).resolves.toBeUndefined();
  });
});

describe("PrismaReminderLogRepository reads", () => {
  it("answers null for a session no reminder was logged in", async () => {
    const customerId = await insertCustomer(50);
    await repository.record(customerId, { sessionId: thisSession, resultingCount: 1 });

    expect(await repository.findInSession(customerId, nextSession)).toBeNull();
  });

  it("lists the reminders of one session and not those of another", async () => {
    const one = await insertCustomer(50);
    const other = await insertCustomer(51);
    await repository.record(one, { sessionId: thisSession, resultingCount: 1 });
    await repository.record(other, { sessionId: nextSession, resultingCount: 1 });

    expect(await repository.listForSession(thisSession)).toEqual([
      { sessionId: thisSession, resultingCount: 1 },
    ]);
  });
});
