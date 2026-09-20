import { Prisma, type PrismaClient } from "@prisma/client";
import type { ReminderLogEntry, ReminderLogRepository } from "@/application/ports";
import { ReminderAlreadyLoggedInSession } from "@/domain/errors";

/**
 * Whether a failed write was the `(customerId, sessionId)` constraint rejecting a second reminder.
 * The target is checked rather than assumed, so a future second constraint surfaces as itself rather
 * than as a repeat that never happened.
 */
function isSessionCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes("sessionId")
  );
}

/**
 * The SQLite-backed {@link ReminderLogRepository}. The once-per-session rule is `recordReminder`'s;
 * what this owns is the unique `(customerId, sessionId)` constraint that settles two simultaneous
 * reminders (US-06.3, US-34).
 *
 * `record` writes the entry and the new `reminderCount` in **one transaction**, so the count cannot
 * disagree with the trail — not even when the entry's write is the one the constraint rejects.
 */
export class PrismaReminderLogRepository implements ReminderLogRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** The reminder logged for the customer in the given session, or `null` when there is none. */
  async findInSession(customerId: number, sessionId: number): Promise<ReminderLogEntry | null> {
    const row = await this.prisma.reminderLog.findUnique({
      where: { customerId_sessionId: { customerId, sessionId } },
    });
    return row === null ? null : { sessionId: row.sessionId, resultingCount: row.resultingCount };
  }

  /** Every reminder given in one session — what a session's emptiness is weighed by (US-34, FR-7). */
  async listForSession(sessionId: number): Promise<ReadonlyArray<ReminderLogEntry>> {
    const rows = await this.prisma.reminderLog.findMany({ where: { sessionId } });
    return rows.map((row) => ({ sessionId: row.sessionId, resultingCount: row.resultingCount }));
  }

  /**
   * Write the entry and set the customer's `reminderCount` to its `resultingCount`, transactionally.
   *
   * @throws {ReminderAlreadyLoggedInSession} if a reminder for that customer and session landed first.
   */
  async record(customerId: number, entry: ReminderLogEntry): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.reminderLog.create({
          data: {
            customerId,
            sessionId: entry.sessionId,
            resultingCount: entry.resultingCount,
          },
        }),
        this.prisma.customer.update({
          where: { id: customerId },
          data: { reminderCount: entry.resultingCount },
        }),
      ]);
    } catch (error: unknown) {
      if (isSessionCollision(error)) {
        throw new ReminderAlreadyLoggedInSession(customerId, entry.sessionId);
      }
      throw error;
    }
  }
}
