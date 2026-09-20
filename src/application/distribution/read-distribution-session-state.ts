/**
 * What every screen asks about the afternoon before it renders anything
 * (`tasks/prd-us-34-distribution-session.md` §US-34.4): whether one is running, what it has come to,
 * which was the last to end, and which groups the start form should preselect.
 *
 * One read for all of it so no screen states two answers: each summary is of the very session it is
 * reported beside, and the proposal is `proposeGroups` of the very session reported as the last
 * ended — never a second query that might have moved on.
 */

import {
  canDiscard,
  canReopen,
  proposeGroups,
  summariseSession,
  type DistributionSession,
  type SessionGroups,
  type SessionSummary,
} from "@/domain/distribution/session";
import type {
  DistributionRecordRepository,
  DistributionSessionRepository,
  ReminderLogRepository,
} from "../ports";

export interface ReadDistributionSessionStateDeps {
  readonly sessions: DistributionSessionRepository;
  readonly records: DistributionRecordRepository;
  readonly reminders: ReminderLogRepository;
}

/**
 * The afternoon under way and what it has come to, in **one** object: a screen that has a running
 * session has its figures too, so there is no state in which one of the three is known and the
 * others are not — and no screen has to guard three times to say so.
 */
export interface RunningSession {
  readonly session: DistributionSession;
  /** What ending it would close: the households served so far and what they handed over. */
  readonly summary: SessionSummary;
  /**
   * Whether it may still be thrown away, which it may only while it holds nothing (FR-7). The rule
   * is the domain's; a screen only offers or withholds the control by it.
   */
  readonly canDiscard: boolean;
}

/**
 * The afternoon that ended last and what it came to — the same three-part answer
 * {@link RunningSession} gives about the one under way, so a screen showing either reads it the
 * same way.
 */
export interface EndedSession {
  readonly session: DistributionSession;
  /** What it closed with: the households served and what they handed over. */
  readonly summary: SessionSummary;
  /**
   * Whether it may be opened up again, which only the one that ended last may and only while
   * nothing is running (FR-16). The rule is the domain's; a screen only offers or withholds the
   * control by it.
   */
  readonly canReopen: boolean;
}

export interface DistributionSessionState {
  /** The afternoon under way, or `null` between them. */
  readonly running: RunningSession | null;
  /** The afternoon that ended last — what a summary is shown of and what a reopening may address. */
  readonly lastEnded: EndedSession | null;
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
  const ended = await deps.sessions.lastEnded();

  const lastEnded =
    ended === null
      ? null
      : {
          session: ended,
          summary: summariseSession(await deps.records.listForSession(ended.id)),
          // The session appears twice because the store has just answered that it *is* the one that
          // ended last; what is left for the rule to weigh is the session running against it.
          canReopen: canReopen(ended, { mostRecentlyEnded: ended, running }),
        };
  const past = { lastEnded, proposedGroups: proposeGroups(ended) };

  if (running === null) {
    return { running: null, ...past };
  }

  const handouts = await deps.records.listForSession(running.id);
  const reminders = await deps.reminders.listForSession(running.id);
  return {
    running: {
      session: running,
      summary: summariseSession(handouts),
      canDiscard: canDiscard(running, {
        handouts: handouts.length,
        reminders: reminders.length,
      }),
    },
    ...past,
  };
}
