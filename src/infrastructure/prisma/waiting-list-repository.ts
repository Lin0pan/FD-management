import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  NewWaitingListEntry,
  WaitingListEntry,
  WaitingListRepository,
} from "@/application/ports";

/**
 * The rows an applicant is still waiting on: the ones no removal has stamped (FR-7). Stated once, so
 * the list query and the single-entry lookup cannot drift into two ideas of who is on the list —
 * which would let a promotion register somebody the screen had already removed.
 */
const STILL_WAITING = { removedOn: null } as const;

/**
 * A **stable page**, not the authority — `inArrivalOrder` is the rule and the application sorts
 * regardless. Stated here so a list read twice comes back the same way, and so the query uses the
 * index on `addedOn`.
 */
const IN_ARRIVAL_ORDER = [
  { addedOn: "asc" },
  { id: "asc" },
] as const satisfies Prisma.Enumerable<Prisma.WaitingListEntryOrderByWithRelationInput>;

/** A waiting-list row as the database holds it. */
type WaitingListRow = Prisma.WaitingListEntryGetPayload<Record<string, never>>;

/**
 * A stored row as the application layer reads it — flat columns put back into nested values, and a
 * null `contactNote` into the domain's `""`. The removal columns are deliberately not carried
 * across: everything this port hands back is *waiting*, and a caller that could read `removedOn`
 * would sooner or later branch on it.
 */
function toEntry(row: WaitingListRow): WaitingListEntry {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate,
    address: {
      street: row.street,
      houseNumber: row.houseNumber,
      zip: row.zip,
      city: row.city,
    },
    contactNote: row.contactNote ?? "",
    certificate: { type: row.certificateType, validUntil: row.certificateValidUntil },
    addedOn: row.addedOn,
  };
}

/**
 * The SQLite-backed {@link WaitingListRepository}. It owns two things the pure layers cannot: the
 * `id` that breaks a same-day tie, since rows are numbered as they are inserted, and retention —
 * `remove` is an `update` that stamps the row, and nothing in this file deletes one.
 */
export class PrismaWaitingListRepository implements WaitingListRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** Every applicant still waiting, in the order they joined. */
  async listWaiting(): Promise<ReadonlyArray<WaitingListEntry>> {
    const rows = await this.prisma.waitingListEntry.findMany({
      where: STILL_WAITING,
      orderBy: [...IN_ARRIVAL_ORDER],
    });
    return rows.map(toEntry);
  }

  /**
   * The applicant still waiting under this id. A removed row reads as `null` like an id that never
   * existed — both mean "nobody is waiting", and a promotion must fail either way.
   */
  async findWaiting(entryId: number): Promise<WaitingListEntry | null> {
    const row = await this.prisma.waitingListEntry.findFirst({
      where: { id: entryId, ...STILL_WAITING },
    });
    return row === null ? null : toEntry(row);
  }

  /** Write the applicant onto the list and hand the entry back with the id it was given. */
  async add(entry: NewWaitingListEntry): Promise<WaitingListEntry> {
    const row = await this.prisma.waitingListEntry.create({
      data: {
        firstName: entry.firstName,
        lastName: entry.lastName,
        birthDate: entry.birthDate,
        street: entry.address.street,
        houseNumber: entry.address.houseNumber,
        zip: entry.address.zip,
        city: entry.address.city,
        // SQL's own "there is none" rather than an empty string, so the column has one
        // representation of an unanswered question instead of two.
        contactNote: entry.contactNote === "" ? null : entry.contactNote,
        certificateType: entry.certificate.type,
        certificateValidUntil: entry.certificate.validUntil,
        addedOn: entry.addedOn,
      },
    });
    return toEntry(row);
  }

  /**
   * Stamp the entry as removed, keeping the row and the reason. The `where` names a row that is
   * *still waiting*, so a second removal updates nothing rather than overwriting the first reason —
   * which is what settles two removals that raced.
   */
  async remove(entryId: number, reason: string, removedOn: Date): Promise<void> {
    await this.prisma.waitingListEntry.updateMany({
      where: { id: entryId, ...STILL_WAITING },
      data: { removedOn, removalReason: reason },
    });
  }
}
