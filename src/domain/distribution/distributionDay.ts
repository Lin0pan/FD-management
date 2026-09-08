/**
 * When DF hands out food, and in which colour week (`tasks/prd-us-03-week-colour.md` §US-03.2, FR-5).
 *
 * A skipped week shifts nothing: the next distribution is the next occurrence of the configured
 * weekday, and its colour is the calendar parity of the week it falls in.
 */

import type { IsoWeekday, Settings, WeekColour } from "../policy/settings";
import { colourOf, isoWeekdayOf, startOfUtcDay } from "./weekColour";

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;

/** A distribution day and the group that collects on it. */
export interface Distribution {
  /** The calendar day, as the UTC midnight that starts it. */
  readonly date: Date;
  readonly colour: WeekColour;
}

/** Whether `date` falls on the weekday DF distributes on. The time of day is irrelevant. */
export function isDistributionDay(date: Date, weekday: IsoWeekday): boolean {
  return isoWeekdayOf(date) === weekday;
}

/**
 * The next distribution at or after `date` — today included, so the screen never tells staff
 * standing in the hall that the next distribution is in a week's time.
 *
 * @throws {InvalidSettings} if the week anchor does not name a week of the ISO calendar.
 */
export function nextDistribution(date: Date, settings: Settings): Distribution {
  const daysAhead =
    (settings.distributionWeekday - isoWeekdayOf(date) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const next = new Date(startOfUtcDay(date).getTime() + daysAhead * MS_PER_DAY);
  return { date: next, colour: colourOf(next, settings.weekAnchor) };
}
