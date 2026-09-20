/**
 * Throw away a session started by mistake (`tasks/prd-us-34-distribution-session.md` §US-34.4).
 *
 * **Nothing is written to the audit log** (FR-7): a misclick is not a state change DF should have to
 * account for. That is exactly why it is only available while the afternoon is still empty — once
 * anybody has been served, the session is *ended* instead, and ending leaves the record ending leaves.
 */

import { canDiscard } from "@/domain/distribution/session";
import { DistributionSessionNotEmpty, NoDistributionSessionRunning } from "@/domain/errors";
import type {
  Clock,
  DistributionRecordRepository,
  DistributionSessionRepository,
  ReminderLogRepository,
} from "../ports";

export interface DiscardDistributionSessionDeps {
  readonly sessions: DistributionSessionRepository;
  readonly records: DistributionRecordRepository;
  readonly reminders: ReminderLogRepository;
  readonly clock: Clock;
}

/**
 * Discard the running session, which every read then stops seeing.
 *
 * @throws {NoDistributionSessionRunning} if no session is running.
 * @throws {DistributionSessionNotEmpty} if the session holds a hand-out or a reminder.
 */
export async function discardDistributionSession(
  deps: DiscardDistributionSessionDeps,
): Promise<void> {
  const session = await deps.sessions.findRunning();
  if (session === null) {
    throw new NoDistributionSessionRunning();
  }

  // Counted from the rows themselves rather than from a flag on the session: a flag would be a
  // second answer to a question the hand-outs already answer.
  const handouts = await deps.records.listForSession(session.id);
  const reminders = await deps.reminders.listForSession(session.id);
  const contents = { handouts: handouts.length, reminders: reminders.length };
  if (!canDiscard(session, contents)) {
    throw new DistributionSessionNotEmpty(session.id, contents.handouts, contents.reminders);
  }

  await deps.sessions.discard(session.id, deps.clock.now());
}
