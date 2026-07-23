/**
 * Which group collects, on any day FD asks about.
 *
 * The one seam the distribution screen reads: it answers for today by default and for a looked-up
 * date on request, and it carries everything the banner states — the colour, the ISO week to check
 * against a wall calendar, whether today is a distribution day and, when it is not, when the next
 * one is (tasks/prd-us-03-week-colour.md §US-03.3, FR-1, FR-4, FR-5).
 *
 * Nothing is stored. A week colour is a function of the date and the anchor, so there are no week
 * rows to write and `SettingsRepository` is the only port this needs.
 */

import {
  isDistributionDay,
  nextDistribution as nextDistributionOf,
  type Distribution,
} from "@/domain/distribution/distributionDay";
import { colourOf, isoWeekOf, startOfUtcDay } from "@/domain/distribution/weekColour";
import { resolveSettingsAt, type WeekColour } from "@/domain/policy/settings";
import type { Clock, SettingsRepository } from "../ports";

export interface GetWeekColourDeps {
  readonly settings: SettingsRepository;
  readonly clock: Clock;
}

/** What the distribution screen states about one calendar day. */
export interface WeekColourView {
  /** The day that was looked up, as the UTC midnight that starts it. */
  readonly date: Date;
  /** That day's ISO week, as `2026-W30`. */
  readonly isoWeek: string;
  /** The group collecting in that week. */
  readonly colour: WeekColour;
  /** Whether FD distributes on that day. */
  readonly isDistributionDay: boolean;
  /** The next distribution at or after that day — the day itself when it is one. */
  readonly nextDistribution: Distribution;
}

/**
 * The week colour for `date`, or for the clock's today when no date is given.
 *
 * The settings are resolved **at the looked-up date**, not at today: FD may re-anchor the
 * alternation, and a lookup for a past week has to answer with the colour that week actually had
 * (FR-6). That is also why this reads history rather than `readCurrentSettings`.
 *
 * @throws {NoSettingsInForce} if no version had taken effect by that date.
 * @throws {InvalidSettings} if the week anchor does not name a week of the ISO calendar.
 */
export async function getWeekColour(deps: GetWeekColourDeps, date?: Date): Promise<WeekColourView> {
  // Settings are resolved at the *instant* asked about, not at the start of its day: a change FD
  // saves this morning is in force this morning. Only the calendar arithmetic normalises to a day.
  const at = date ?? deps.clock.now();
  const day = startOfUtcDay(at);
  const settings = resolveSettingsAt(await deps.settings.listVersions(), at);
  return {
    date: day,
    isoWeek: isoWeekOf(day),
    colour: colourOf(day, settings.weekAnchor),
    isDistributionDay: isDistributionDay(day, settings.distributionWeekday),
    nextDistribution: nextDistributionOf(day, settings),
  };
}
