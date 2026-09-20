/**
 * Integration tests for the SQLite distribution-session adapter — thin and test-after (CLAUDE.md).
 * What the pure layers cannot state: that the hand-written `one_running_session` index refuses a
 * second running session however the use-case guard is raced past (US-34, FR-5), that a discarded
 * session is stamped rather than deleted and disappears from every read, and that a session's
 * hand-outs hold it in place — a served afternoon cannot be removed.
 *
 * Each run migrates a throwaway database file, so nothing touches `data/fd.db`.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { foldName } from "@/domain/customer/nameSearch";
import { createSessionGroups } from "@/domain/distribution/session";
import { DistributionSessionAlreadyRunning } from "@/domain/errors";
import type { Cents } from "@/domain/money";
import { PrismaDistributionRecordRepository } from "./distribution-record-repository";
import { PrismaDistributionSessionRepository } from "./distribution-session-repository";
import { clearRegister, migrateThrowawayDatabase } from "./test-support";

faker.seed(20260919);

const STARTED = new Date("2026-07-23T13:00:00.000Z");
const ENDED = new Date("2026-07-23T17:00:00.000Z");
const NEXT_WEEK = new Date("2026-07-30T13:00:00.000Z");

const RED = createSessionGroups(["RED"]);
const BOTH = createSessionGroups(["RED", "BLUE"]);

let directory: string;
let prisma: PrismaClient;
let repository: PrismaDistributionSessionRepository;
let records: PrismaDistributionRecordRepository;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-sessions-"));
  const url = `file:${join(directory, "test.db")}`;
  migrateThrowawayDatabase(url);
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaDistributionSessionRepository(prisma);
  records = new PrismaDistributionRecordRepository(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await clearRegister(prisma);
});

/** A customer to be served, written straight through Prisma — the sessions are what is tested. */
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

describe("PrismaDistributionSessionRepository.start", () => {
  it("round-trips a session: when it started, that it runs, and which groups it serves", async () => {
    const started = await repository.start(BOTH, STARTED);

    expect(started).toEqual({
      id: expect.any(Number),
      startedAt: STARTED,
      endedAt: null,
      groups: ["RED", "BLUE"],
    });
    expect(await repository.findRunning()).toEqual(started);
  });

  it("refuses a second session while one is running, as DistributionSessionAlreadyRunning", async () => {
    const running = await repository.start(RED, STARTED);

    const error = await repository.start(BOTH, ENDED).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DistributionSessionAlreadyRunning);
    expect((error as DistributionSessionAlreadyRunning).runningId).toBe(running.id);
    expect(await prisma.distributionSession.count()).toBe(1);
  });

  it("lets neither of two simultaneous starts leave two running sessions", async () => {
    const results = await Promise.allSettled([
      repository.start(RED, STARTED),
      repository.start(BOTH, STARTED),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")?.reason).toBeInstanceOf(
      DistributionSessionAlreadyRunning,
    );
    expect(await prisma.distributionSession.count()).toBe(1);
  });

  it("lets the next session start once the last one has ended", async () => {
    const first = await repository.start(RED, STARTED);
    await repository.end(first.id, ENDED);

    const second = await repository.start(BOTH, NEXT_WEEK);

    expect(await repository.findRunning()).toEqual(second);
  });
});

