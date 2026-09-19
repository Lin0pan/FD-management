/**
 * Which households the running session serves, and how far through them the afternoon is (US-23).
 * A read throughout — nothing is written.
 *
 * Three decisions worth stating, each of which could plausibly have gone the other way:
 *
 * - **The groups are the session's own** (US-34.6), not the parity of the calendar week: a merged
 *   afternoon serves both, a cancelled Thursday serves nobody, and neither follows from the date.
 *   Nor do the groups follow the household on screen, so the screen never names a group nobody at
 *   the counter belongs to.
 * - **Membership is ACTIVE + BLOCKED.** A block is something the counter has to *state*; an archived
 *   household no longer holds the slot, and what a freed number looks up to is the counter's question
 *   (US-04.2).
 * - **The query is the existing `CustomerRepository.list`** — at ~240 customers this is the read
 *   `/kunden` performs on every visit. The **group** is narrowed here rather than in SQL, for
 *   `listCustomers`' reason (ADR-017).
 *
 * The tally rides with the list rather than being a second read, so the two cannot disagree about the
 * roster, and is derived on every read (§FR-8).
 */

import type { CustomerStatus } from "@/domain/customer/customer";
import { groupOf, type Group } from "@/domain/customer/group";
import { groupProgress, type Progress } from "@/domain/distribution/groupProgress";
import { servesGroup, type SessionGroups } from "@/domain/distribution/session";
import { NoDistributionSessionRunning } from "@/domain/errors";
import type {
  CustomerRepository,
  DistributionRecordRepository,
  DistributionSessionRepository,
} from "../ports";

export interface ReadGroupRosterDeps {
  readonly customers: CustomerRepository;
  readonly records: DistributionRecordRepository;
  readonly sessions: DistributionSessionRepository;
}

/** The statuses the roster covers (PRD §FR-2): blocked households belong to the group, archived not. */
const ROSTERED_STATUSES: ReadonlyArray<CustomerStatus> = ["ACTIVE", "BLOCKED"];

/**
 * One household the session serves, as the list behind the tally names it (US-23). Records are
 * joined by `customerId`, never the customer number, which is a slot another household may take
 * over (ADR-008).
 */
export interface GroupRosterMember {
  /** The surrogate id — what a record belongs to, and what the screen links by. */
  readonly customerId: number;
  /** The number staff type at the counter, and the order the list is read in. */
  readonly customerNumber: number;
  /** The household's own group, so a merged afternoon's list can say which half a row is from. */
  readonly group: Group;
  readonly firstName: string;
  readonly lastName: string;
  /** Blocked households are listed — the counter has to *state* the block — but cannot collect (US-08). */
  readonly blocked: boolean;
  /** Whether a hand-out was recorded for this household in the running session (US-05, US-34). */
  readonly servedInSession: boolean;
}

/** One served group's fraction, counted over that group's members alone. */
export interface GroupTally {
  readonly group: Group;
  readonly progress: Progress;
}

/** The session's groups, the households in them, and how far through them the afternoon is. */
export interface GroupRosterView {
  /** The groups this session serves, stated in words on screen. */
  readonly groups: SessionGroups;
  /**
   * Whether the session's groups hold no active or blocked household at all —
   * `group-progress-card.tsx` branches on it to show a sentence rather than a tally of nothing
   * (US-23).
   */
  readonly isEmpty: boolean;
  /** The households as the register answered — lowest number first, never re-sorted (§FR-3). */
  readonly members: ReadonlyArray<GroupRosterMember>;
  /**
   * How far through each served group the afternoon is, counted from {@link members} and nothing
   * else — one entry per group, RED before BLUE. Never one merged fraction: „Rot: 43 von 60 · Blau:
   * 44 von 60" is the register's own reading, and the only one that shows a group falling behind.
   */
  readonly tallies: ReadonlyArray<GroupTally>;
}

/**
 * The groups the running session serves, the households that belong to them, and its tally.
 *
 * @throws {NoDistributionSessionRunning} if no session is running — the screen does not offer the
 *   tally between afternoons, and there is nothing to count against. The screen decides not to ask;
 *   this is the answer for one that asks anyway.
 */
export async function readGroupRoster(deps: ReadGroupRosterDeps): Promise<GroupRosterView> {
  const session = await deps.sessions.findRunning();
  if (session === null) {
    throw new NoDistributionSessionRunning();
  }
  const rostered = await deps.customers.list({ statuses: ROSTERED_STATUSES });
  const households = rostered.filter((customer) =>
    servesGroup(session.groups, groupOf(customer.customerNumber)),
  );
  // The whole afternoon in one query, joined in memory: a session is ~120 households and a merged
  // one ~240, and a query apiece would make the counter's screen the slowest in the app (§FR-4).
  const servedIds = new Set(
    (await deps.records.listForSession(session.id)).map((record) => record.customerId),
  );
  const members: ReadonlyArray<GroupRosterMember> = households.map((customer) => ({
    customerId: customer.id,
    customerNumber: customer.customerNumber,
    group: groupOf(customer.customerNumber),
    firstName: customer.details.firstName,
    lastName: customer.details.lastName,
    blocked: customer.status === "BLOCKED",
    servedInSession: servedIds.has(customer.id),
  }));

  return {
    groups: session.groups,
    isEmpty: members.length === 0,
    members,
    // From the very rows the screen renders, so the summary and the marks beneath cannot disagree.
    tallies: session.groups.map((group) => ({
      group,
      progress: groupProgress(members.filter((member) => member.group === group)),
    })),
  };
}
