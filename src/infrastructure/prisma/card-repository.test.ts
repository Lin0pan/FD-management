/**
 * Integration tests for the SQLite card adapter.
 *
 * Thin and test-after, per the testing approach (CLAUDE.md): what is worth proving here is the pair
 * of facts the pure layers cannot state — that `(customerId, index)` is unique, so two cards can
 * never share the highest index, and that `(customerNumber, index)` is unique too, so a card number
 * is never handed out twice however many households a slot has been through (US-25). The rules about
 * which index falls due are covered in src/application.
 *
 * Each run migrates a throwaway database file which is deleted afterwards, so nothing touches
 * data/fd.db. Synthetic data only (Faker), seeded so a failing run is reproducible.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { formatCardNumber } from "@/domain/card/cardNumber";
import { foldName } from "@/domain/customer/nameSearch";
import { composition } from "@/domain/customer/householdComposition";
import { CardIndexTaken, CardNumberTaken, InvalidCustomerRecord } from "@/domain/errors";
import { PrismaCardRepository } from "./card-repository";
import { clearRegister, migrateThrowawayDatabase } from "./test-support";

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
  migrateThrowawayDatabase(url);
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
      groupAtIssue: "RED",
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
      groupAtIssue: "RED",
    });

    const row = await prisma.card.findFirstOrThrow({ where: { customerId } });
    expect(row.grownUpsAtIssue).toBe(3);
    expect(row.childrenAtIssue).toBe(2);
  });

  it("reads a card back with the slot it was printed under", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    // The household is moved to another slot, as US-30 moves one. The card in their pocket still
    // says 50k1, and every way of reading it back has to say so too — labelling it under 66 would
    // name a card that was never printed and would make 50k1 look free to hand out again.
    await prisma.customer.update({ where: { id: customerId }, data: { customerNumber: 66 } });

    expect((await repository.currentCard(customerId))?.customerNumber).toBe(50);
    expect((await repository.listCards(customerId)).map((card) => card.customerNumber)).toEqual([
      50,
    ]);
  });

  it("keeps the group the card printed after the household has been moved to the other one", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: { grownUps: 1, children: 0 },
      groupAtIssue: "RED",
    });

    await prisma.customer.update({ where: { id: customerId }, data: { group: "BLUE" } });

    // The same difference the counts prove, in the other direction: the card is out in the world
    // naming a week the household no longer collects in (US-16.4).
    expect((await repository.currentCard(customerId))?.groupAtIssue).toBe("RED");
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
      groupAtIssue: "RED",
    });

    expect(card).toEqual({
      customerNumber: 50,
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
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
      groupAtIssue: "RED",
    });

    await repository.issue(customerId, {
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
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
      groupAtIssue: "RED",
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
      groupAtIssue: "RED",
    });

    await expect(
      repository.issue(customerId, {
        index: 1,
        issuedAt: LATER,
        reason: "LOST",
        countsAtIssue: PRINTED,
        groupAtIssue: "RED",
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
        groupAtIssue: "RED",
      }),
      repository.issue(customerId, {
        index: 1,
        issuedAt: TODAY,
        reason: "LOST",
        countsAtIssue: PRINTED,
        groupAtIssue: "RED",
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(CardIndexTaken);
    expect(await prisma.card.count({ where: { customerId } })).toBe(1);
  });
});

describe("the card number across customers", () => {
  it("refuses a card number an archived household on the same slot already took", async () => {
    const first = await insertCustomer(50, "ARCHIVED");
    const second = await insertCustomer(50);

    await repository.issue(first, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    // 50k1 is printed on a card the departed household walked away with. Handing it out again is
    // what US-25 makes impossible, and the database is the final authority on it.
    await expect(
      repository.issue(second, {
        index: 1,
        issuedAt: LATER,
        reason: "FIRST_ISSUE",
        countsAtIssue: PRINTED,
        groupAtIssue: "RED",
      }),
    ).rejects.toBeInstanceOf(CardNumberTaken);
    expect(await prisma.card.count({ where: { customerNumber: 50 } })).toBe(1);
  });

  it("names the card number it refused, not the customer id, so the screen can say 50k1", async () => {
    const first = await insertCustomer(50, "ARCHIVED");
    const second = await insertCustomer(50);
    await repository.issue(first, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    const refused = await repository
      .issue(second, {
        index: 1,
        issuedAt: LATER,
        reason: "FIRST_ISSUE",
        countsAtIssue: PRINTED,
        groupAtIssue: "RED",
      })
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(CardNumberTaken);
    expect(formatCardNumber((refused as CardNumberTaken).customerNumber, 1)).toBe("50k1");
  });

  it("tells a spent card number apart from a lost race on one record", async () => {
    // Both constraints cover a second card on an index the customer already holds, so the fault is
    // told apart by the record and not by whichever index the database happened to name. A caller
    // answers the two differently: one is settled by re-reading the run, the other by nothing.
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    const refused = await repository
      .issue(customerId, {
        index: 1,
        issuedAt: LATER,
        reason: "LOST",
        countsAtIssue: PRINTED,
        groupAtIssue: "RED",
      })
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(CardIndexTaken);
    expect(refused).not.toBeInstanceOf(CardNumberTaken);
  });

  it("lets the household that filled the slot take the next number on its run", async () => {
    const first = await insertCustomer(50, "ARCHIVED");
    const second = await insertCustomer(50);

    await repository.issue(first, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });
    await repository.issue(second, {
      index: 2,
      issuedAt: LATER,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    const [firstCard, secondCard] = await Promise.all([
      repository.currentCard(first),
      repository.currentCard(second),
    ]);
    expect(formatCardNumber(50, firstCard?.index ?? 0)).toBe("50k1");
    expect(formatCardNumber(50, secondCard?.index ?? 0)).toBe("50k2");
  });

  it("writes the slot on the card row itself, read off the customer rather than passed in", async () => {
    const customerId = await insertCustomer(77);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    const row = await prisma.card.findFirstOrThrow({ where: { customerId } });
    expect(row.customerNumber).toBe(77);
  });
});

describe("PrismaCardRepository.highestIndexForNumber", () => {
  it("answers 0 for a slot that has never held a card", async () => {
    await insertCustomer(50);

    expect(await repository.highestIndexForNumber(50)).toBe(0);
  });

  it("answers 0 for a customer number nobody has ever been registered on", async () => {
    expect(await repository.highestIndexForNumber(404)).toBe(0);
  });

  it("counts the cards of an archived holder, because the card they left with still exists", async () => {
    const departed = await insertCustomer(50, "ARCHIVED");
    await repository.issue(departed, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });
    await repository.issue(departed, {
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    // Nothing about status is consulted: the household is gone and 50k2 is still out in the world.
    expect(await repository.highestIndexForNumber(50)).toBe(2);
  });

  it("reads the whole slot's run, not the holder's — the number carries on across households", async () => {
    const departed = await insertCustomer(50, "ARCHIVED");
    const holder = await insertCustomer(50);
    await repository.issue(departed, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });
    await repository.issue(holder, {
      index: 2,
      issuedAt: LATER,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    expect(await repository.highestIndexForNumber(50)).toBe(2);
    // And it is the slot that is asked, so the neighbouring number is untouched by any of it.
    expect(await repository.highestIndexForNumber(51)).toBe(0);
  });

  it("answers with the highest index even where the run has a gap", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });
    await repository.issue(customerId, {
      index: 4,
      issuedAt: LATER,
      reason: "OTHER",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    expect(await repository.highestIndexForNumber(50)).toBe(4);
  });
});

describe("PrismaCardRepository.highestIndexByNumber", () => {
  it("reports the highest index on every slot in one query", async () => {
    const departed = await insertCustomer(50, "ARCHIVED");
    const holder = await insertCustomer(51);
    await repository.issue(departed, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });
    await repository.issue(departed, {
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });
    await repository.issue(holder, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    // The plural of `highestIndexForNumber`, and it answers the same for each slot: the archived
    // holder's run counts, because 50k2 is still out in the world (US-25).
    expect(await repository.highestIndexByNumber()).toEqual(
      new Map([
        [50, 2],
        [51, 1],
      ]),
    );
  });

  it("reports nothing for a slot that has never had a card", async () => {
    await insertCustomer(50);

    // Registered, but never handed a card — and a slot nobody has been registered on at all is
    // the same answer. Absent rather than 0: the caller reads `?? 0`, which is what makes a fresh
    // slot's first card `k1` with no case of its own.
    const highest = await repository.highestIndexByNumber();

    expect(highest.has(50)).toBe(false);
    expect(highest.has(404)).toBe(false);
    expect(highest.size).toBe(0);
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
      groupAtIssue: "RED",
    });
    await repository.issue(customerId, {
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    expect(await repository.currentCard(customerId)).toEqual({
      customerNumber: 50,
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });
  });

  it("reports the highest index even where the run has a gap", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });
    await repository.issue(customerId, {
      index: 4,
      issuedAt: LATER,
      reason: "OTHER",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    expect((await repository.currentCard(customerId))?.index).toBe(4);
  });

  it("refuses a hand-edited reason rather than quietly reading it as OTHER", async () => {
    const customerId = await insertCustomer(50);
    await prisma.card.create({
      data: {
        customerId,
        customerNumber: 50,
        index: 1,
        issuedAt: TODAY,
        reason: "VERLOREN",
        grownUpsAtIssue: 1,
        childrenAtIssue: 1,
        groupAtIssue: "RED",
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
      groupAtIssue: "RED",
    });
    await repository.issue(customerId, {
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
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
      groupAtIssue: "RED",
    });
    await repository.issue(other, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });
    await repository.issue(other, {
      index: 2,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
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
    const { customerNumber } = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { customerNumber: true },
    });
    for (const [position, reason] of reasons.entries()) {
      await prisma.card.create({
        data: {
          customerId,
          customerNumber,
          index: position + 1,
          issuedAt: TODAY,
          reason,
          grownUpsAtIssue: 1,
          childrenAtIssue: 1,
          groupAtIssue: "RED",
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

  it("counts a card issued for a number change as issued, never as a loss", async () => {
    const customerId = await insertCustomer(50);
    await issueRun(customerId, "FIRST_ISSUE", "CUSTOMER_NUMBER_CHANGED");

    // `ReissueReason` takes the fifth word in for free, so the count is the thing that has to say
    // no: whether a household loses cards unusually often is a judgement staff make, and a move
    // they asked for is not evidence of it (US-09.2).
    expect(await repository.issueCounts(customerId)).toEqual({
      cardsIssued: 2,
      reissuesForLoss: 0,
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

  it("counts the rows the household holds rather than the index they have reached", async () => {
    const customerId = await insertCustomer(50);
    await repository.issue(customerId, {
      index: 1,
      issuedAt: TODAY,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });
    await repository.issue(customerId, {
      index: 4,
      issuedAt: LATER,
      reason: "LOST",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    expect(await repository.issueCounts(customerId)).toEqual({
      cardsIssued: 2,
      reissuesForLoss: 1,
    });
  });

  it("counts a returning household's first card as one, whatever index the slot had reached", async () => {
    const departed = await insertCustomer(66, "ARCHIVED");
    const returning = await insertCustomer(66);
    await issueRun(departed, "FIRST_ISSUE", "LOST", "LOST");
    await repository.issue(returning, {
      index: 4,
      issuedAt: LATER,
      reason: "FIRST_ISSUE",
      countsAtIssue: PRINTED,
      groupAtIssue: "RED",
    });

    // 66k4 is the household's *first* card. Reading the index as a count would put three losses
    // they never had in front of staff (US-09.2).
    expect(await repository.issueCounts(returning)).toEqual({
      cardsIssued: 1,
      reissuesForLoss: 0,
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
