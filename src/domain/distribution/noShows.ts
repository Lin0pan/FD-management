/**
 * How many of their **own** distributions in a row a customer has missed (US-10.1) — displayed only.
 * No threshold lives here and no action follows from any value (PRD §5): three is emphasis on a
 * screen, never an automatic archive.
 *
 * A no-show is an **absence of a record**, so the history alone cannot answer it: the history says
 * which afternoons the household collected at, the session list which afternoons there were. A
 * session counts against a household when all four hold (US-36, D-1) — it has **ended**, its groups
 * **include** the household's group, it **started after** they joined the register, and it holds no
 * hand-out for them.
 *
 * A **block** is deliberately *not* excluded (PRD §9, still to be confirmed with DF): excluding it
 * would hide the pattern the count exists to show, and would need a block *history* the record does
 * not keep. If DF decides otherwise the periods come in as a parameter; nothing here may reach.
 */

import type { Group } from "../customer/group";
import { isRunning, servesGroup, type DistributionSession } from "./session";

/** Everything the count turns on. */
export interface NoShowInput {
  /**
   * The afternoons that took place, **newest first** — the order the walk stops in. A discarded
   * session is not one of them: the store filters it out, so this rule knows only two states.
   */
  readonly sessions: ReadonlyArray<DistributionSession>;
  /** The sessions **this household** collected at, in any order — their hand-outs' session ids. */
  readonly attendedSessionIds: ReadonlyArray<number>;
  /** The group the customer is in **now** — a move takes their schedule with it (PRD §US-10.1). */
  readonly customerGroup: Group;
  /**
   * The **instant** the household joined the register — their first card's issue, not a midnight.
   * An afternoon already under way when they registered was never theirs to attend.
   */
  readonly registeredOn: Date;
}

/** Whether the household was expected at this afternoon — the four conditions but the last. */
function wasTheirs(session: DistributionSession, group: Group, registeredOn: Date): boolean {
  return (
    !isRunning(session) &&
    servesGroup(session.groups, group) &&
    session.startedAt.getTime() > registeredOn.getTime()
  );
}

/**
 * How many of the household's own sessions they missed in an unbroken run ending at the last one.
 *
 * Walks the ended sessions newest first, stopping at the first one they collected at or at their
 * registration. `0` means "came last time" as well as "has not seen a session yet" — the same thing
 * as far as archiving goes.
 */
export function consecutiveNoShows(input: NoShowInput): number {
  const { sessions, attendedSessionIds, customerGroup, registeredOn } = input;
  const attended = new Set(attendedSessionIds);

  let misses = 0;
  for (const session of sessions) {
    if (!wasTheirs(session, customerGroup, registeredOn)) {
      continue;
    }
    if (attended.has(session.id)) {
      return misses;
    }
    misses += 1;
  }
  return misses;
}
