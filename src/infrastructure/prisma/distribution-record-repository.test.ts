/**
 * Integration tests for the SQLite distribution-record adapter — thin and test-after (CLAUDE.md).
 * What the pure layers cannot state: that `(customerId, sessionId)` is unique even if the use-case
 * guard is bypassed, that it is scoped to the customer and to the session — an afternoon running
 * past midnight is one, and a second distribution on one day is two — and that a record outlives its
 * customer's status changes and is never cascade-deleted (US-05.3, FR-6; US-34).
 *
 * Each run migrates a throwaway database file, so nothing touches `data/fd.db`.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NewDistributionRecord } from "@/domain/distribution/distributionRecord";
import type { HandoutReceipt } from "@/domain/distribution/handoutReceipt";
import { createSessionGroups } from "@/domain/distribution/session";
import { AlreadyServedInSession, DistributionRecordNotFound } from "@/domain/errors";
import type { Cents } from "@/domain/money";
import { PrismaDistributionRecordRepository } from "./distribution-record-repository";
import { PrismaDistributionSessionRepository } from "./distribution-session-repository";
import { clearRegister, migrateThrowawayDatabase } from "./test-support";
import { foldName } from "@/domain/customer/nameSearch";

faker.seed(20260724);

const MORNING = new Date("2026-07-23T09:00:00.000Z");
const AFTERNOON = new Date("2026-07-23T16:00:00.000Z"); // the same afternoon, a few hours on
// Berlin is CEST (UTC+2) in July, so its midnight is 22:00 UTC the day before: an afternoon that
// runs from here to there crosses the calendar day and stays one session (US-34).
const JUST_BEFORE_MIDNIGHT = new Date("2026-07-23T21:59:00.000Z");
const JUST_AFTER_MIDNIGHT = new Date("2026-07-23T22:01:00.000Z");
const NEXT_WEEK = new Date("2026-08-06T09:00:00.000Z");

const PRICE = 550 as Cents;
/** Less than the price and more than it — the two cases a flag could not hold (US-29). */
const PART_PAYMENT = 200 as Cents;
const OVERPAYMENT = 800 as Cents;

let directory: string;
let prisma: PrismaClient;
let repository: PrismaDistributionRecordRepository;
let sessions: PrismaDistributionSessionRepository;
/** The afternoon the hand-outs below belong to, and the week after's. */
let thisSession: number;
let nextSession: number;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-distribution-"));
  const url = `file:${join(directory, "test.db")}`;
  migrateThrowawayDatabase(url);
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaDistributionRecordRepository(prisma);
  sessions = new PrismaDistributionSessionRepository(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await clearRegister(prisma);
  thisSession = (await sessions.start(createSessionGroups(["RED"]), MORNING)).id;
  await sessions.end(thisSession, JUST_AFTER_MIDNIGHT);
  nextSession = (await sessions.start(createSessionGroups(["BLUE"]), NEXT_WEEK)).id;
  await sessions.end(nextSession, NEXT_WEEK);
});

/** A customer holding the given slot, written straight through Prisma — records are what is tested. */
async function insertCustomer(customerNumber: number, status = "ACTIVE"): Promise<number> {
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
    sessionId: thisSession,
    date: MORNING,
    showedUp: true,
    paidCents: PRICE,
    priceCents: PRICE,
    ...overrides,
  };
}

/**
 * The household as it stood, with the one field each test varies named and the rest defaulted. The
 * values are arbitrary: what is under test is that all nine survive the round trip unchanged.
 */
function receipt(overrides: Partial<HandoutReceipt> = {}): HandoutReceipt {
  return {
    customerNumber: 50,
    firstName: "Änne",
    lastName: "Müller",
    grownUps: 2,
    children: 3,
    cardCustomerNumber: 44,
    cardIndex: 2,
    certificateValidUntil: new Date("2026-12-31T00:00:00.000Z"),
    reminderCount: 1,
    ...overrides,
  };
}

