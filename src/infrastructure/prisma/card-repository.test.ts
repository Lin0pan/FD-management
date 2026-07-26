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
import { composition } from "@/domain/customer/householdComposition";
import { CardIndexTaken, InvalidCustomerRecord } from "@/domain/errors";
import { PrismaCardRepository } from "./card-repository";
import { clearRegister } from "./test-support";

faker.seed(20260723);

/**
 * The counts printed on a card in these tests. Which numbers they are does not matter here — the
 * rules about when they go stale live in src/application — only that the adapter stores them and
 * reads them back unchanged.
 */
const PRINTED = { grownUps: 1, children: 1 };

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
  await clearRegister(prisma);
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

/** Put household members on a customer, so a stored card can be compared with a real household. */
async function insertMembers(customerId: number, ...birthDates: string[]): Promise<void> {
  await prisma.householdMember.createMany({
    data: birthDates.map((birthDate) => ({
      customerId,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      birthDate: new Date(`${birthDate}T00:00:00.000Z`),
    })),
  });
}

describe("the counts printed on a card", () => {
  it("keeps what the card printed while the household moves on past a 13th birthday", async () => {
    const customerId = await insertCustomer(50);
    // A grown-up and a member who turns 13 on 1 August 2026 — a child on the day the card was
    // printed, a grown-up a week later, with nothing written in between.
    await insertMembers(customerId, "1990-01-01", "2013-08-01");
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: { grownUps: 1, children: 1 },
    });

    const card = await repository.currentCard(customerId);
    const members = await prisma.householdMember.findMany({ where: { customerId } });
    const today = composition(members, new Date("2026-08-08T09:00:00.000Z"));

    expect(card?.countsAtIssue).toEqual({ grownUps: 1, children: 1 });
    expect(today).toEqual({ grownUps: 2, children: 0 });
    // The point of storing the snapshot: the difference is visible from the database alone, which is
    // what the cards-due-for-reissue list reads (US-13.2).
    expect(card?.countsAtIssue).not.toEqual(today);
  });

  it("stores the two counts as their own columns, so a query can compare them", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: { grownUps: 3, children: 2 },
    });

    const row = await prisma.card.findFirstOrThrow({ where: { customerId } });
    expect(row.grownUpsAtIssue).toBe(3);
    expect(row.childrenAtIssue).toBe(2);
  });
});

