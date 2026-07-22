import { beforeEach, describe, expect, it } from "vitest";
import {
  MissingAuditReason,
  NoSettingsInForce,
  QuotaBelowActiveCustomers,
  RetroactiveSettingsVersion,
} from "@/domain/errors";
import { createSettings, type SettingsInput, type SettingsVersion } from "@/domain/policy/settings";
import type { AuditEntry, AuditLog, Clock, CustomerCounter, SettingsRepository } from "../ports";
import { listSettingsVersions } from "./list-settings-versions";
import { readCurrentSettings } from "./read-current-settings";
import { updateSettings, type UpdateSettingsInput } from "./update-settings";

/**
 * Hand-written fakes, per the testing standard — the application layer is tested against its ports,
 * never against a mocking library.
 */

class FakeSettingsRepository implements SettingsRepository {
  readonly versions: SettingsVersion[] = [];

  constructor(...versions: SettingsVersion[]) {
    this.versions.push(...versions);
  }

  listVersions(): Promise<SettingsVersion[]> {
    return Promise.resolve([...this.versions]);
  }

  append(version: SettingsVersion): Promise<void> {
    this.versions.push(version);
    return Promise.resolve();
  }
}

class FakeCustomerCounter implements CustomerCounter {
  constructor(private readonly active: number) {}

  countActive(): Promise<number> {
    return Promise.resolve(this.active);
  }
}

class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

function fakeClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

function settingsInput(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return {
    quotaN: 240,
    portionsPerGrownUp: 2,
    portionsPerChild: 1,
    reminderThreshold: 3,
    weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
    distributionWeekday: 4,
    pricePerGrownUp: 200,
    pricePerChild: 100,
    ...overrides,
  };
}

function version(effectiveFrom: string, overrides: Partial<SettingsInput> = {}): SettingsVersion {
  return {
    effectiveFrom: new Date(effectiveFrom),
    settings: createSettings(settingsInput(overrides)),
  };
}

function updateInput(overrides: Partial<UpdateSettingsInput> = {}): UpdateSettingsInput {
  return {
    effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    settings: settingsInput(),
    reason: "Preisanpassung beschlossen",
    ...overrides,
  };
}

describe("readCurrentSettings", () => {
  it("returns the version in force at the clock's today", async () => {
    const repository = new FakeSettingsRepository(
      version("2026-01-01T00:00:00.000Z", { quotaN: 200 }),
      version("2026-06-01T00:00:00.000Z", { quotaN: 240 }),
    );

    const settings = await readCurrentSettings({
      settings: repository,
      clock: fakeClock("2026-07-22T09:00:00.000Z"),
    });

    expect(settings.quotaN).toBe(240);
  });

  it("ignores a version that only takes effect tomorrow", async () => {
    const repository = new FakeSettingsRepository(
      version("2026-01-01T00:00:00.000Z", { quotaN: 200 }),
      version("2026-08-01T00:00:00.000Z", { quotaN: 240 }),
    );

    const settings = await readCurrentSettings({
      settings: repository,
      clock: fakeClock("2026-07-22T09:00:00.000Z"),
    });

    expect(settings.quotaN).toBe(200);
  });

  it("throws when no version has taken effect yet", async () => {
    const repository = new FakeSettingsRepository(version("2026-08-01T00:00:00.000Z"));

    await expect(
      readCurrentSettings({ settings: repository, clock: fakeClock("2026-07-22T09:00:00.000Z") }),
    ).rejects.toThrow(NoSettingsInForce);
  });
});

