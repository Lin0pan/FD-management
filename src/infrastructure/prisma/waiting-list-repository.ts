import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  NewWaitingListEntry,
  WaitingListEntry,
  WaitingListRepository,
} from "@/application/ports";

/**
 * The rows an applicant is still waiting on: the ones no removal has stamped (FR-7).
 *
 * Removed entries are kept rather than deleted, so "waiting" is a filter and nothing else. Stating
 * it once keeps the list query and the single-entry lookup from drifting into two different ideas of
 * who is on the list — which would let a promotion register somebody the screen had already removed.
 */
const STILL_WAITING = { removedOn: null } as const;

/**
 * Arrival order for the page: earliest `addedOn` first, ties broken by the ascending `id`.
 *
 * This is a **stable page**, not the authority. The rule is `inArrivalOrder` in
 * `src/domain/customer/waitingList.ts`, and the application sorts what it gets back regardless — the
 * order is stated here as well so that a list read twice comes back the same way, and so the index
 * on `addedOn` is the one the query uses.
 */
const IN_ARRIVAL_ORDER = [
  { addedOn: "asc" },
  { id: "asc" },
] as const satisfies Prisma.Enumerable<Prisma.WaitingListEntryOrderByWithRelationInput>;

/** A waiting-list row as the database holds it. */
type WaitingListRow = Prisma.WaitingListEntryGetPayload<Record<string, never>>;

/**
 * A stored row as the application layer reads it.
 *
 * The address and the certificate are flat columns in the database and nested values in the domain,
 * so the shape is put back together here rather than anywhere above: `contactNote` is null in SQL
 * when none was given and `""` in the domain, and that translation is exactly what an adapter is
 * for. The removal columns are not carried across — everything this port hands back is *waiting*,
 * and a caller that could read `removedOn` would sooner or later branch on it.
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
 * The SQLite-backed {@link WaitingListRepository}.
 *
 * The adapter owns two things the pure layers cannot. First, the `id` that breaks a same-day tie:
 * rows are numbered as they are inserted, so the applicant who was typed in first is ahead of the
 * one typed in at ten past — without it, two people added the same morning would swap places between
 * two page loads. Second, retention: `remove` is an `update` that stamps the row, and there is no
 * statement in this file that deletes one.
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
   * The applicant still waiting under this id.
   *
   * A row that has already been removed reads as `null`, exactly like an id that never existed: both
   * mean "nobody is waiting under this id", and the promotion that asks must fail either way rather
   * than register somebody twice.
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
        // The empty note is stored as SQL's own "there is none" rather than as an empty string, so
        // the column has one representation of an unanswered question instead of two.
        contactNote: entry.contactNote === "" ? null : entry.contactNote,
        certificateType: entry.certificate.type,
        certificateValidUntil: entry.certificate.validUntil,
        addedOn: entry.addedOn,
      },
    });
    return toEntry(row);
  }

  /**
   * Stamp the entry as removed, keeping the row and the reason it went.
   *
   * The `where` names a row that is *still waiting*, so a second removal of the same entry updates
   * nothing rather than overwriting the first reason with a later one — the record of why an
   * applicant left the queue is written once. The use case has already established that the entry is
   * there; this is what settles two removals that raced.
   */
  async remove(entryId: number, reason: string, removedOn: Date): Promise<void> {
    await this.prisma.waitingListEntry.updateMany({
      where: { id: entryId, ...STILL_WAITING },
      data: { removedOn, removalReason: reason },
    });
  }
}