describe("PrismaDistributionRecordRepository.create", () => {
  it("stores the day, showed-up, the amount handed over and the price it was taken at", async () => {
    const customerId = await insertCustomer(50);

    const record = await repository.create(handOut(customerId, { paidCents: PART_PAYMENT }));

    expect(record).toEqual({
      id: expect.any(Number),
      customerId,
      sessionId: thisSession,
      date: MORNING,
      showedUp: true,
      paidCents: PART_PAYMENT,
      priceCents: PRICE,
    });
    expect(await prisma.distributionRecord.count({ where: { customerId } })).toBe(1);
  });

  it("stores a payment of nothing as nothing, never as an absent one", async () => {
    // The distinction the boolean could not make and the balance rests on: a household that handed
    // over nothing owes the whole price, and the column must say `0` rather than leave it open.
    const customerId = await insertCustomer(50);

    const record = await repository.create(handOut(customerId, { paidCents: 0 as Cents }));

    expect(record.paidCents).toBe(0);
    const [row] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT "paidCents" FROM "DistributionRecord" WHERE "id" = ${record.id}`,
    );
    expect(row.paidCents).toBe(0);
  });

  it("stores a payment above the price, so paying ahead survives the round trip", async () => {
    const customerId = await insertCustomer(50);

    const record = await repository.create(handOut(customerId, { paidCents: OVERPAYMENT }));

    expect((await repository.findById(record.id))?.paidCents).toBe(OVERPAYMENT);
  });

  it("stores the session the hand-out belongs to, which the unique constraint rests on", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId));

    const [row] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT "sessionId" FROM "DistributionRecord" WHERE "customerId" = ${customerId}`,
    );
    expect(row.sessionId).toBe(thisSession);
  });

  it("refuses a second hand-out in the same session, as AlreadyServedInSession", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId, { date: MORNING }));

    await expect(
      repository.create(handOut(customerId, { date: AFTERNOON })),
    ).rejects.toBeInstanceOf(AlreadyServedInSession);
    expect(await prisma.distributionRecord.count({ where: { customerId } })).toBe(1);
  });

  it("refuses the second hand-out of an afternoon that has run past midnight, which is still one", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId, { date: JUST_BEFORE_MIDNIGHT }));

    // Two minutes later the Berlin calendar has turned the day; the session has not, so this is the
    // same collection and the constraint says so.
    await expect(
      repository.create(handOut(customerId, { date: JUST_AFTER_MIDNIGHT })),
    ).rejects.toBeInstanceOf(AlreadyServedInSession);
    expect(await prisma.distributionRecord.count({ where: { customerId } })).toBe(1);
  });

  it("lets the same customer collect again at a later session", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId, { date: MORNING }));

    await expect(
      repository.create(handOut(customerId, { date: NEXT_WEEK, sessionId: nextSession })),
    ).resolves.toBeDefined();
    expect(await prisma.distributionRecord.count({ where: { customerId } })).toBe(2);
  });

  it("scopes the once-per-session rule to the customer, so two households may collect at one", async () => {
    const one = await insertCustomer(50);
    const other = await insertCustomer(51);

    await repository.create(handOut(one, { date: MORNING }));
    await expect(repository.create(handOut(other, { date: MORNING }))).resolves.toBeDefined();
  });

  it("lets neither of two simultaneous hand-outs in one session leave two records", async () => {
    const customerId = await insertCustomer(50);

    const results = await Promise.allSettled([
      repository.create(handOut(customerId, { date: MORNING })),
      repository.create(handOut(customerId, { date: AFTERNOON })),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(AlreadyServedInSession);
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
    await repository.create(handOut(customerId, { date: NEXT_WEEK, sessionId: nextSession }));
    await repository.create(handOut(customerId, { date: MORNING }));

    const records = await repository.listForCustomer(customerId);

    expect(records.map((record) => record.date)).toEqual([MORNING, NEXT_WEEK]);
  });

  it("lists only the records of the customer asked about", async () => {
    const one = await insertCustomer(50);
    const other = await insertCustomer(51);
    await repository.create(handOut(one, { date: MORNING }));
    await repository.create(handOut(other, { date: MORNING }));

    expect(await repository.listForCustomer(one)).toHaveLength(1);
  });

  it("lists every hand-out written in the session asked about, whoever collected", async () => {
    const one = await insertCustomer(50);
    const other = await insertCustomer(51);
    await repository.create(handOut(one, { date: MORNING }));
    await repository.create(handOut(other, { date: AFTERNOON })); // same session, later hour

    const records = await repository.listForSession(thisSession);

    expect(records.map((record) => record.customerId).sort()).toEqual([one, other].sort());
  });

  it("leaves out the hand-outs of another session — the session asked for is the whole filter", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId, { date: MORNING }));
    await repository.create(handOut(customerId, { date: NEXT_WEEK, sessionId: nextSession }));

    expect(await repository.listForSession(thisSession)).toHaveLength(1);
    expect(await repository.listForSession(nextSession)).toHaveLength(1);
  });

  it("answers an empty list for a session nobody collected at", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId, { date: MORNING }));

    expect(await repository.listForSession(nextSession)).toEqual([]);
  });

  it("finds a record by id, and answers null for an id nobody holds", async () => {
    const customerId = await insertCustomer(50);
    const created = await repository.create(handOut(customerId));

    expect(await repository.findById(created.id)).toEqual(created);
    expect(await repository.findById(9_999)).toBeNull();
  });

  it("amends the amount handed over on a record whose session still runs", async () => {
    const customerId = await insertCustomer(50);
    const created = await repository.create(handOut(customerId));

    const amended = await repository.setPayment(created.id, PART_PAYMENT);

    expect(amended.paidCents).toBe(PART_PAYMENT);
    expect((await repository.findById(created.id))?.paidCents).toBe(PART_PAYMENT);
  });

  it("amends a payment down to nothing, and stores it as nothing", async () => {
    const customerId = await insertCustomer(50);
    const created = await repository.create(handOut(customerId));

    const amended = await repository.setPayment(created.id, 0 as Cents);

    expect(amended.paidCents).toBe(0);
    expect((await repository.findById(created.id))?.paidCents).toBe(0);
  });

  it("removes a record, the one deletion the history permits", async () => {
    const customerId = await insertCustomer(50);
    const created = await repository.create(handOut(customerId));

    await repository.remove(created.id);

    expect(await repository.findById(created.id)).toBeNull();
  });

  it("reports DistributionRecordNotFound when a correction names no record", async () => {
    await expect(repository.setPayment(9_999, PRICE)).rejects.toBeInstanceOf(
      DistributionRecordNotFound,
    );
    await expect(repository.remove(9_999)).rejects.toBeInstanceOf(DistributionRecordNotFound);
  });
});

