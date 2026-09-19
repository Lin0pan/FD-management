/**
 * The distribution session — the afternoon that actually took place (US-34). A staff member starts
 * one, names the group(s) it serves and ends it; every hand-out and every reminder belongs to
 * exactly one. The rules a session has of its own live here: which groups it may serve, which group
 * is proposed next, whether it may be discarded or reopened.
 *
 * Nothing in here reads a clock or a calendar. A session's instants are stamped by the application
 * layer from the injected `Clock`, and the group it serves is a choice, not a derivation.
 */

import { GROUPS, type Group } from "../customer/group";
import { InvalidSessionGroups, MissingRequiredField } from "../errors";

/**
 * The groups one session serves: RED, BLUE or both, in that order and without repetition. Only
 * {@link createSessionGroups} makes one, so readers may rely on both — the type is the invariant, as
 * `EggRule` is.
 */
export type SessionGroups = ReadonlyArray<Group>;

/** A session as every reader sees it. A discarded one is filtered out by the store and never here. */
export interface DistributionSession {
  readonly id: number;
  readonly startedAt: Date;
  /** `null` while the session is running. Only a human ever fills it in (FR-5). */
  readonly endedAt: Date | null;
  readonly groups: SessionGroups;
}

/** What {@link canDiscard} weighs: how much the session already holds. */
export interface SessionContents {
  readonly handouts: number;
  readonly reminders: number;
}

/** What {@link canReopen} weighs, named rather than positional so two sessions cannot be swapped. */
export interface ReopenContext {
  readonly mostRecentlyEnded: DistributionSession | null;
  readonly running: DistributionSession | null;
}

/** How the group list is flattened for SQLite, which has no array column type (`audit-log.ts`). */
const GROUP_SEPARATOR = ",";

function isGroup(value: string): value is Group {
  return GROUPS.includes(value as Group);
}

/**
 * The groups a session serves, de-duplicated and ordered RED before BLUE — the order `GROUPS`
 * states and the Kundenliste's group balance prints.
 *
 * @throws {MissingRequiredField} naming `groups` when no group was chosen: a session serving nobody
 *   would refuse every household that came to it.
 */
export function createSessionGroups(groups: ReadonlyArray<Group>): SessionGroups {
  const chosen = GROUPS.filter((group) => groups.includes(group));
  if (chosen.length === 0) {
    throw new MissingRequiredField("groups");
  }
  return chosen;
}

/** The groups as one column value: `RED`, `BLUE` or `RED,BLUE`. */
export function formatSessionGroups(groups: SessionGroups): string {
  return groups.join(GROUP_SEPARATOR);
}

/**
 * The groups a stored column value names.
 *
 * @throws {InvalidSessionGroups} carrying the value, because it re-enters the domain from a column
 *   and nothing upstream of here has vouched for it.
 */
export function parseSessionGroups(stored: string): SessionGroups {
  const names = stored.split(GROUP_SEPARATOR);
  if (!names.every(isGroup)) {
    throw new InvalidSessionGroups(stored);
  }
  return createSessionGroups(names);
}

/** Whether this session serves `group` — the one question the counter asks of a session. */
export function servesGroup(groups: SessionGroups, group: Group): boolean {
  return groups.includes(group);
}

/** Whether the session is still running. Nothing but a person ever makes this false (FR-5). */
export function isRunning(session: DistributionSession): boolean {
  return session.endedAt === null;
}

/**
 * The groups to preselect when the next session is started: the group that was not up last time,
 * both again when both were, `null` when no session is on record.
 *
 * A proposal and never a rule — deviating needs no reason (FR-2). It is what carries a merged period
 * forward by itself and what stops a cancelled afternoon shifting the cycle, because it follows the
 * session that took place rather than the calendar.
 */
export function proposeGroups(lastSession: DistributionSession | null): SessionGroups | null {
  if (lastSession === null) {
    return null;
  }
  // A session that served both groups leaves nothing "not up", and both are proposed again.
  const notUpLastTime = GROUPS.filter((group) => !servesGroup(lastSession.groups, group));
  return createSessionGroups(notUpLastTime.length === 0 ? GROUPS : notUpLastTime);
}

/**
 * Whether the session may be discarded: only while it is running and holds neither a hand-out nor a
 * reminder (FR-7). Discarding is the undo of a misclick, so it leaves no audit entry — which is why
 * a session anybody was served at is ended instead.
 *
 * The counts are passed in; this rule does not know what a hand-out is.
 */
export function canDiscard(session: DistributionSession, contents: SessionContents): boolean {
  return isRunning(session) && contents.handouts === 0 && contents.reminders === 0;
}

/**
 * Whether the session may be reopened: only the one that ended last, and only while nothing is
 * running (FR-16). Every older session stays closed for good.
 */
export function canReopen(session: DistributionSession, context: ReopenContext): boolean {
  return context.running === null && context.mostRecentlyEnded?.id === session.id;
}
