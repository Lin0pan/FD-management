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

/** The largest household the seed table prices; beyond it staff add a row on the settings screen. */
const SEED_MAX_GROWN_UPS = 6;
const SEED_MAX_CHILDREN = 6;

/**
 * The seed price table: 200 cents per grown-up plus 100 cents per child, enumerated as explicit
 * rows. The formula generates the seed only — `priceFor` matches a row exactly and never
 * interpolates, and FD's real table need not be linear.
 */
function seedPriceTable(): ReadonlyArray<{ grownUps: number; children: number; cents: number }> {
  const rows = [];
  for (let grownUps = 1; grownUps <= SEED_MAX_GROWN_UPS; grownUps += 1) {
    for (let children = 0; children <= SEED_MAX_CHILDREN; children += 1) {
      rows.push({ grownUps, children, cents: grownUps * 200 + children * 100 });
    }
  }
  return rows;
}

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
      priceTable: seedPriceTable(),
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
