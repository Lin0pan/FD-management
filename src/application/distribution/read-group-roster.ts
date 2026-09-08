/**
 * Which group is collecting today, who belongs to it, and how far through the afternoon is (US-23).
 * A read throughout — nothing is written.
 *
 * Three decisions worth stating, each of which could plausibly have gone the other way:
 *
 * - **The group is the week's own**, `getWeekColour`'s `colour`, not `nextDistribution.colour`: those
 *   part company between distributions, and a screen saying "blaue Woche" over a list of red
 *   households answers a question nobody asked. Nor does it follow the household on screen, so the
 *   screen never names two groups at once.
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
import { groupOf } from "@/domain/customer/group";
import { berlinDayKey } from "@/domain/distribution/attendance";
import { groupProgress, type Progress } from "@/domain/distribution/groupProgress";
import type { WeekColour } from "@/domain/policy/settings";
import type {
  Clock,
  CustomerRepository,
  DistributionRecordRepository,
  SettingsRepository,
} from "../ports";
import { getWeekColour } from "./get-week-colour";

export interface ReadGroupRosterDeps {
  readonly customers: CustomerRepository;
  readonly settings: SettingsRepository;
  readonly records: DistributionRecordRepository;
  readonly clock: Clock;
}

/** The statuses the roster covers (PRD §FR-2): blocked households belong to the group, archived not. */
const ROSTERED_STATUSES: ReadonlyArray<CustomerStatus> = ["ACTIVE", "BLOCKED"];

/**
 * One household of the group, as the list behind the tally names it (US-23). Records are joined by
 * `customerId`, never the customer number, which is a slot another household may take over (ADR-008).
 */
export interface GroupRosterMember {
  /** The surrogate id — what a record belongs to, and what the screen links by. */
  readonly customerId: number;
  /** The number staff type at the counter, and the order the list is read in. */
  readonly customerNumber: number;
  readonly firstName: string;
  readonly lastName: string;
  /** Blocked households are listed — the counter has to *state* the block — but cannot collect (US-08). */
  readonly blocked: boolean;
  /** Whether a hand-out was recorded for this household on today's **Berlin** day (US-05). */
  readonly servedToday: boolean;
}

/** Today's group, the households in it, and how far through them the afternoon is. */
export interface GroupRosterView {
  /** The group collecting this week, stated in words on screen. */
  readonly group: WeekColour;
  /**
   * Whether the group holds no active or blocked household at all — `group-progress-card.tsx` branches
   * on it to show a sentence rather than a tally of nothing (US-23).
   */
  readonly isEmpty: boolean;
  /** The group in the order the register answered — lowest number first, never re-sorted (§FR-3). */
  readonly members: ReadonlyArray<GroupRosterMember>;
  /** How far through the group the afternoon is, counted from {@link members} and nothing else. */
  readonly progress: Progress;
}

/**
 * The group of the week being read in, the households that belong to it, and today's tally.
 *
 * @throws {NoSettingsInForce} if no settings version had taken effect today.
 * @throws {InvalidSettings} if the week anchor does not name a week of the ISO calendar.
 */
export async function readGroupRoster(deps: ReadGroupRosterDeps): Promise<GroupRosterView> {
  const week = await getWeekColour(deps);
  const group = week.colour;
  const rostered = await deps.customers.list({ statuses: ROSTERED_STATUSES });
  const households = rostered.filter((customer) => groupOf(customer.customerNumber) === group);
  // The whole afternoon in one query, joined in memory: a group is ~120 households, and a query
  // apiece would make the counter's own screen the slowest in the app (§FR-4).
  const servedIds = new Set(
    (await deps.records.listForDay(berlinDayKey(deps.clock.now()))).map(
      (record) => record.customerId,
    ),
  );
  const members: ReadonlyArray<GroupRosterMember> = households.map((customer) => ({
    customerId: customer.id,
    customerNumber: customer.customerNumber,
    firstName: customer.details.firstName,
    lastName: customer.details.lastName,
    blocked: customer.status === "BLOCKED",
    servedToday: servedIds.has(customer.id),
  }));

  return {
    group,
    isEmpty: members.length === 0,
    members,
    // From the very rows the screen renders, so the summary and the marks beneath cannot disagree.
    progress: groupProgress(members),
  };
}