describe("PrismaDistributionRecordRepository.summariseBySession", () => {
  it("counts the households of each session and sums what they handed over", async () => {
    const one = await insertCustomer(50);
    const other = await insertCustomer(51);
    await repository.create(handOut(one, { paidCents: PART_PAYMENT }));
    await repository.create(handOut(other, { paidCents: OVERPAYMENT }));
    await repository.create(handOut(one, { sessionId: nextSession, date: NEXT_WEEK }));

    const summaries = await repository.summariseBySession();

    expect(summaries.get(thisSession)).toEqual({
      households: 2,
      totalPaidCents: PART_PAYMENT + OVERPAYMENT,
    });
    expect(summaries.get(nextSession)).toEqual({ households: 1, totalPaidCents: PRICE });
  });

  it("sums a payment of nothing as nothing rather than dropping the household from the count", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId, { paidCents: 0 as Cents }));

    expect(await repository.summariseBySession()).toEqual(
      new Map([[thisSession, { households: 1, totalPaidCents: 0 }]]),
    );
  });

  it("leaves a session nobody collected at out of the map, rather than answering it as a zero", async () => {
    const customerId = await insertCustomer(50);
    await repository.create(handOut(customerId));

    const summaries = await repository.summariseBySession();

    expect(summaries.has(nextSession)).toBe(false);
  });
});

