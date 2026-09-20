/**
 * Start the afternoon (`tasks/prd-us-34-distribution-session.md` §US-34.4). A staff member presses
 * the button, names the group or groups being served, and from that instant every hand-out and every
 * reminder belongs to the session this returns.
 *
 * **Nothing is written to the audit log** (FR-13). The log never shows a session that began and never
 * ended: the one entry is written when it ends, where it can name both instants at once.
 */

import type { Group } from "@/domain/customer/group";
import { createSessionGroups, type DistributionSession } from "@/domain/distribution/session";
import { DistributionSessionAlreadyRunning } from "@/domain/errors";
import type { Clock, DistributionSessionRepository } from "../ports";

export interface StartDistributionSessionDeps {
  readonly sessions: DistributionSessionRepository;
  readonly clock: Clock;
}

export interface StartDistributionSessionInput {
  /**
   * The groups the afternoon serves, as the form sent them. `createSessionGroups` puts them in order
   * here rather than in the component, so a session serving nobody is refused where the rule lives.
   */
  readonly groups: ReadonlyArray<Group>;
}

/**
 * Start a session and hand it back as stored.
 *
 * @throws {DistributionSessionAlreadyRunning} if another session was already running.
 * @throws {MissingRequiredField} naming `groups` if no group was chosen.
 */
export async function startDistributionSession(
  deps: StartDistributionSessionDeps,
  { groups }: StartDistributionSessionInput,
): Promise<DistributionSession> {
  // The running session first: told that the form is incomplete, a staff member would fix the form
  // when what is actually in their way is the afternoon somebody else has under way.
  const running = await deps.sessions.findRunning();
  if (running !== null) {
    throw new DistributionSessionAlreadyRunning(running.id);
  }

  // The store is asked anyway and is the final authority, exactly as it is for a customer number:
  // two workstations pressing the button in the same second are settled by the database (US-34.3).
  return deps.sessions.start(createSessionGroups(groups), deps.clock.now());
}
