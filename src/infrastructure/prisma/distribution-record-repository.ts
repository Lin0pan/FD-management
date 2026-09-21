import { Prisma, type PrismaClient } from "@prisma/client";
import type { DistributionRecordRepository, FrozenHandout } from "@/application/ports";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import type { SessionSummary } from "@/domain/distribution/session";
import { AlreadyServedInSession, DistributionRecordNotFound } from "@/domain/errors";
import type { Cents } from "@/domain/money";

/**
 * Whether a failed write was the `(customerId, sessionId)` constraint rejecting a second hand-out.
 * The target is checked rather than assumed, so a future second constraint surfaces as itself rather
 * than as a lost race a retry would answer wrongly.
 */
function isSessionCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes("sessionId")
  );
}

/** The shape every row read here is mapped through. */
interface RecordRow {
  id: number;
  customerId: number;
  sessionId: number;
  date: Date;
  showedUp: boolean;
  paidCents: number;
  priceCents: number;
}

function toRecord(row: RecordRow): DistributionRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    sessionId: row.sessionId,
    date: row.date,
    showedUp: row.showedUp,
    paidCents: row.paidCents as Cents,
    priceCents: row.priceCents as Cents,
  };
}

/**
 * The SQLite-backed {@link DistributionRecordRepository}. The once-per-session rule is the domain's
 * (`attendance.canRecord`); what this owns is the `@@unique([customerId, sessionId])` constraint
 * that settles two simultaneous hand-outs (US-05.3, US-34).
 */
export class PrismaDistributionRecordRepository implements DistributionRecordRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** Every record ever written for the customer, oldest first — the raw material the guard reads. */
  async listForCustomer(customerId: number): Promise<ReadonlyArray<DistributionRecord>> {
    const rows = await this.prisma.distributionRecord.findMany({
      where: { customerId },
      orderBy: { date: "asc" },
    });
    return rows.map(toRecord);
  }

  /** Every hand-out written in one session, in one query (US-23). */
  async listForSession(sessionId: number): Promise<ReadonlyArray<DistributionRecord>> {
    const rows = await this.prisma.distributionRecord.findMany({ where: { sessionId } });
    return rows.map(toRecord);
  }

  /** What every session came to, in one aggregate query — see the port for why (US-37.1). */
  async summariseBySession(): Promise<ReadonlyMap<number, SessionSummary>> {
    const groups = await this.prisma.distributionRecord.groupBy({
      by: ["sessionId"],
      _count: { _all: true },
      _sum: { paidCents: true },
    });

    // `_sum` is nullable for an empty group, which a `groupBy` cannot produce; `?? 0` states
    // `summariseSession`'s own reading of an afternoon nobody collected at, not an assertion.
    return new Map(
      groups.map((group) => [
        group.sessionId,
        {
          households: group._count._all,
          totalPaidCents: (group._sum.paidCents ?? 0) as Cents,
        },
      ]),
    );
  }

  /** The record with this surrogate id, or `null` if the id belongs to none. */
  async findById(recordId: number): Promise<DistributionRecord | null> {
    const row = await this.prisma.distributionRecord.findUnique({ where: { id: recordId } });
    return row === null ? null : toRecord(row);
  }

  /**
   * Write one hand-out and hand it back as stored.
   *
   * @throws {AlreadyServedInSession} if a record for the customer's session landed first.
   */
  async create(record: NewDistributionRecord): Promise<DistributionRecord> {
    try {
      const row = await this.prisma.distributionRecord.create({
        data: {
          customerId: record.customerId,
          sessionId: record.sessionId,
          date: record.date,
          showedUp: record.showedUp,
          paidCents: record.paidCents,
          priceCents: record.priceCents,
        },
      });
      return toRecord(row);
    } catch (error: unknown) {
      if (isSessionCollision(error)) {
        throw new AlreadyServedInSession(record.sessionId);
      }
      throw error;
    }
  }

  /**
   * Amend the amount handed over and return the record as stored. Whether it is still correctable is
   * the use case's question (`attendance.canCorrect`); `0` is written as `0`, not as absent.
   *
   * @throws {DistributionRecordNotFound} if the id belongs to no record.
   */
  async setPayment(recordId: number, paidCents: Cents): Promise<DistributionRecord> {
    try {
      const row = await this.prisma.distributionRecord.update({
        where: { id: recordId },
        data: { paidCents },
      });
      return toRecord(row);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new DistributionRecordNotFound(recordId);
      }
      throw error;
    }
  }

  /**
   * Remove a record whose session still runs — the one deletion the history permits (US-05, FR-7).
   *
   * @throws {DistributionRecordNotFound} if the id belongs to no record.
   */
  async remove(recordId: number): Promise<void> {
    try {
      await this.prisma.distributionRecord.delete({ where: { id: recordId } });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new DistributionRecordNotFound(recordId);
      }
      throw error;
    }
  }

  /** Drop whatever the session carries and write the freeze afresh — see the port for why. */
  async freezeSession(sessionId: number, receipts: ReadonlyArray<FrozenHandout>): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.handoutReceipt.deleteMany({ where: { record: { sessionId } } }),
      this.prisma.handoutReceipt.createMany({
        data: receipts.map(({ recordId, receipt }) => ({ recordId, ...receipt })),
      }),
    ]);
  }

  /** The receipts of one session, each beside the hand-out it describes (US-37.2). */
  async listFrozen(sessionId: number): Promise<ReadonlyArray<FrozenHandout>> {
    const rows = await this.prisma.handoutReceipt.findMany({
      where: { record: { sessionId } },
      omit: { id: true },
    });
    return rows.map(({ recordId, ...receipt }) => ({ recordId, receipt }));
  }

  async thawSession(sessionId: number): Promise<void> {
    await this.prisma.handoutReceipt.deleteMany({ where: { record: { sessionId } } });
  }
}
