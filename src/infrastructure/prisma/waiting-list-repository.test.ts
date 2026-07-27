/**
 * Integration tests for the SQLite waiting-list adapter (US-12.3).
 *
 * Thin and test-after, per the testing approach (CLAUDE.md): what is worth proving here is what the
 * pure layers cannot. Three things — that the arrival order the domain rule computes survives a
 * round trip through the database, including the same-day tie the ascending `id` breaks; that a
 * removal *stamps* the row instead of deleting it, so the queue's history stays readable (FR-7); and
 * that an entry occupies no customer number, because nothing in `src/domain` or `src/application`
 * can state a fact about a table it never touches.
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
import type { NewWaitingListEntry } from "@/application/ports";
import { inArrivalOrder } from "@/domain/customer/waitingList";
import { PrismaWaitingListRepository } from "./waiting-list-repository";

faker.seed(20260727);

/** Two applications typed into the same morning — the tie the surrogate id has to break. */
const MORNING = new Date("2026-03-02T08:15:00.000Z");
const LATER_THE_SAME_DAY = new Date("2026-03-02T11:40:00.000Z");
const NEXT_WEEK = new Date("2026-03-09T09:00:00.000Z");
const VALID_UNTIL = new Date("2026-09-30T00:00:00.000Z");

let directory: string;
let prisma: PrismaClient;
let repository: PrismaWaitingListRepository;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-waiting-list-"));
  const url = `file:${join(directory, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaWaitingListRepository(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  // The waiting list hangs off nothing — no relation to `Customer`, so no "children first".
  await prisma.waitingListEntry.deleteMany();
});

function application(addedOn: Date, contactNote = faker.phone.number()): NewWaitingListEntry {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    birthDate: new Date("1984-06-11T00:00:00.000Z"),
    address: {
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
    },
    contactNote,
    certificate: { type: "Jobcenter-Bescheid", validUntil: VALID_UNTIL },
    addedOn,
  };
}

describe("PrismaWaitingListRepository.add", () => {
  it("stores an application whole — the nested address and certificate come back as they went in", async () => {
    const applicant = application(MORNING);

    const stored = await repository.add(applicant);

    expect(stored).toEqual({ ...applicant, id: stored.id });
    expect(await repository.findWaiting(stored.id)).toEqual(stored);
  });

  it("reads an applicant who left no contact note back as an empty note, not as null", async () => {
    const stored = await repository.add(application(MORNING, ""));

    expect(stored.contactNote).toBe("");
    const row = await prisma.waitingListEntry.findUniqueOrThrow({ where: { id: stored.id } });
    expect(row.contactNote).toBeNull();
  });

  it("numbers entries as they are written, so an id is the order they were typed in", async () => {
    const first = await repository.add(application(MORNING));
    const second = await repository.add(application(LATER_THE_SAME_DAY));

    expect(second.id).toBeGreaterThan(first.id);
  });

  it("puts an applicant on no customer number — the list is exactly the people without one", async () => {
    await repository.add(application(MORNING));

    expect(await prisma.customer.count()).toBe(0);
  });
});

describe("PrismaWaitingListRepository.listWaiting", () => {
  it("hands the queue back in arrival order, earliest first", async () => {
    const late = await repository.add(application(NEXT_WEEK));
    const early = await repository.add(application(MORNING));

    expect((await repository.listWaiting()).map((entry) => entry.id)).toEqual([early.id, late.id]);
  });

  it("keeps two applicants added the same day in the order they were typed in", async () => {
    const first = await repository.add(application(MORNING));
    const second = await repository.add(application(MORNING));

    // The domain rule is the authority on the order, so it is what the stored rows are put through:
    // the tie-break must survive persistence, or the same morning's applicants swap places between
    // two page loads.
    const queue = inArrivalOrder(await repository.listWaiting());
    expect(queue.map((entry) => entry.id)).toEqual([first.id, second.id]);
  });

  it("leaves a removed applicant out of the list", async () => {
    const withdrawn = await repository.add(application(MORNING));
    const waiting = await repository.add(application(NEXT_WEEK));

    await repository.remove(withdrawn.id, "Umgezogen", LATER_THE_SAME_DAY);

    expect((await repository.listWaiting()).map((entry) => entry.id)).toEqual([waiting.id]);
  });

  it("is empty when nobody is waiting", async () => {
    expect(await repository.listWaiting()).toEqual([]);
  });
});

describe("PrismaWaitingListRepository.remove", () => {
  it("keeps the row with its reason and date rather than deleting it", async () => {
    const entry = await repository.add(application(MORNING));

    await repository.remove(entry.id, "Hat sich anderweitig versorgt", LATER_THE_SAME_DAY);

    const row = await prisma.waitingListEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.removedOn).toEqual(LATER_THE_SAME_DAY);
    expect(row.removalReason).toBe("Hat sich anderweitig versorgt");
    expect(row.addedOn).toEqual(MORNING);
  });

  it("does not overwrite the first reason when the same entry is removed twice", async () => {
    const entry = await repository.add(application(MORNING));
    await repository.remove(entry.id, "Zurückgezogen", LATER_THE_SAME_DAY);

    await repository.remove(entry.id, "Registriert", NEXT_WEEK);

    const row = await prisma.waitingListEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.removalReason).toBe("Zurückgezogen");
    expect(row.removedOn).toEqual(LATER_THE_SAME_DAY);
  });

  it("passes over an id nobody is waiting under instead of failing", async () => {
    await expect(repository.remove(4711, "Zurückgezogen", NEXT_WEEK)).resolves.toBeUndefined();
  });
});

describe("PrismaWaitingListRepository.findWaiting", () => {
  it("answers null for an applicant who has already come off the list", async () => {
    const entry = await repository.add(application(MORNING));
    await repository.remove(entry.id, "Registriert", LATER_THE_SAME_DAY);

    expect(await repository.findWaiting(entry.id)).toBeNull();
  });

  it("answers null for an id that was never on the list", async () => {
    expect(await repository.findWaiting(4711)).toBeNull();
  });
});
