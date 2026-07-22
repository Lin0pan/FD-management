/**
 * Integration tests for the SQLite audit-log adapter.
 *
 * Thin and test-after, per the testing approach (CLAUDE.md): these prove the mapping — in
 * particular that the field list survives the round trip through SQLite, which has no array type.
 * Each run migrates a throwaway database file that is deleted afterwards.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PrismaAuditLog } from "./audit-log";

let directory: string;
let prisma: PrismaClient;
let log: PrismaAuditLog;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-audit-"));
  const url = `file:${join(directory, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasourceUrl: url });
  log = new PrismaAuditLog(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.auditEntry.deleteMany();
});

it("stores what changed, when and why", async () => {
  await log.append({
    what: "settings.updated",
    changedFields: ["quotaN", "pricePerChild"],
    when: new Date("2026-07-22T09:30:00.000Z"),
    why: "Preisanpassung zum Halbjahr",
  });

  const [stored] = await prisma.auditEntry.findMany();
  expect(stored.what).toBe("settings.updated");
  expect(stored.changedFields).toBe("quotaN,pricePerChild");
  expect(stored.when).toEqual(new Date("2026-07-22T09:30:00.000Z"));
  expect(stored.why).toBe("Preisanpassung zum Halbjahr");
});

it("keeps every entry — the log is append-only, so a second change does not replace the first", async () => {
  const entry = {
    what: "settings.updated",
    changedFields: ["quotaN"],
    when: new Date("2026-07-22T09:30:00.000Z"),
    why: "Erste Änderung",
  };

  await log.append(entry);
  await log.append({ ...entry, why: "Zweite Änderung" });

  expect(await prisma.auditEntry.count()).toBe(2);
});

it("records no actor — the system has no login and must not pretend to know who acted", async () => {
  await log.append({
    what: "settings.updated",
    changedFields: [],
    when: new Date("2026-07-22T09:30:00.000Z"),
    why: "Korrektur",
  });

  const [stored] = await prisma.auditEntry.findMany();
  expect(Object.keys(stored)).toEqual(["id", "what", "changedFields", "when", "why"]);
});
