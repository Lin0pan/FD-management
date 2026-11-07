/**
 * Integration tests for the file-backed backup adapter — test-after, against throwaway SQLite files
 * (CLAUDE.md). What the fakes cannot state: that a snapshot is a database the software can open
 * again, that the checksums recomputed here are the ones Prisma recorded, and that the swap leaves
 * the restored register in place of the old one with a copy of the old one kept.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { compareMigrationHistories } from "@/domain/backup/backup";
import { BackupMigrationFailed } from "@/domain/errors";
import { migrateThrowawayDatabase } from "../prisma/test-support";
import { FileDatabaseBackups, databaseFileFromUrl } from "./database-backups";

const MIGRATIONS = resolve("prisma/migrations");
const WHEN = new Date("2026-11-03T13:05:00.000Z");

let directory: string;
let databaseFile: string;
let prisma: PrismaClient;
let backups: FileDatabaseBackups;

/** A marker row, so a file can be told apart by what it holds. */
async function mark(client: PrismaClient, what: string): Promise<void> {
  await client.auditEntry.create({ data: { what, changedFields: "", when: WHEN, why: "" } });
}

async function marksIn(file: string): Promise<string[]> {
  const client = new PrismaClient({ datasourceUrl: `file:${file}` });
  try {
    const rows = await client.auditEntry.findMany({ orderBy: { id: "asc" } });
    return rows.map((row) => row.what);
  } finally {
    await client.$disconnect();
  }
}

function adapter(client: PrismaClient): FileDatabaseBackups {
  return new FileDatabaseBackups({
    prisma: client,
    databaseFile,
    migrationsDirectory: MIGRATIONS,
    safetyCopyDirectory: join(directory, "sicherheitskopien"),
  });
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-backup-"));
  databaseFile = join(directory, "fd.db");
  migrateThrowawayDatabase(`file:${databaseFile}`);
  prisma = new PrismaClient({ datasourceUrl: `file:${databaseFile}` });
  backups = adapter(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.auditEntry.deleteMany();
  await backups.discardCandidate();
});

describe("snapshot", () => {
  it("is an SQLite file holding what the register held", async () => {
    await mark(prisma, "before.snapshot");

    const content = await backups.snapshot();

    const copy = join(directory, "copy.db");
    writeFileSync(copy, content);
    expect(await marksIn(copy)).toEqual(["before.snapshot"]);
  });

  it("leaves no temporary file behind", async () => {
    await backups.snapshot();

    expect(readdirSync(directory).filter((name) => name.includes("snapshot"))).toEqual([]);
  });
});

describe("lastCreatedAt", () => {
  it("is the newest backup.created entry, and null without one", async () => {
    expect(await backups.lastCreatedAt()).toBeNull();

    await prisma.auditEntry.create({
      data: { what: "backup.created", changedFields: "", when: WHEN, why: "" },
    });
    await mark(prisma, "something.else");

    expect(await backups.lastCreatedAt()).toEqual(WHEN);
  });
});

describe("inspectCandidate", () => {
  it("reads a snapshot of this software as the very version it ships", async () => {
    await backups.receiveCandidate(await backups.snapshot());

    const inspection = await backups.inspectCandidate();

    expect(inspection?.intact).toBe(true);
    expect(
      compareMigrationHistories(inspection?.migrations ?? [], await backups.softwareMigrations()),
    ).toEqual({ kind: "CURRENT" });
  });

  it("is null for a file that is not SQLite", async () => {
    await backups.receiveCandidate(new TextEncoder().encode("Kundenliste;Name;Adresse\n"));

    expect(await backups.inspectCandidate()).toBeNull();
  });

  it("finds no history in an SQLite file without a migration table", async () => {
    await backups.receiveCandidate(await backups.snapshot());
    const candidate = `${databaseFile}.restore-candidate`;
    const client = new PrismaClient({ datasourceUrl: `file:${candidate}` });
    await client.$executeRawUnsafe("DROP TABLE _prisma_migrations");
    await client.$disconnect();

    expect(await backups.inspectCandidate()).toEqual({ intact: true, migrations: [] });
  });

  it("finds a file damaged past its header not intact", async () => {
    const content = await backups.snapshot();
    const damaged = new Uint8Array(content);
    damaged.fill(0xab, 100);
    await backups.receiveCandidate(damaged);

    expect((await backups.inspectCandidate())?.intact).toBe(false);
  });
});

describe("migrateCandidate", () => {
  it("brings an empty database up to this version", async () => {
    await backups.receiveCandidate(new Uint8Array());

    await backups.migrateCandidate();

    // An empty file has no header until a migration writes one.
    const inspection = await backups.inspectCandidate();
    expect(
      compareMigrationHistories(inspection?.migrations ?? [], await backups.softwareMigrations()),
    ).toEqual({ kind: "CURRENT" });
  }, 60_000);

  it("reports a failed migration as a domain error", async () => {
    const failing = new FileDatabaseBackups({
      prisma,
      databaseFile,
      migrationsDirectory: MIGRATIONS,
      safetyCopyDirectory: join(directory, "sicherheitskopien"),
      migrate: () => Promise.reject(new Error("migration exploded")),
    });
    await failing.receiveCandidate(new Uint8Array());

    await expect(failing.migrateCandidate()).rejects.toThrow(BackupMigrationFailed);
  });
});

describe("staging and the start-up swap", () => {
  it("swaps the staged restore in and keeps a copy of the register it replaced", async () => {
    await mark(prisma, "in.the.backup");
    await backups.receiveCandidate(await backups.snapshot());
    await mark(prisma, "after.the.backup");

    await backups.stageCandidate();
    expect(await backups.hasStagedRestore()).toBe(true);
    expect(existsSync(`${databaseFile}.restore-candidate`)).toBe(false);

    // At start-up nothing has opened the register yet.
    await prisma.$disconnect();
    const startup = adapter(new PrismaClient({ datasourceUrl: `file:${databaseFile}` }));
    await startup.preserveCurrent("safety.db");
    await startup.swapInStaged();

    expect(await startup.hasStagedRestore()).toBe(false);
    expect(await marksIn(databaseFile)).toEqual(["in.the.backup"]);
    expect(await marksIn(join(directory, "sicherheitskopien", "safety.db"))).toEqual([
      "in.the.backup",
      "after.the.backup",
    ]);
    expect(readFileSync(databaseFile).subarray(0, 15).toString()).toBe("SQLite format 3");
  });
});

describe("databaseFileFromUrl", () => {
  it("reads a relative URL against prisma/, as the CLI does", () => {
    expect(databaseFileFromUrl("file:../data/fd.db", "/srv/fd")).toBe("/srv/fd/data/fd.db");
  });

  it("keeps an absolute URL and drops its query", () => {
    expect(databaseFileFromUrl("file:/tmp/x.db?connection_limit=1", "/srv/fd")).toBe("/tmp/x.db");
  });
});