describe("PrismaCardRepository.issue", () => {
  it("stores the index, the issue date and the reason the card was handed over", async () => {
    const customerId = await insertCustomer(50);

    const card = await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });

    expect(card).toEqual({
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });
    const rows = await prisma.card.findMany({ where: { customerId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("FIRST_ISSUE");
  });

  it("keeps the superseded card on file, so an old card is recognisable at the counter", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });

    await repository.issue(customerId, {
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
    });

    expect(await prisma.card.count({ where: { customerId } })).toBe(2);
  });

  it("stores no valid flag — validity is being the highest index", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });

    const [row] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "Card" WHERE "customerId" = ${customerId}`,
    );
    expect(Object.keys(row)).not.toContain("valid");
  });

  it("refuses a second card on an index another issue took, as CardIndexTaken", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });

    await expect(
      repository.issue(customerId, {
        index: 1,
        issuedAt: LATER,
        reason: "LOST",
        countsAtIssue: PRINTED,
      }),
    ).rejects.toBeInstanceOf(CardIndexTaken);
  });

  it("lets neither of two simultaneous issues of the same index leave two current cards", async () => {
    const customerId = await insertCustomer(50);

    const results = await Promise.allSettled([
      repository.issue(customerId, {
        index: 1,
        issuedAt: TODAY,
        reason: "FIRST_ISSUE",
        countsAtIssue: PRINTED,
      }),
      repository.issue(customerId, {
        index: 1,
        issuedAt: TODAY,
        reason: "LOST",
        countsAtIssue: PRINTED,
      }),
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

    await repository.issue(first, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });
    await repository.issue(second, {
      index: 1,
      issuedAt: LATER,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });

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
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });
    await repository.issue(customerId, {
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
    });

    expect(await repository.currentCard(customerId)).toEqual({
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
    });
  });

  it("reports the highest index even where the run has a gap", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });
    await repository.issue(customerId, {
      index: 4,
      issuedAt: LATER,
      reason: "OTHER",
      countsAtIssue: PRINTED,
    });

    expect((await repository.currentCard(customerId))?.index).toBe(4);
  });

  it("refuses a hand-edited reason rather than quietly reading it as OTHER", async () => {
    const customerId = await insertCustomer(50);
    await prisma.card.create({
      data: {
        customerId,
        index: 1,
        issuedAt: TODAY,
        reason: "VERLOREN",
        grownUpsAtIssue: 1,
        childrenAtIssue: 1,
      },
    });

    await expect(repository.currentCard(customerId)).rejects.toBeInstanceOf(InvalidCustomerRecord);
  });
});

describe("PrismaCardRepository.listCards", () => {
  it("hands back the whole run highest index first, so the head is the current card", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });
    await repository.issue(customerId, {
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
    });

    const cards = await repository.listCards(customerId);

    expect(cards.map((card) => card.index)).toEqual([2, 1]);
    expect(cards[0].reason).toBe("LOST");
  });

  it("lists only the cards of the customer asked about", async () => {
    const one = await insertCustomer(50);
    const other = await insertCustomer(51);
    await repository.issue(one, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });
    await repository.issue(other, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });
    await repository.issue(other, {
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
    });

    expect(await repository.listCards(one)).toHaveLength(1);
  });

  it("answers with nothing for a customer id nobody holds", async () => {
    expect(await repository.listCards(404)).toEqual([]);
  });
});

describe("PrismaCardRepository.issueCounts", () => {
  /** Hand a customer a run of cards, one per reason given, indexed from 1 upwards. */
  async function issueRun(customerId: number, ...reasons: string[]): Promise<void> {
    for (const [position, reason] of reasons.entries()) {
      await prisma.card.create({
        data: {
          customerId,
          index: position + 1,
          issuedAt: TODAY,
          reason,
          grownUpsAtIssue: 1,
          childrenAtIssue: 1,
        },
      });
    }
  }

  it("counts a mixed history as four cards issued of which two were losses", async () => {
    const customerId = await insertCustomer(50);
    await issueRun(customerId, "FIRST_ISSUE", "LOST", "STALE_COUNTS", "LOST");

    expect(await repository.issueCounts(customerId)).toEqual({
      cardsIssued: 4,
      reissuesForLoss: 2,
    });
  });

  it("counts a household on its first card as one issued and no loss", async () => {
    const customerId = await insertCustomer(50);
    await issueRun(customerId, "FIRST_ISSUE");

    expect(await repository.issueCounts(customerId)).toEqual({
      cardsIssued: 1,
      reissuesForLoss: 0,
    });
  });

  it("counts nothing for a customer who holds no card yet", async () => {
    expect(await repository.issueCounts(await insertCustomer(50))).toEqual({
      cardsIssued: 0,
      reissuesForLoss: 0,
    });
  });

  it("reports the current index rather than the number of rows where the run has a gap", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
    });
    await repository.issue(customerId, {
      index: 4,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
    });

    expect(await repository.issueCounts(customerId)).toEqual({
      cardsIssued: 4,
      reissuesForLoss: 1,
    });
  });

  it("counts only the cards of the customer asked about", async () => {
    const one = await insertCustomer(50);
    const other = await insertCustomer(51);
    await issueRun(one, "FIRST_ISSUE");
    await issueRun(other, "FIRST_ISSUE", "LOST");

    expect(await repository.issueCounts(one)).toEqual({ cardsIssued: 1, reissuesForLoss: 0 });
  });

  it("refuses a hand-edited reason rather than dropping it from the loss count", async () => {
    const customerId = await insertCustomer(50);
    await issueRun(customerId, "VERLOREN");

    await expect(repository.issueCounts(customerId)).rejects.toBeInstanceOf(InvalidCustomerRecord);
  });
});