describe("PrismaDistributionRecordRepository freezing and thawing a session", () => {
  it("round-trips every captured detail of a household, unchanged", async () => {
    const customerId = await insertCustomer(50);
    const record = await repository.create(handOut(customerId));
    const captured = receipt();

    await repository.freezeSession(thisSession, [{ recordId: record.id, receipt: captured }]);

    const stored = await prisma.handoutReceipt.findUniqueOrThrow({
      where: { recordId: record.id },
      omit: { id: true, recordId: true },
    });
    expect(stored).toEqual(captured);
  });

  it("writes one receipt per hand-out of the session and none for any other afternoon", async () => {
    const [first, second, elsewhere] = [
      await insertCustomer(50),
      await insertCustomer(52),
      await insertCustomer(54),
    ];
    const records = [
      await repository.create(handOut(first)),
      await repository.create(handOut(second)),
    ];
    const other = await repository.create(handOut(elsewhere, { sessionId: nextSession }));

    await repository.freezeSession(
      thisSession,
      records.map((record) => ({ recordId: record.id, receipt: receipt() })),
    );

    expect(await prisma.handoutReceipt.count()).toBe(2);
    expect(await prisma.handoutReceipt.findUnique({ where: { recordId: other.id } })).toBeNull();
  });

  it("re-takes the freeze whole, so ending an afternoon a second time is not refused", async () => {
    const customerId = await insertCustomer(50);
    const record = await repository.create(handOut(customerId));
    await repository.freezeSession(thisSession, [{ recordId: record.id, receipt: receipt() }]);

    await repository.freezeSession(thisSession, [
      { recordId: record.id, receipt: receipt({ lastName: "Schmidt-Öztürk" }) },
    ]);

    expect(await prisma.handoutReceipt.count()).toBe(1);
    expect(
      (await prisma.handoutReceipt.findUniqueOrThrow({ where: { recordId: record.id } })).lastName,
    ).toBe("Schmidt-Öztürk");
  });

  it("thaws a session's receipts and leaves its hand-outs untouched", async () => {
    const customerId = await insertCustomer(50);
    const record = await repository.create(handOut(customerId));
    await repository.freezeSession(thisSession, [{ recordId: record.id, receipt: receipt() }]);

    await repository.thawSession(thisSession);

    expect(await prisma.handoutReceipt.count()).toBe(0);
    expect(await repository.findById(record.id)).toEqual(record);
  });

  it("reads an afternoon back with every receipt beside the hand-out it describes", async () => {
    const [first, second] = [await insertCustomer(50), await insertCustomer(52)];
    const records = [
      await repository.create(handOut(first)),
      await repository.create(handOut(second)),
    ];
    const captured = receipt({ lastName: "Aalto" });
    await repository.freezeSession(thisSession, [
      { recordId: records[0].id, receipt: captured },
      { recordId: records[1].id, receipt: receipt() },
    ]);

    const frozen = await repository.listFrozen(thisSession);

    expect(frozen).toHaveLength(2);
    expect(frozen).toContainEqual({ recordId: records[0].id, receipt: captured });
  });

  it("reads back nothing for an afternoon that was never frozen, and nothing of another's", async () => {
    const [served, elsewhere] = [await insertCustomer(50), await insertCustomer(54)];
    await repository.create(handOut(served));
    const other = await repository.create(handOut(elsewhere, { sessionId: nextSession }));
    await repository.freezeSession(nextSession, [{ recordId: other.id, receipt: receipt() }]);

    // The two empties a caller has to tell apart — a session still running and one ended before the
    // capture existed — look the same here, and the reader tells them apart (US-37.2).
    expect(await repository.listFrozen(thisSession)).toEqual([]);
  });

  it("refuses to remove a hand-out its receipt still points at, and allows it once thawed", async () => {
    // Why the thaw exists at all: a reopened session must stay correctable (US-34, FR-14), and the
    // database — not the use case — is what would otherwise refuse the correction.
    const customerId = await insertCustomer(50);
    const record = await repository.create(handOut(customerId));
    await repository.freezeSession(thisSession, [{ recordId: record.id, receipt: receipt() }]);

    await expect(repository.remove(record.id)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
    );

    await repository.thawSession(thisSession);
    await repository.remove(record.id);
    expect(await repository.findById(record.id)).toBeNull();
  });
});
