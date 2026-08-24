/**
 * Integration tests for the SQLite settings adapter.
 *
 * Per the testing approach (CLAUDE.md) infrastructure is tested *after* the fact and thinly: these
 * specs prove the mapping and the constraints, not the business rules — those are covered by the
 * pure tests in src/domain and src/application. Each run migrates a throwaway database file which
 * is deleted afterwards, so nothing touches data/fd.db.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSettings, priceFor, type SettingsVersion } from "@/domain/policy/settings";
import { PrismaSettingsRepository } from "./settings-repository";
import { provisionalSettingsVersion, seedSettings } from "./seed";
import { migrateThrowawayDatabase } from "./test-support";

let directory: string;
let prisma: PrismaClient;
let repository: PrismaSettingsRepository;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-settings-"));
  const url = `file:${join(directory, "test.db")}`;
  migrateThrowawayDatabase(url);
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaSettingsRepository(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.settingsVersion.deleteMany();
});

function version(
  recordedAt: string,
  quotaN = 240,
  priceCap: number | null = null,
): SettingsVersion {
  return {
    recordedAt: new Date(recordedAt),
    settings: createSettings({
      quotaN,
      weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
      distributionWeekday: 4,
      pricePerGrownUp: 200,
      pricePerChild: 100,
      priceCap,
    }),
  };
}

describe("PrismaSettingsRepository", () => {
  it("returns a stored version unchanged, prices included", async () => {
    await repository.append(version("2026-01-01T00:00:00.000Z"));

    const [stored, ...rest] = await repository.listVersions();
    expect(rest).toHaveLength(0);
    expect(stored.recordedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(stored.settings.quotaN).toBe(240);
    expect(stored.settings.weekAnchor).toEqual({ isoWeek: "2026-W02", colour: "RED" });
    expect(stored.settings.distributionWeekday).toBe(4);
    expect(priceFor(stored.settings, 2, 3)).toBe(700);
  });

  it("stores prices as whole cents, never a float", async () => {
    await repository.append(version("2026-01-01T00:00:00.000Z"));

    const [row] = await prisma.settingsVersion.findMany();
    expect(Number.isInteger(row.pricePerGrownUpCents)).toBe(true);
    expect(Number.isInteger(row.pricePerChildCents)).toBe(true);
  });

  it("carries a Maximalpreis through the round trip, and an absent one back as null", async () => {
    await repository.append(version("2026-01-01T00:00:00.000Z", 240, 500));
    await repository.append(version("2026-02-01T00:00:00.000Z", 240, null));

    const [capped, uncapped] = await repository.listVersions();
    expect(capped.settings.priceCap).toBe(500);
    // The distinction the nullable column exists for: an absent cap must not come back as `0`,
    // which is a configured cap that makes every distribution free.
    expect(uncapped.settings.priceCap).toBeNull();
    expect(priceFor(capped.settings, 4, 3)).toBe(500);
    expect(priceFor(uncapped.settings, 4, 3)).toBe(1100);
  });

  it("stores a cap of zero as zero and never as an absent cap", async () => {
    await repository.append(version("2026-01-01T00:00:00.000Z", 240, 0));

    const [stored] = await repository.listVersions();
    expect(stored.settings.priceCap).toBe(0);
  });

  it("keeps every appended version rather than replacing the previous one", async () => {
    await repository.append(version("2026-01-01T00:00:00.000Z", 200));
    await repository.append(version("2026-06-01T00:00:00.000Z", 240));

    const quotas = (await repository.listVersions()).map((stored) => stored.settings.quotaN);
    expect(quotas).toEqual([200, 240]);
  });

  it("returns versions in the order they were written, so a same-instant tie resolves", async () => {
    await repository.append(version("2026-01-01T00:00:00.000Z", 200));
    await repository.append(version("2026-01-01T00:00:00.000Z", 210));

    const quotas = (await repository.listVersions()).map((stored) => stored.settings.quotaN);
    expect(quotas).toEqual([200, 210]);
  });

  it("rejects a stored week colour that is not part of the cycle", async () => {
    await prisma.settingsVersion.create({
      data: {
        recordedAt: new Date("2026-03-01T00:00:00.000Z"),
        quotaN: 240,
        weekAnchorIsoWeek: "2026-W02",
        weekAnchorColour: "GREEN",
        distributionWeekday: 4,
        pricePerGrownUpCents: 200,
        pricePerChildCents: 100,
      },
    });

    await expect(repository.listVersions()).rejects.toThrow(/weekAnchor.colour/);
  });

  it("rejects a hand-edited cap that is not a legal amount", async () => {
    await prisma.settingsVersion.create({
      data: {
        recordedAt: new Date("2026-03-01T00:00:00.000Z"),
        quotaN: 240,
        weekAnchorIsoWeek: "2026-W02",
        weekAnchorColour: "RED",
        distributionWeekday: 4,
        pricePerGrownUpCents: 200,
        pricePerChildCents: 100,
        priceCapCents: -1,
      },
    });

    await expect(repository.listVersions()).rejects.toThrow(/priceCap/);
  });
});

describe("seedSettings", () => {
  it("inserts the provisional version into an empty database", async () => {
    expect(await seedSettings(repository)).toBe(true);

    const [seeded] = await repository.listVersions();
    expect(seeded.recordedAt).toEqual(provisionalSettingsVersion().recordedAt);
    expect(seeded.settings.quotaN).toBe(240);
    expect(seeded.settings.weekAnchor).toEqual({ isoWeek: "2026-W02", colour: "RED" });
    expect(seeded.settings.distributionWeekday).toBe(4);
    expect(seeded.settings.priceCap).toBe(500);
    expect(priceFor(seeded.settings, 1, 0)).toBe(200);
    expect(priceFor(seeded.settings, 2, 1)).toBe(500);
  });

  it("seeds DF's Maximalpreis, so a large household is capped out of the box", async () => {
    await seedSettings(repository);

    const [seeded] = await repository.listVersions();
    // Four grown-ups and three children owe 11,00 € per head and pay 5,00 € — the case the whole
    // of US-26 exists for, exercised by seeded data without anyone editing the settings first.
    expect(priceFor(seeded.settings, 4, 3)).toBe(500);
  });

  it("is a no-op the second time, leaving the stored version untouched", async () => {
    await seedSettings(repository);

    expect(await seedSettings(repository)).toBe(false);
    expect(await repository.listVersions()).toHaveLength(1);
  });

  it("does not overwrite settings an operator has already edited", async () => {
    await repository.append(version("2026-05-01T00:00:00.000Z", 180));

    expect(await seedSettings(repository)).toBe(false);
    const [only] = await repository.listVersions();
    expect(only.settings.quotaN).toBe(180);
  });
});