describe("updateSettings", () => {
  let repository: FakeSettingsRepository;
  let audit: FakeAuditLog;

  function deps(activeCustomers = 100, today = "2026-06-15T08:00:00.000Z") {
    return {
      settings: repository,
      clock: fakeClock(today),
      customers: new FakeCustomerCounter(activeCustomers),
      audit,
    };
  }

  beforeEach(() => {
    repository = new FakeSettingsRepository(version("2026-01-01T00:00:00.000Z", { quotaN: 240 }));
    audit = new FakeAuditLog();
  });

  it("appends a new version and leaves the existing ones untouched", async () => {
    const before = repository.versions[0];

    await updateSettings(deps(), updateInput({ settings: settingsInput({ quotaN: 250 }) }));

    expect(repository.versions).toHaveLength(2);
    expect(repository.versions[0]).toBe(before);
    expect(repository.versions[1].settings.quotaN).toBe(250);
  });

  it("returns the settings it stored", async () => {
    const stored = await updateSettings(
      deps(),
      updateInput({ settings: settingsInput({ quotaN: 250 }) }),
    );

    expect(stored.quotaN).toBe(250);
  });

  it("stores the effective-from date it was given", async () => {
    await updateSettings(deps(), updateInput());

    expect(repository.versions[1].effectiveFrom).toEqual(new Date("2026-07-01T00:00:00.000Z"));
  });

  it("accepts a quota equal to the active customer count", async () => {
    await updateSettings(deps(240), updateInput({ settings: settingsInput({ quotaN: 240 }) }));

    expect(repository.versions).toHaveLength(2);
  });

  it("rejects a quota below the active customer count", async () => {
    await expect(
      updateSettings(deps(240), updateInput({ settings: settingsInput({ quotaN: 239 }) })),
    ).rejects.toThrow(QuotaBelowActiveCustomers);
  });

  it("names both numbers in the quota error", async () => {
    const failure = await updateSettings(
      deps(240),
      updateInput({ settings: settingsInput({ quotaN: 100 }) }),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(QuotaBelowActiveCustomers);
    const error = failure as QuotaBelowActiveCustomers;
    expect(error.quotaN).toBe(100);
    expect(error.activeCustomers).toBe(240);
  });

  it("stores nothing when the quota is too low", async () => {
    await updateSettings(
      deps(240),
      updateInput({ settings: settingsInput({ quotaN: 100 }) }),
    ).catch(() => undefined);

    expect(repository.versions).toHaveLength(1);
    expect(audit.entries).toHaveLength(0);
  });

  it("rejects a version dated before the latest existing one", async () => {
    await expect(
      updateSettings(deps(), updateInput({ effectiveFrom: new Date("2025-12-31T00:00:00.000Z") })),
    ).rejects.toThrow(RetroactiveSettingsVersion);
  });

  it("rejects a version dated exactly on the latest existing one", async () => {
    await expect(
      updateSettings(deps(), updateInput({ effectiveFrom: new Date("2026-01-01T00:00:00.000Z") })),
    ).rejects.toThrow(RetroactiveSettingsVersion);
  });

  it("accepts the day after the latest existing version", async () => {
    await updateSettings(
      deps(),
      updateInput({ effectiveFrom: new Date("2026-01-02T00:00:00.000Z") }),
    );

    expect(repository.versions).toHaveLength(2);
  });

  it("finds the latest version whatever order the repository returns them in", async () => {
    repository = new FakeSettingsRepository(
      version("2026-06-01T00:00:00.000Z"),
      version("2026-01-01T00:00:00.000Z"),
    );

    await expect(
      updateSettings(deps(), updateInput({ effectiveFrom: new Date("2026-03-01T00:00:00.000Z") })),
    ).rejects.toThrow(RetroactiveSettingsVersion);
  });

  it("accepts the very first version whatever its date", async () => {
    repository = new FakeSettingsRepository();

    await updateSettings(
      deps(),
      updateInput({ effectiveFrom: new Date("2020-01-01T00:00:00.000Z") }),
    );

    expect(repository.versions).toHaveLength(1);
  });

  it("rejects invalid policy values before touching the repository", async () => {
    await updateSettings(deps(), updateInput({ settings: settingsInput({ quotaN: 0 }) })).catch(
      () => undefined,
    );

    expect(repository.versions).toHaveLength(1);
  });

  it("rejects a change with no reason, because the audit entry records why", async () => {
    await expect(updateSettings(deps(), updateInput({ reason: "   " }))).rejects.toThrow(
      MissingAuditReason,
    );
  });

  it("writes an audit entry naming the fields that changed", async () => {
    await updateSettings(
      deps(),
      updateInput({ settings: settingsInput({ quotaN: 250, reminderThreshold: 4 }) }),
    );

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].changedFields).toEqual(["quotaN", "reminderThreshold"]);
  });

  it("stamps the audit entry with the clock, not the effective-from date", async () => {
    await updateSettings(deps(100, "2026-06-15T08:00:00.000Z"), updateInput());

    expect(audit.entries[0].when).toEqual(new Date("2026-06-15T08:00:00.000Z"));
  });

  it("records the reason as the audit entry's why", async () => {
    await updateSettings(deps(), updateInput({ reason: "Preise um 50 Cent erhöht" }));

    expect(audit.entries[0].why).toBe("Preise um 50 Cent erhöht");
  });

  it("records the settings edit under a stable event name and carries no actor", async () => {
    await updateSettings(deps(), updateInput());

    expect(audit.entries[0].what).toBe("settings.updated");
    expect(Object.keys(audit.entries[0])).not.toContain("who");
  });

  it("treats every field as changed when there is no previous version", async () => {
    repository = new FakeSettingsRepository();

    await updateSettings(deps(), updateInput());

    expect(audit.entries[0].changedFields).toContain("pricePerGrownUp");
    expect(audit.entries[0].changedFields).toHaveLength(8);
  });
});

describe("listSettingsVersions", () => {
  it("lists the newest version first, so the settings screen leads with what applies now", async () => {
    const repository = new FakeSettingsRepository(
      version("2026-01-01T00:00:00.000Z", { quotaN: 200 }),
      version("2026-06-01T00:00:00.000Z", { quotaN: 240 }),
    );

    const versions = await listSettingsVersions({ settings: repository });

    expect(versions.map((entry) => entry.settings.quotaN)).toEqual([240, 200]);
  });

  it("does not rely on the repository returning versions in any order", async () => {
    const repository = new FakeSettingsRepository(
      version("2026-06-01T00:00:00.000Z", { quotaN: 240 }),
      version("2026-01-01T00:00:00.000Z", { quotaN: 200 }),
    );

    const versions = await listSettingsVersions({ settings: repository });

    expect(versions.map((entry) => entry.settings.quotaN)).toEqual([240, 200]);
  });

  it("returns an empty list for a database that was never seeded", async () => {
    const versions = await listSettingsVersions({ settings: new FakeSettingsRepository() });

    expect(versions).toEqual([]);
  });
});
