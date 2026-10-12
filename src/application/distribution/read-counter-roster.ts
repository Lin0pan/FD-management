/**
 * The running session's households as the list under the counter's mask shows them (US-41.2): the
 * Kundenliste's own rows, narrowed to the session's groups, plus whether each collected at it. A read
 * throughout — nothing is written.
 *
 * The rows are `listCustomers`' and nothing else's, so the two lists cannot tell different stories
 * about one household. Archived households hold no slot and are left off; blocked ones are listed,
 * because the counter has to state the block (US-23). The groups are the session's own (US-34.6).
 */

import type { Group } from "@/domain/customer/group";
import { groupProgress, type Progress } from "@/domain/distribution/groupProgress";
import { servesGroup, type SessionGroups } from "@/domain/distribution/session";
import { NoDistributionSessionRunning } from "@/domain/errors";
import {
  listCustomers,
  type CustomerListRow,
  type ListCustomersDeps,
} from "../customers/list-customers";
import type { DistributionRecordRepository, DistributionSessionRepository } from "../ports";

export interface ReadCounterRosterDeps extends ListCustomersDeps {
  readonly records: DistributionRecordRepository;
  readonly sessions: DistributionSessionRepository;
}

/** One served group's fraction, counted over that group's households alone. */
export interface GroupTally {
  readonly group: Group;
  readonly progress: Progress;
}

/** One household of the session, exactly as the Kundenliste shows it, and whether it has collected. */
export type CounterRosterRow = CustomerListRow & {
  /** Whether a hand-out was recorded for this household in the running session (US-05, US-34). */
  readonly servedInSession: boolean;
};

export interface CounterRosterView {
  /** The groups this session serves, stated in words on screen. */
  readonly groups: SessionGroups;
  /** Whether the session's groups hold no active or blocked household at all. */
  readonly isEmpty: boolean;
  /** Lowest customer number first, in the order `listCustomers` answered. */
  readonly rows: ReadonlyArray<CounterRosterRow>;
  /** One entry per served group, RED before BLUE — never one merged fraction (US-34.6). */
  readonly tallies: ReadonlyArray<GroupTally>;
}

/**
 * The ids of the households that collected at `sessionId` — the whole afternoon in one query, joined
 * in memory by the surrogate id, never the customer number (ADR-008, §FR-4).
 */
export async function servedInSession(
  records: DistributionRecordRepository,
  sessionId: number,
): Promise<ReadonlySet<number>> {
  return new Set((await records.listForSession(sessionId)).map((record) => record.customerId));
}

/**
 * The running session's non-archived households, their rows and the session's tally.
 *
 * @throws {NoDistributionSessionRunning} if no session is running — there is nothing to count against.
 * @throws {NoSettingsInForce} if no settings version had taken effect by today — the rows are priced.
 */
export async function readCounterRoster(deps: ReadCounterRosterDeps): Promise<CounterRosterView> {
  const session = await deps.sessions.findRunning();
  if (session === null) {
    throw new NoDistributionSessionRunning();
  }
  const [{ rows: register }, served] = await Promise.all([
    listCustomers(deps, {}),
    servedInSession(deps.records, session.id),
  ]);
  const rows: ReadonlyArray<CounterRosterRow> = register
    .filter((row) => servesGroup(session.groups, row.group))
    .map((row) => ({ ...row, servedInSession: served.has(row.customerId) }));

  return {
    groups: session.groups,
    isEmpty: rows.length === 0,
    rows,
    // From the very rows the screen renders, so the summary and the marks beneath cannot disagree.
    tallies: session.groups.map((group) => ({
      group,
      progress: groupProgress(
        rows
          .filter((row) => row.group === group)
          .map((row) => ({
            blocked: row.status === "BLOCKED",
            servedInSession: row.servedInSession,
          })),
      ),
    })),
  };
}
