import type { PrismaClient } from "@prisma/client";
import type { SettingsRepository } from "@/application/ports";
import { createSettings, parseWeekColour, type SettingsVersion } from "@/domain/policy/settings";

/** One `SettingsVersion` row, as the query below returns it. */
interface StoredVersion {
  readonly recordedAt: Date;
  readonly quotaN: number;
  readonly portionsPerGrownUp: number;
  readonly portionsPerChild: number;
  readonly weekAnchorIsoWeek: string;
  readonly weekAnchorColour: string;
  readonly distributionWeekday: number;
  readonly pricePerGrownUpCents: number;
  readonly pricePerChildCents: number;
}

/**
 * Rebuild a domain version from its rows.
 *
 * The stored values go back through `createSettings`, so a database edited by hand cannot smuggle a
 * fractional price or an impossible weekday into the domain.
 */
function toDomain(row: StoredVersion): SettingsVersion {
  return {
    recordedAt: row.recordedAt,
    settings: createSettings({
      quotaN: row.quotaN,
      portionsPerGrownUp: row.portionsPerGrownUp,
      portionsPerChild: row.portionsPerChild,
      weekAnchor: {
        isoWeek: row.weekAnchorIsoWeek,
        colour: parseWeekColour(row.weekAnchorColour),
      },
      distributionWeekday: row.distributionWeekday,
      pricePerGrownUp: row.pricePerGrownUpCents,
      pricePerChild: row.pricePerChildCents,
    }),
  };
}

/**
 * The SQLite-backed {@link SettingsRepository}.
 *
 * Append-only by construction: there is no update and no delete, because a past distribution can
 * only be priced from the version that was in force on its day
 * (tasks/prd-us-14-configure-business-rules.md §US-14.3).
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
    });
    return rows.map(toDomain);
  }

  /** Store a new version. Nothing is ever updated or deleted. */
  async append(version: SettingsVersion): Promise<void> {
    const { settings } = version;
    await this.prisma.settingsVersion.create({
      data: {
        recordedAt: version.recordedAt,
        quotaN: settings.quotaN,
        portionsPerGrownUp: settings.portionsPerGrownUp,
        portionsPerChild: settings.portionsPerChild,
        weekAnchorIsoWeek: settings.weekAnchor.isoWeek,
        weekAnchorColour: settings.weekAnchor.colour,
        distributionWeekday: settings.distributionWeekday,
        pricePerGrownUpCents: settings.pricePerGrownUp,
        pricePerChildCents: settings.pricePerChild,
      },
    });
  }
}
