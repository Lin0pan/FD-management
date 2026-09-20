/**
 * End the afternoon (`tasks/prd-us-34-distribution-session.md` §US-34.4). The software never does
 * this by itself — not at midnight, not after a deadline (FR-5) — and ending freezes the session's
 * hand-outs: from this instant none of them is correctable any more.
 */

import {
  formatSessionGroups,
  summariseSession,
  type SessionSummary,
} from "@/domain/distribution/session";
import { NoDistributionSessionRunning } from "@/domain/errors";
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

  const summary = summariseSession(await deps.records.listForSession(session.id));

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
