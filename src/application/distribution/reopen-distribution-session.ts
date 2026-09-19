/**
 * Reopen the afternoon that ended last (`tasks/prd-us-34-distribution-session.md` §US-34.4), so a
 * hand-out closed a minute too early can still be corrected. Its records become amendable again and
 * ending it a second time closes them again.
 *
 * The reason **is** the record here, as it is for a block and an archival: nothing else on the row
 * says why a closed afternoon was opened up.
 *
 * The session is named by the caller rather than resolved from the store, so the screen reopens the
 * afternoon it was showing — between rendering and saving, another workstation may have ended a
 * newer one, and that session is not the one anybody asked for.
 */

import { canReopen } from "@/domain/distribution/session";
import { DistributionSessionNotReopenable, MissingAuditReason } from "@/domain/errors";
import type { AuditLog, Clock, DistributionSessionRepository } from "../ports";

/** The audit event a reopening is written under. */
const SESSION_REOPENED = "distribution.session.reopened";

/** What the entry names as changed — the one column a reopening clears. */
const REOPENED_FIELDS = ["endedAt"] as const;

export interface ReopenDistributionSessionDeps {
  readonly sessions: DistributionSessionRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface ReopenDistributionSessionInput {
  /** The session to reopen — the one the screen was showing, which must be the last that ended. */
  readonly sessionId: number;
  /** Why the afternoon is being opened up again. Required, trimmed, and shown verbatim. */
  readonly reason: string;
}

/**
 * Clear the session's end stamp and write the trail.
 *
 * @throws {MissingAuditReason} naming `distribution.session.reopened` if the reason is empty or
 *   whitespace only.
 * @throws {DistributionSessionNotReopenable} if the session is not the one that ended last, if the
 *   register does not hold it, or if another session is running.
 */
export async function reopenDistributionSession(
  deps: ReopenDistributionSessionDeps,
  { sessionId, reason }: ReopenDistributionSessionInput,
): Promise<void> {
  const now = deps.clock.now();

  const trimmed = reason.trim();
  if (trimmed === "") {
    throw new MissingAuditReason(SESSION_REOPENED);
  }

  const session = await deps.sessions.findById(sessionId);
  const context = {
    mostRecentlyEnded: await deps.sessions.lastEnded(),
    running: await deps.sessions.findRunning(),
  };
  if (session === null || !canReopen(session, context)) {
    throw new DistributionSessionNotReopenable(sessionId);
  }

  await deps.sessions.reopen(sessionId);
  await deps.audit.append({
    what: SESSION_REOPENED,
    changedFields: [...REOPENED_FIELDS],
    when: now,
    why: trimmed,
  });
}
