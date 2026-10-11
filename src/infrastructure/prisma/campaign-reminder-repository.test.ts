/**
 * Integration tests for the SQLite campaign-reminder adapter — thin and test-after (CLAUDE.md).
 * What the pure layers cannot state: that the hand-written `one_active_campaign_reminder` index
 * refuses a second reminder, and that switching off deletes exactly that reminder's ticks (US-40).
 *
 * Each run migrates a throwaway database file, so nothing touches `data/fd.db`.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { foldName } from "@/domain/customer/nameSearch";
import { CampaignReminderAlreadyActive } from "@/domain/errors";
import { PrismaCampaignReminderRepository } from "./campaign-reminder-repository";
import { clearRegister, migrateThrowawayDatabase } from "./test-support";

faker.seed(20261011);

const STARTED = new Date("2026-11-30T09:00:00.000Z");
const ENDED = new Date("2026-12-24T12:00:00.000Z");
const NEXT_YEAR = new Date("2027-11-29T09:00:00.000Z");

let directory: string;
let prisma: PrismaClient;
let repository: PrismaCampaignReminderRepository;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-campaign-"));
  const url = `file:${join(directory, "test.db")}`;
  migrateThrowawayDatabase(url);
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaCampaignReminderRepository(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await clearRegister(prisma);
});

/** A household to tick, written straight through Prisma — the ticks are what is tested. */
async function insertCustomer(customerNumber: number): Promise<number> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const row = await prisma.customer.create({
    data: {
      customerNumber,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: new Date("1990-01-01T00:00:00.000Z"),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      status: "ACTIVE",
      reminderCount: 0,
      notes: "",
    },
    select: { id: true },
  });
  return row.id;
}

describe("PrismaCampaignReminderRepository.start", () => {
  it("round-trips the reminder switched on, and starts with nobody ticked", async () => {
    const started = await repository.start("Weihnachtstüte", STARTED);

    expect(started).toEqual({ id: expect.any(Number), name: "Weihnachtstüte", startedAt: STARTED });
    expect(await repository.findActive()).toEqual(started);
    expect(await repository.receivedCustomerIds(started.id)).toEqual(new Set());
  });

  it("refuses a second reminder while one is on, as CampaignReminderAlreadyActive", async () => {
    await repository.start("Weihnachtstüte", STARTED);

    await expect(repository.start("Ostertüte", STARTED)).rejects.toBeInstanceOf(
      CampaignReminderAlreadyActive,
    );
    expect(await prisma.campaignReminder.count()).toBe(1);
  });

  it("finds nothing switched on before the first reminder", async () => {
    expect(await repository.findActive()).toBeNull();
  });
});

describe("PrismaCampaignReminderRepository.setReceived", () => {
  it("leaves one tick when a household is ticked twice, and none once it is unticked", async () => {
    const reminder = await repository.start("Weihnachtstüte", STARTED);
    const customerId = await insertCustomer(301);

    await repository.setReceived(reminder.id, customerId, true);
    await repository.setReceived(reminder.id, customerId, true);
    expect(await prisma.campaignReminderTick.count()).toBe(1);
    expect(await repository.receivedCustomerIds(reminder.id)).toEqual(new Set([customerId]));

    await repository.setReceived(reminder.id, customerId, false);
    await repository.setReceived(reminder.id, customerId, false);
    expect(await repository.receivedCustomerIds(reminder.id)).toEqual(new Set());
  });
});

describe("PrismaCampaignReminderRepository.rename", () => {
  it("renames the reminder in place and keeps its ticks", async () => {
    const reminder = await repository.start("Weihnachtstüte", STARTED);
    const customerId = await insertCustomer(301);
    await repository.setReceived(reminder.id, customerId, true);

    await repository.rename(reminder.id, "Nikolaustüte");

    expect(await repository.findActive()).toEqual({ ...reminder, name: "Nikolaustüte" });
    expect(await repository.receivedCustomerIds(reminder.id)).toEqual(new Set([customerId]));
  });
});

describe("PrismaCampaignReminderRepository.end", () => {
  it("stamps the reminder as switched off, keeps the row and deletes its ticks", async () => {
    const first = await insertCustomer(301);
    const second = await insertCustomer(303);
    const ended = await repository.start("Weihnachtstüte", STARTED);
    await repository.setReceived(ended.id, first, true);
    await repository.setReceived(ended.id, second, true);

    await repository.end(ended.id, ENDED);

    expect(await repository.findActive()).toBeNull();
    expect(await prisma.campaignReminder.findUnique({ where: { id: ended.id } })).toMatchObject({
      endedAt: ENDED,
    });
    expect(await prisma.campaignReminderTick.count()).toBe(0);
  });

  it("lets a new reminder start once the last one is switched off, reading no ticks", async () => {
    const customerId = await insertCustomer(301);
    const ended = await repository.start("Weihnachtstüte", STARTED);
    await repository.setReceived(ended.id, customerId, true);
    await repository.end(ended.id, ENDED);

    const next = await repository.start("Ostertüte", NEXT_YEAR);

    expect(await repository.findActive()).toEqual(next);
    expect(await repository.receivedCustomerIds(next.id)).toEqual(new Set());
  });
});
