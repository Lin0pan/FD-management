/**
 * What every screen asks about the afternoon before it renders anything
 * (`tasks/prd-us-34-distribution-session.md` §US-34.4): whether one is running, which was the last
 * to end, and which groups the start form should preselect.
 *
 * One read for all three so no screen states two answers: the proposal is `proposeGroups` of the very
 * session reported as the last ended, never a second query that might have moved on.
 */

import {
  proposeGroups,
  type DistributionSession,
  type SessionGroups,
} from "@/domain/distribution/session";
import type { DistributionSessionRepository } from "../ports";

export interface ReadDistributionSessionStateDeps {
  readonly sessions: DistributionSessionRepository;
}

export interface DistributionSessionState {
  /** The afternoon under way, or `null` between them. */
  readonly running: DistributionSession | null;
  /** The afternoon that ended last — what a summary is shown of and what a reopening may address. */
  readonly lastEnded: DistributionSession | null;
  /**
   * The groups to preselect when the next session is started, `null` before the first has ever taken
   * place. A proposal and never a rule: deviating from it needs no reason (FR-2).
   */
  readonly proposedGroups: SessionGroups | null;
}

/** Read the state of the distribution as it stands. Nothing is written. */
export async function readDistributionSessionState(
  deps: ReadDistributionSessionStateDeps,
): Promise<DistributionSessionState> {
  const running = await deps.sessions.findRunning();
  const lastEnded = await deps.sessions.lastEnded();
  return { running, lastEnded, proposedGroups: proposeGroups(lastEnded) };
}
