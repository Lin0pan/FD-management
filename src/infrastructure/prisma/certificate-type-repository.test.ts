/**
 * Integration tests for the SQLite certificate-type adapter — thin and test-after (CLAUDE.md): the
 * mapping and the constraints, not the business rules. Each run migrates a throwaway database file,
 * so nothing touches `data/fd.db`.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaCertificateTypeRepository } from "./certificate-type-repository";
import { migrateThrowawayDatabase } from "./test-support";

let directory: string;
let prisma: PrismaClient;
let repository: PrismaCertificateTypeRepository;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-certificate-types-"));
  const url = `file:${join(directory, "test.db")}`;
  migrateThrowawayDatabase(url);
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaCertificateTypeRepository(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.certificateType.deleteMany();
});

describe("PrismaCertificateTypeRepository", () => {
  it("returns an empty list from an empty table", async () => {
    expect(await repository.list()).toEqual([]);
  });

  it("round-trips a list", async () => {
    await repository.replace(["Jobcenter-Bescheid", "Wohngeldbescheid"]);

    expect(await repository.list()).toEqual(["Jobcenter-Bescheid", "Wohngeldbescheid"]);
  });

  it("replaces a list — the removed row is gone, the kept row is still there", async () => {
    await repository.replace(["Jobcenter-Bescheid", "Wohngeldbescheid"]);

    await repository.replace(["Wohngeldbescheid", "Grundsicherung"]);

    expect(await repository.list()).toEqual(["Wohngeldbescheid", "Grundsicherung"]);
  });
});
