import { Prisma, type PrismaClient } from "@prisma/client";
import type { DistributionRecordRepository } from "@/application/ports";
import { berlinDayKey } from "@/domain/distribution/attendance";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import { AlreadyServedToday, DistributionRecordNotFound } from "@/domain/errors";
import type { Cents } from "@/domain/money";

/**
 * Whether a failed write was the `(customerId, dayKey)` constraint rejecting a second hand-out on a
 * day the customer was already served.
 *
 * The target is checked rather than assumed — the table may grow a second unique constraint, and it
 * should then surface as itself rather than as a lost race that a retry would answer wrongly.
 */
function isDayCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes("dayKey")
  );
}

/** The shape every row read here is mapped through — Prisma's row is wider (it carries `dayKey`). */
interface RecordRow {
  id: number;
  customerId: number;
  date: Date;
  showedUp: boolean;
  paidCents: number;
  priceCents: number;
}

function toRecord(row: RecordRow): DistributionRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    date: row.date,
    showedUp: row.showedUp,
    paidCents: row.paidCents as Cents,
    priceCents: row.priceCents as Cents,
  };
}

/**
 * The SQLite-backed {@link DistributionRecordRepository}.
 *
 * The adapter stores hand-outs and reads them back; the once-per-day rule is the domain's
 * (`attendance.canRecord`). What it owns is the one thing the pure layers cannot: the
 * `@@unique([customerId, dayKey])` constraint that settles which of two simultaneous hand-outs on the
 * same day got written (US-05.3). `dayKey` is the **Berlin** calendar day, filled here by the very
 * function the domain rule uses (`berlinDayKey`), so the constraint and the guard can never drift to
 * two different notions of "today".
 *
 * The `dayKey` column is an implementation detail of the constraint and never leaves the adapter — the
 * domain record carries only the `date` instant, from which the day is re-derived wherever it is
 * needed.
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

  /**
   * Every hand-out written on one Berlin day, in one query (US-23).
   *
   * The day arrives as the key itself, not as an instant to be re-derived here: the caller already
   * holds the Berlin day from the clock, and a second derivation is a second place the boundary
   * between two days could be decided. The `dayKey` column is matched and dropped again by
   * {@link toRecord}, so it still never leaves the adapter.
   */
  async listForDay(dayKey: string): Promise<ReadonlyArray<DistributionRecord>> {
    const rows = await this.prisma.distributionRecord.findMany({ where: { dayKey } });
    return rows.map(toRecord);
  }

  /** The record with this surrogate id, or `null` if the id belongs to none. */
  async findById(recordId: number): Promise<DistributionRecord | null> {
    const row = await this.prisma.distributionRecord.findUnique({ where: { id: recordId } });
    return row === null ? null : toRecord(row);
  }

  /**
   * Write one hand-out and hand it back as stored, with its assigned id and the price it was taken
   * at. The Berlin day-key is derived from `date` and stored so the unique constraint can rest on it.
   *
   * @throws {AlreadyServedToday} if a record for the customer's day already existed when this landed.
   */
  async create(record: NewDistributionRecord): Promise<DistributionRecord> {
    try {
      const row = await this.prisma.distributionRecord.create({
        data: {
          customerId: record.customerId,
          date: record.date,
          dayKey: berlinDayKey(record.date),
          showedUp: record.showedUp,
          paidCents: record.paidCents,
          priceCents: record.priceCents,
        },
      });
      return toRecord(row);
    } catch (error: unknown) {
      if (isDayCollision(error)) {
        throw new AlreadyServedToday(record.date);
      }
      throw error;
    }
  }

  /**
   * Amend the amount handed over on a record made today, and return it as stored. The day it was
   * correctable on is the use case's question (`attendance.canCorrect`); the store only records the
   * new amount, and `0` is written as `0` rather than as an absent payment.
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
   * Remove a record made today — the one deletion the history permits (US-05, FR-7).
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
}
