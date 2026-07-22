import type { SettingsRepository } from "@/application/ports";
import { createSettings, type SettingsVersion } from "@/domain/policy/settings";

/**
 * The provisional policy values a fresh database starts with, so the app is usable on first boot
 * instead of failing with `NoSettingsInForce`.
 *
 * **Every number here is provisional and must be confirmed with FD** (tasks/README.md, "Provisional
 * seed values"). They are configuration rows, so correcting them is a settings edit on the
 * `/einstellungen` screen — not a code change and not a migration.
 */
const SEED_EFFECTIVE_FROM = new Date("2026-01-01T00:00:00.000Z");

/** The single version a fresh install is seeded with. */
export function provisionalSettingsVersion(): SettingsVersion {
  return {
    effectiveFrom: SEED_EFFECTIVE_FROM,
    settings: createSettings({
      quotaN: 240,
      portionsPerGrownUp: 2,
      portionsPerChild: 1,
      reminderThreshold: 3,
      weekAnchor: { isoWeek: "2026-W02", colour: "RED" },
      distributionWeekday: 4,
      pricePerGrownUp: 200,
      pricePerChild: 100,
    }),
  };
}

/**
 * Insert the provisional settings version if — and only if — the database holds none.
 *
 * Running it twice is a no-op, so it is safe to call after every deploy. No audit entry is written:
 * the log records what a person changed and *why*, and the seed is the database's initial state
 * rather than anyone's decision.
 *
 * @returns whether a version was inserted.
 */
export async function seedSettings(repository: SettingsRepository): Promise<boolean> {
  const existing = await repository.listVersions();
  if (existing.length > 0) {
    return false;
  }
  await repository.append(provisionalSettingsVersion());
  return true;
}
