/**
 * Integration tests for the SQLite settings adapter.
 *
 * Per the testing approach (CLAUDE.md) infrastructure is tested *after* the fact and thinly: these
 * specs prove the mapping and the constraints, not the business rules — those are covered by the
 * pure tests in src/domain and src/application. Each run migrates a throwaway database file which
 * is deleted afterwards, so nothing touches data/fd.db.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSettings, priceFor, type SettingsVersion } from "@/domain/policy/settings";
import { PrismaSettingsRepository } from "./settings-repository";
import { provisionalSettingsVersion, seedSettings } from "./seed";

let directory: string;
let prisma: PrismaClient;
let repository: PrismaSettingsRepository;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-settings-"));
  const url = `file:${join(directory, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
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

function version(effectiveFrom: string, quotaN = 240): SettingsVersion {
  return {
    effectiveFrom: new Date(effectiveFrom),
    settings: createSettings({
      quotaN,
      portionsPerGrownUp: 2,
      portionsPerChild: 1,
      reminderThreshold: 3,
      weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
      distributionWeekday: 4,
      priceTable: [
        { grownUps: 1, children: 0, cents: 200 },
        { grownUps: 2, children: 3, cents: 700 },
      ],
    }),
  };
}

describe("PrismaSettingsRepository", () => {
  it("returns a stored version unchanged, price table included", async () => {
    await repository.append(version("2026-01-01T00:00:00.000Z"));

    const [stored, ...rest] = await repository.listVersions();
    expect(rest).toHaveLength(0);
    expect(stored.effectiveFrom).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(stored.settings.quotaN).toBe(240);
    expect(stored.settings.weekAnchor).toEqual({ isoWeek: "2026-W02", colour: "RED" });
    expect(stored.settings.distributionWeekday).toBe(4);
    expect(priceFor(stored.settings, 2, 3)).toBe(700);
  });

  it("stores prices as whole cents, never a float", async () => {
    await repository.append(version("2026-01-01T00:00:00.000Z"));

    const rows = await prisma.priceTableRow.findMany();
    for (const row of rows) {
      expect(Number.isInteger(row.cents)).toBe(true);
    }
  });

  it("keeps every appended version rather than replacing the previous one", async () => {
    await repository.append(version("2026-01-01T00:00:00.000Z", 200));
    await repository.append(version("2026-06-01T00:00:00.000Z", 240));

    const quotas = (await repository.listVersions()).map((stored) => stored.settings.quotaN);
    expect(quotas).toEqual([200, 240]);
  });

  it("refuses a second version effective on the same day", async () => {
    await repository.append(version("2026-01-01T00:00:00.000Z"));

    await expect(repository.append(version("2026-01-01T00:00:00.000Z", 200))).rejects.toThrow();
  });

  it("refuses two price rows for the same household in one version", async () => {
    await expect(
      prisma.settingsVersion.create({
        data: {
          effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
          quotaN: 240,
          portionsPerGrownUp: 2,
          portionsPerChild: 1,
          reminderThreshold: 3,
          weekAnchorIsoWeek: "2026-W02",
          weekAnchorColour: "RED",
          distributionWeekday: 4,
          priceTable: {
            create: [
              { grownUps: 1, children: 0, cents: 200 },
              { grownUps: 1, children: 0, cents: 300 },
            ],
          },
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a stored week colour that is not part of the cycle", async () => {
    await prisma.settingsVersion.create({
      data: {
        effectiveFrom: new Date("2026-03-01T00:00:00.000Z"),
        quotaN: 240,
        portionsPerGrownUp: 2,
        portionsPerChild: 1,
        reminderThreshold: 3,
        weekAnchorIsoWeek: "2026-W02",
        weekAnchorColour: "GREEN",
        distributionWeekday: 4,
        priceTable: { create: [{ grownUps: 1, children: 0, cents: 200 }] },
      },
    });

    await expect(repository.listVersions()).rejects.toThrow(/weekAnchor.colour/);
  });
});

describe("seedSettings", () => {
  it("inserts the provisional version into an empty database", async () => {
    expect(await seedSettings(repository)).toBe(true);

    const [seeded] = await repository.listVersions();
    expect(seeded.effectiveFrom).toEqual(provisionalSettingsVersion().effectiveFrom);
    expect(seeded.settings.quotaN).toBe(240);
    expect(seeded.settings.portionsPerGrownUp).toBe(2);
    expect(seeded.settings.portionsPerChild).toBe(1);
    expect(seeded.settings.reminderThreshold).toBe(3);
    expect(seeded.settings.weekAnchor).toEqual({ isoWeek: "2026-W02", colour: "RED" });
    expect(seeded.settings.distributionWeekday).toBe(4);
    expect(priceFor(seeded.settings, 1, 0)).toBe(200);
    expect(priceFor(seeded.settings, 2, 1)).toBe(500);
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
