import type { PrismaClient } from "@prisma/client";
import type { SettingsRepository } from "@/application/ports";
import { createSettings, parseWeekColour, type SettingsVersion } from "@/domain/policy/settings";

/** One `EggAllowanceRow` row, as the query below returns it. */
interface StoredEggRuleRow {
  readonly minPersons: number;
  readonly eggs: number;
}

/** One `SettingsVersion` row with its egg rule, as the query below returns it. */
interface StoredVersion {
  readonly recordedAt: Date;
  readonly quotaN: number;
  readonly weekAnchorIsoWeek: string;
  readonly weekAnchorColour: string;
  readonly distributionWeekday: number;
  readonly pricePerGrownUpCents: number;
  readonly pricePerChildCents: number;
  readonly priceCapCents: number | null;
  readonly eggRule: ReadonlyArray<StoredEggRuleRow>;
}

/**
 * Rebuild a domain version from its rows, back through `createSettings` so a hand-edited database
 * cannot smuggle a fractional price or an impossible weekday into the domain.
 */
function toDomain(row: StoredVersion): SettingsVersion {
  return {
    recordedAt: row.recordedAt,
    settings: createSettings({
      quotaN: row.quotaN,
      weekAnchor: {
        isoWeek: row.weekAnchorIsoWeek,
        colour: parseWeekColour(row.weekAnchorColour),
      },
      distributionWeekday: row.distributionWeekday,
      pricePerGrownUp: row.pricePerGrownUpCents,
      pricePerChild: row.pricePerChildCents,
      // `?? null` rather than the raw column: the domain spells "no cap" exactly one way, and
      // `undefined` would slip past `createSettings` as a missing field rather than a configured one.
      priceCap: row.priceCapCents ?? null,
      // Through `createEggRule` inside `createSettings`, so a hand-edited database cannot smuggle a
      // descending staircase in. No rows is an empty rule — a configuration, not an absence.
      eggRule: row.eggRule.map((step) => ({ minPersons: step.minPersons, eggs: step.eggs })),
    }),
  };
}

/**
 * The SQLite-backed {@link SettingsRepository}. Append-only by construction — no update and no
 * delete, because a past distribution can only be priced from the version in force on its day
 * (ADR-005, `tasks/prd-us-14-configure-business-rules.md` §US-14.3).
 */
export class PrismaSettingsRepository implements SettingsRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Every version ever written, in the order it was written. `resolveSettingsAt` scans rather than
   * assumes an order, but it breaks a same-instant tie by position, so insertion order is the one
   * ordering that answers such a tie correctly.
   */
  async listVersions(): Promise<SettingsVersion[]> {
    const rows = await this.prisma.settingsVersion.findMany({
      orderBy: { id: "asc" },
      // Threshold order rather than insertion order: `createEggRule` sorts anyway, but reading them
      // sorted means the query answers the same question the domain asks and a row inserted out of
      // order by hand never looks like a rule that changed.
      include: { eggRule: { orderBy: { minPersons: "asc" } } },
    });
    return rows.map(toDomain);
  }

  /**
   * Store a new version. Nothing is ever updated or deleted.
   *
   * The rule's rows are a **nested create** rather than a second statement: Prisma wraps a nested
   * write in one transaction, so a version and the rule it was saved with land together or not at
   * all. A version holding half a staircase would price a past distribution wrongly and nothing
   * would say so.
   */
  async append(version: SettingsVersion): Promise<void> {
    const { settings } = version;
    await this.prisma.settingsVersion.create({
      data: {
        recordedAt: version.recordedAt,
        quotaN: settings.quotaN,
        weekAnchorIsoWeek: settings.weekAnchor.isoWeek,
        weekAnchorColour: settings.weekAnchor.colour,
        distributionWeekday: settings.distributionWeekday,
        pricePerGrownUpCents: settings.pricePerGrownUp,
        pricePerChildCents: settings.pricePerChild,
        priceCapCents: settings.priceCap,
        eggRule: {
          create: settings.eggRule.map((row) => ({
            minPersons: row.minPersons,
            eggs: row.eggs,
          })),
        },
      },
    });
  }
}
