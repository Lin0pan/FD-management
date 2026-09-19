/**
 * End the afternoon (`tasks/prd-us-34-distribution-session.md` §US-34.4). The software never does
 * this by itself — not at midnight, not after a deadline (FR-5) — and ending freezes the session's
 * hand-outs: from this instant none of them is correctable any more.
 *
 * The summary counts **what was taken**, and nothing about who did not turn up. A household that
 * stayed away is the absence of a row, and a no-show count at the end of the afternoon would put
 * staff to explaining a number DF never asked for.
 */

import { formatSessionGroups } from "@/domain/distribution/session";
import { NoDistributionSessionRunning } from "@/domain/errors";
import type { Cents } from "@/domain/money";
import type {
  AuditLog,
  Clock,
  DistributionRecordRepository,
  DistributionSessionRepository,
} from "../ports";

/** The audit event one ended session is written under. */
const SESSION_ENDED = "distribution.session.ended";

/** What the entry names as changed: the three columns the session's own row is read by. */
const ENDED_FIELDS = ["startedAt", "endedAt", "groups"] as const;

export interface EndDistributionSessionDeps {
  readonly sessions: DistributionSessionRepository;
  readonly records: DistributionRecordRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

/** What the afternoon came to, as the screen states it back once the session is closed. */
export interface SessionSummary {
  /** How many households collected — one hand-out each, which `(customerId, sessionId)` guarantees. */
  readonly households: number;
  /** The sum handed over across those hand-outs, never the sum of what was asked for. */
  readonly totalPaidCents: Cents;
}

/**
 * End the running session and return what it came to.
 *
 * @throws {NoDistributionSessionRunning} if no session is running.
 */
export async function endDistributionSession(
  deps: EndDistributionSessionDeps,
): Promise<SessionSummary> {
  const now = deps.clock.now();

  const session = await deps.sessions.findRunning();
  if (session === null) {
    throw new NoDistributionSessionRunning();
  }

  const handouts = await deps.records.listForSession(session.id);
  const summary: SessionSummary = {
    households: handouts.length,
    totalPaidCents: handouts.reduce((total, handout) => total + handout.paidCents, 0),
  };

  await deps.sessions.end(session.id, now);
  // No human reason is asked for, so the entry has to tell its own story: the start instant the end
  // one cannot be read without, the groups served, and what the afternoon came to (ADR-006).
  await deps.audit.append({
    what: SESSION_ENDED,
    changedFields: [...ENDED_FIELDS],
    when: now,
    why:
      `startedAt=${session.startedAt.toISOString()}, ` +
      `groups=${formatSessionGroups(session.groups)}, ` +
      `households=${summary.households}, totalPaid=${summary.totalPaidCents}`,
  });

  return summary;
}