describe("PrismaDistributionSessionRepository.end and reopen", () => {
  it("stamps the end instant, so nothing is running any more", async () => {
    const started = await repository.start(RED, STARTED);

    await repository.end(started.id, ENDED);

    expect(await repository.findRunning()).toBeNull();
    expect(await repository.lastEnded()).toEqual({ ...started, endedAt: ENDED });
  });

  it("answers the session that ended last, not the one before it", async () => {
    const first = await repository.start(RED, STARTED);
    await repository.end(first.id, ENDED);
    const second = await repository.start(BOTH, NEXT_WEEK);
    await repository.end(second.id, NEXT_WEEK);

    expect((await repository.lastEnded())?.id).toBe(second.id);
  });

  it("clears the end instant on a reopening, so the afternoon runs again", async () => {
    const started = await repository.start(RED, STARTED);
    await repository.end(started.id, ENDED);

    await repository.reopen(started.id);

    expect(await repository.findRunning()).toEqual(started);
    expect(await repository.lastEnded()).toBeNull();
  });

  it("refuses to reopen a session while another one is running", async () => {
    const first = await repository.start(RED, STARTED);
    await repository.end(first.id, ENDED);
    const second = await repository.start(BOTH, NEXT_WEEK);

    const error = await repository.reopen(first.id).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DistributionSessionAlreadyRunning);
    expect((error as DistributionSessionAlreadyRunning).runningId).toBe(second.id);
  });
});

describe("PrismaDistributionSessionRepository.listEnded", () => {
  it("hands back the afternoons that took place, most recent first", async () => {
    const first = await repository.start(RED, STARTED);
    await repository.end(first.id, ENDED);
    const second = await repository.start(BOTH, NEXT_WEEK);
    await repository.end(second.id, NEXT_WEEK);

    expect((await repository.listEnded()).map((session) => session.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("leaves out the running session and the discarded one, which no afternoon was", async () => {
    const ended = await repository.start(RED, STARTED);
    await repository.end(ended.id, ENDED);
    const discarded = await repository.start(RED, NEXT_WEEK);
    await repository.discard(discarded.id, NEXT_WEEK);
    await repository.start(BOTH, NEXT_WEEK);

    expect((await repository.listEnded()).map((session) => session.id)).toEqual([ended.id]);
  });
});

describe("PrismaDistributionSessionRepository.discard", () => {
  it("stamps the row rather than deleting it — the register deletes nothing (ADR-010)", async () => {
    const started = await repository.start(RED, STARTED);

    await repository.discard(started.id, ENDED);

    expect(await prisma.distributionSession.count()).toBe(1);
    const row = await prisma.distributionSession.findUniqueOrThrow({ where: { id: started.id } });
    expect(row.discardedAt).toEqual(ENDED);
  });

  it("hides the discarded session from every read, so the domain never sees a third state", async () => {
    const started = await repository.start(RED, STARTED);

    await repository.discard(started.id, ENDED);

    expect(await repository.findRunning()).toBeNull();
    expect(await repository.lastEnded()).toBeNull();
    expect(await repository.findById(started.id)).toBeNull();
  });

  it("lets the next session start, because the discarded one no longer counts as running", async () => {
    const started = await repository.start(RED, STARTED);
    await repository.discard(started.id, ENDED);

    await expect(repository.start(BOTH, NEXT_WEEK)).resolves.toBeDefined();
  });
});

describe("a session and the hand-outs that belong to it", () => {
  it("keeps the hand-outs of one session apart from another's", async () => {
    const customerId = await insertCustomer(50);
    const first = await repository.start(RED, STARTED);
    await records.create(handOut(customerId, first.id, STARTED));
    await repository.end(first.id, ENDED);
    const second = await repository.start(BOTH, NEXT_WEEK);
    await records.create(handOut(customerId, second.id, NEXT_WEEK));

    expect(await records.listForSession(first.id)).toHaveLength(1);
    expect(await records.listForSession(second.id)).toHaveLength(1);
  });

  it("refuses to delete a session that served somebody, rather than cascading its records away", async () => {
    const customerId = await insertCustomer(50);
    const started = await repository.start(RED, STARTED);
    await records.create(handOut(customerId, started.id, STARTED));

    await expect(
      prisma.distributionSession.delete({ where: { id: started.id } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});

/** A hand-out at a flat price — only whose it is and which session it belongs to matter here. */
function handOut(customerId: number, sessionId: number, date: Date) {
  return {
    customerId,
    sessionId,
    date,
    showedUp: true,
    paidCents: 500 as Cents,
    priceCents: 500 as Cents,
  };
}
