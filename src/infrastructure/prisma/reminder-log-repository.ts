import { Prisma, type PrismaClient } from "@prisma/client";
import type { ReminderLogEntry, ReminderLogRepository } from "@/application/ports";
import { ReminderAlreadyLoggedToday } from "@/domain/errors";

/**
 * Whether a failed write was the `(customerId, loggedOn)` constraint rejecting a second reminder on
 * a day one was already logged.
 *
 * The target is checked rather than assumed — the table may grow a second unique constraint, and it
 * should then surface as itself rather than as a repeat that never happened.
 */
function isDayCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes("loggedOn")
  );
}

/**
 * The SQLite-backed {@link ReminderLogRepository}.
 *
 * The adapter stores the trail; the once-per-day rule is the use case's (`recordReminder`). What it
 * owns is the one thing the pure layers cannot: the unique `(customerId, loggedOn)` constraint that
 * settles which of two simultaneous reminders on the same day got written (US-06.3). `record` writes
 * the entry and the customer's new `reminderCount` in **one transaction**, so the count can never
 * disagree with the trail — not even when the entry's write is the one the constraint rejects.
 */
export class PrismaReminderLogRepository implements ReminderLogRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** The reminder logged for the customer on the given Berlin day, or `null` when there is none. */
  async findOnDay(customerId: number, loggedOn: string): Promise<ReminderLogEntry | null> {
    const row = await this.prisma.reminderLog.findUnique({
      where: { customerId_loggedOn: { customerId, loggedOn } },
    });
    return row === null ? null : { loggedOn: row.loggedOn, resultingCount: row.resultingCount };
  }

  /**
   * Write the entry and set the customer's `reminderCount` to its `resultingCount`, transactionally.
   *
   * @throws {ReminderAlreadyLoggedToday} if a reminder for that customer and day landed first.
   */
  async record(customerId: number, entry: ReminderLogEntry): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.reminderLog.create({
          data: {
            customerId,
            loggedOn: entry.loggedOn,
            resultingCount: entry.resultingCount,
          },
        }),
        this.prisma.customer.update({
          where: { id: customerId },
          data: { reminderCount: entry.resultingCount },
        }),
      ]);
    } catch (error: unknown) {
      if (isDayCollision(error)) {
        throw new ReminderAlreadyLoggedToday(customerId, entry.loggedOn);
      }
      throw error;
    }
  }
}
