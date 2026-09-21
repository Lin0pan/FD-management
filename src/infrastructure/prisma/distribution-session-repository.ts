import { Prisma, type PrismaClient } from "@prisma/client";
import type { DistributionSessionRepository } from "@/application/ports";
import {
  formatSessionGroups,
  parseSessionGroups,
  type DistributionSession,
  type SessionGroups,
} from "@/domain/distribution/session";
import { DistributionSessionAlreadyRunning } from "@/domain/errors";

/**
 * Whether a failed write was the hand-written `one_running_session` index refusing a second running
 * session. SQLite names the index rather than a column for an index on an expression, so the target
 * is matched by that name — checked rather than assumed, so a future constraint on this table
 * surfaces as itself.
 */
function isRunningSessionCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes("one_running_session")
  );
}

/** What a session row holds; `discardedAt` never leaves this file — a discarded session is no row. */
interface SessionRow {
  id: number;
  startedAt: Date;
  endedAt: Date | null;
  groups: string;
}

function toSession(row: SessionRow): DistributionSession {
  return {
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    groups: parseSessionGroups(row.groups),
  };
}

/** Every read filters the discarded rows out, which is what keeps the domain's two states two. */
const NOT_DISCARDED = { discardedAt: null };

/** The SQLite-backed {@link DistributionSessionRepository}. */
export class PrismaDistributionSessionRepository implements DistributionSessionRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Re-read the running session so a collision can be reported as the afternoon that is under way:
   * the index says one is running but not which. Returns, rather than throwing, when the write
   * failed for any other reason — or when the session ended in the moment between the two reads.
   *
   * @throws {DistributionSessionAlreadyRunning} naming the session that was already running.
   */
  private async refuseAsAlreadyRunning(error: unknown): Promise<void> {
    if (!isRunningSessionCollision(error)) {
      return;
    }
    const running = await this.findRunning();
    if (running !== null) {
      throw new DistributionSessionAlreadyRunning(running.id);
    }
  }

  async findRunning(): Promise<DistributionSession | null> {
    const row = await this.prisma.distributionSession.findFirst({
      where: { ...NOT_DISCARDED, endedAt: null },
    });
    return row === null ? null : toSession(row);
  }

  /** Ordered by the end instant, then by id: two sessions ended in one millisecond still have a last. */
  async lastEnded(): Promise<DistributionSession | null> {
    const row = await this.prisma.distributionSession.findFirst({
      where: { ...NOT_DISCARDED, endedAt: { not: null } },
      orderBy: [{ endedAt: "desc" }, { id: "desc" }],
    });
    return row === null ? null : toSession(row);
  }

  /** Newest first, ordered as {@link lastEnded} is — whose answer is this list's first row. */
  async listEnded(): Promise<ReadonlyArray<DistributionSession>> {
    const rows = await this.prisma.distributionSession.findMany({
      where: { ...NOT_DISCARDED, endedAt: { not: null } },
      orderBy: [{ endedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toSession);
  }

  async findById(sessionId: number): Promise<DistributionSession | null> {
    const row = await this.prisma.distributionSession.findFirst({
      where: { ...NOT_DISCARDED, id: sessionId },
    });
    return row === null ? null : toSession(row);
  }

  /**
   * Start one and hand it back as stored.
   *
   * @throws {DistributionSessionAlreadyRunning} naming the session that was already running.
   */
  async start(groups: SessionGroups, at: Date): Promise<DistributionSession> {
    try {
      const row = await this.prisma.distributionSession.create({
        data: { startedAt: at, groups: formatSessionGroups(groups) },
      });
      return toSession(row);
    } catch (error: unknown) {
      await this.refuseAsAlreadyRunning(error);
      throw error;
    }
  }

  async end(sessionId: number, at: Date): Promise<void> {
    await this.prisma.distributionSession.update({
      where: { id: sessionId },
      data: { endedAt: at },
    });
  }

  async discard(sessionId: number, at: Date): Promise<void> {
    await this.prisma.distributionSession.update({
      where: { id: sessionId },
      data: { discardedAt: at },
    });
  }

  /**
   * Clear `endedAt` again. The partial index guards this write as it guards {@link start}: a
   * reopening is a session running, so one landing while another runs is refused by the database.
   *
   * @throws {DistributionSessionAlreadyRunning} if a session was running when this landed.
   */
  async reopen(sessionId: number): Promise<void> {
    try {
      await this.prisma.distributionSession.update({
        where: { id: sessionId },
        data: { endedAt: null },
      });
    } catch (error: unknown) {
      await this.refuseAsAlreadyRunning(error);
      throw error;
    }
  }
}
