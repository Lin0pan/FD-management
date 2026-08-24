import type { PrismaClient } from "@prisma/client";
import type { SettingsRepository } from "@/application/ports";
import { createSettings, parseWeekColour, type SettingsVersion } from "@/domain/policy/settings";

/** One `SettingsVersion` row, as the query below returns it. */
interface StoredVersion {
  readonly recordedAt: Date;
  readonly quotaN: number;
  readonly weekAnchorIsoWeek: string;
  readonly weekAnchorColour: string;
  readonly distributionWeekday: number;
  readonly pricePerGrownUpCents: number;
  readonly pricePerChildCents: number;
  readonly priceCapCents: number | null;
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
      weekAnchor: {
        isoWeek: row.weekAnchorIsoWeek,
        colour: parseWeekColour(row.weekAnchorColour),
      },
      distributionWeekday: row.distributionWeekday,
      pricePerGrownUp: row.pricePerGrownUpCents,
      pricePerChild: row.pricePerChildCents,
      // `?? null` rather than the raw column: Prisma types an absent value as `null`, but the
      // domain spells "no cap" exactly one way, and `undefined` would slip past `createSettings`
      // as a missing field instead of a configured one.
      priceCap: row.priceCapCents ?? null,
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
        // TEMPORARY, until US-004 drops the columns: they are still NOT NULL with no default, so
        // the insert has to name them. Nothing reads them back — `toDomain` above has already
        // stopped — and they are the last thing in the codebase pointing at a portion allowance.
        portionsPerGrownUp: 0,
        portionsPerChild: 0,
        weekAnchorIsoWeek: settings.weekAnchor.isoWeek,
        weekAnchorColour: settings.weekAnchor.colour,
        distributionWeekday: settings.distributionWeekday,
        pricePerGrownUpCents: settings.pricePerGrownUp,
        pricePerChildCents: settings.pricePerChild,
        priceCapCents: settings.priceCap,
      },
    });
  }
}
