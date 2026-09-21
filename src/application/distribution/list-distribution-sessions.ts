/**
 * Every afternoon the software has on record, newest first — what `/ausgabetermine` lists
 * (`tasks/prd-us-37-session-overview-and-detail.md` §US-37.1).
 *
 * One query for the sessions and one aggregate for their figures, whatever the register's age: the
 * households and the sum of an afternoon are derived at every read (ADR-015), and deriving them a
 * session at a time would be a round trip per row on a page that only grows.
 */

import {
  isRunning,
  summariseSession,
  type DistributionSession,
  type SessionGroups,
} from "@/domain/distribution/session";
import type { Cents } from "@/domain/money";
import type { DistributionRecordRepository, DistributionSessionRepository } from "../ports";

export interface ListDistributionSessionsDeps {
  readonly sessions: DistributionSessionRepository;
  readonly records: DistributionRecordRepository;
}

/** One row of the overview: an afternoon and what it came to. */
export interface ListedSession {
  readonly id: number;
  readonly startedAt: Date;
  /** `null` while the afternoon is under way. What to print in its place is the screen's decision. */
  readonly endedAt: Date | null;
  readonly groups: SessionGroups;
  readonly households: number;
  readonly totalPaidCents: Cents;
  /** Whether this is the afternoon under way, whose two figures are therefore still provisional. */
  readonly running: boolean;
}

/**
 * List the distributions that took place, most recent first, the running one at the top.
 *
 * Discarded sessions never appear: they are stamped rather than deleted (ADR-010) and every read of
 * the session store already filters them out, so nothing here has to know that state exists.
 */
export async function listDistributionSessions(
  deps: ListDistributionSessionsDeps,
): Promise<ReadonlyArray<ListedSession>> {
  const running = await deps.sessions.findRunning();
  const ended = await deps.sessions.listEnded();
  const summaries = await deps.records.summariseBySession();

  const newestFirst: ReadonlyArray<DistributionSession> =
    running === null ? ended : [running, ...ended];

  return newestFirst.map((session) => ({
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    groups: session.groups,
    ...(summaries.get(session.id) ?? summariseSession([])),
    running: isRunning(session),
  }));
}
