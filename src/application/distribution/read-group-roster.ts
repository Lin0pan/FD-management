/**
 * Which group is collecting today, who belongs to it, and how far through the afternoon is (US-23).
 *
 * This use case was written for US-21's walk controls — the two buttons that stepped through the
 * group in customer-number order beside the number field. **US-32 withdrew the walk**: DF call
 * households in blocks ("everyone from 1 to 30 now") and serve them in whatever order they turn up,
 * so the next number is almost never the next person. The roster **outlived** it. What it is for now
 * is US-23's tally and the list beneath it: which households belong to today's group, and which of
 * them have already collected.
 *
 * Three decisions are worth stating, because each could plausibly have gone the other way:
 *
 * - **The group read is the week's own**, `getWeekColour`'s `colour` — the one the banner badges
 *   beside the calendar week, and on a distribution day necessarily the group being served. It is
 *   deliberately *not* `nextDistribution.colour`: those part company on the days between a
 *   distribution and the next one, and a screen that says "blaue Woche" while its list names red
 *   households is answering a question nobody asked. It does not follow the group of the household on
 *   screen either, so the screen never names two groups at once.
 * - **Membership is ACTIVE + BLOCKED.** A blocked household is listed because a block is something
 *   the counter has to *state* — the verdict is the whole point of stopping at them — while an
 *   archived one is not, because it no longer holds the slot. What a freed number looks up to is the
 *   counter's own question (US-04.2), not the roster's.
 * - **The membership query is the existing `CustomerRepository.list`**, which filters by status and
 *   answers lowest customer number first. No port method was added: at DF's ~240 customers this is
 *   the same read `/kunden` performs on every visit. The **group** is narrowed here rather than in
 *   the query, because a group is the parity of a customer number (`groupOf`, US-31) and SQLite has
 *   no `% 2` in a `WHERE` clause — the same reason `listCustomers` narrows its own group filter.
 *
 * The tally is one question with the list — *which households belong to today's group* — with one
 * fact added per household, so it is one use case rather than two reads that could disagree about
 * the roster. It is **derived on every read** from today's records; nothing about it is stored
 * (§FR-8).
 *
 * Nothing is written — no record, no reminder, no status change and no audit entry. The roster is a
 * read, like the lookup beside it (US-04, FR-4).
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

/**
 * The statuses the roster covers (PRD §FR-2).
 *
 * Blocked households belong to the group and are listed; archived ones no longer hold the slot and
 * are not.
 */
const ROSTERED_STATUSES: ReadonlyArray<CustomerStatus> = ["ACTIVE", "BLOCKED"];

/**
 * One household of the group, as the list behind the tally names it (US-23).
 *
 * `customerId` is the surrogate id, and it is what the day's records are joined by — never the
 * customer number, which is a slot attribute an archived household releases and a new one takes over
 * (US-10). `blocked` and `servedToday` are the two flags {@link groupProgress} counts, which is why
 * this shape is the tally's input as it stands.
 */
export interface GroupRosterMember {
  /** The surrogate id — what a record belongs to, and what the screen links by nothing else. */
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
   * Whether the group holds no active or blocked household at all. It reads as walk vocabulary and
   * is not: `group-progress-card.tsx` branches on it for the group's own empty state (US-23), which
   * is a sentence rather than a tally of nothing.
   */
  readonly isEmpty: boolean;
  /**
   * Every household of the group in the order the register answered — lowest customer number first.
   * Nothing here re-sorts it (US-23, §FR-3).
   */
  readonly members: ReadonlyArray<GroupRosterMember>;
  /** How far through the group the afternoon is, counted from {@link members} and nothing else. */
  readonly progress: Progress;
}

/**
 * The group of the week being read in, the households that belong to it, and today's tally.
 *
 * @throws {NoSettingsInForce} if no settings version had taken effect today — the same failure the
 *   banner already has, on the same screen.
 * @throws {InvalidSettings} if the week anchor does not name a week of the ISO calendar.
 */
export async function readGroupRoster(deps: ReadGroupRosterDeps): Promise<GroupRosterView> {
  const week = await getWeekColour(deps);
  const group = week.colour;
  const rostered = await deps.customers.list({ statuses: ROSTERED_STATUSES });
  const households = rostered.filter((customer) => groupOf(customer.customerNumber) === group);
  // The whole afternoon in one query, then joined in memory: a group is ~120 households, and a query
  // apiece would make the counter's own screen the slowest in the app (US-23, §FR-4).
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
    // Counted once, from the very rows the screen renders — so the summary and the marks beneath it
    // cannot tell different stories.
    progress: groupProgress(members),
  };
}
