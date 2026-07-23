/**
 * The colour of a distribution week.
 *
 * FD splits its customers into a RED and a BLUE group and the two collect in alternating weeks. The
 * colour is **derived from the calendar** by strict alternation from one configured anchor week, not
 * typed in per week (tasks/prd-us-03-week-colour.md §FR-2): a per-week table could hold two RED weeks
 * in a row, and FD considers that unfair. Here it is impossible by construction — two dates seven
 * days apart always land on opposite parities of the same count.
 *
 * All arithmetic uses **ISO-8601 week numbering**: a week runs Monday (ISO weekday 1) to Sunday (7),
 * and week 1 of an ISO year is the week containing 4 January — which is why a date in late December
 * can belong to the next ISO year and a date in early January to the previous one. That off-by-one
 * is the classic source of bugs here, so the module works on UTC day boundaries throughout and never
 * on local time or on raw timestamps.
 *
 * This module is pure: dates are parameters, never `new Date()`.
 */

import { InvalidSettings } from "../errors";
import type { WeekAnchor, WeekColour } from "../policy/settings";

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** `2026-W02` — the shape an anchor week is written in. */
const ISO_WEEK = /^(\d{4})-W(\d{2})$/;

/**
 * The instant of the UTC day a date falls on. A week colour is a property of a calendar day, so the
 * time of day must not decide it — otherwise a distribution recorded at 23:59 could report a
 * different colour from one recorded at 00:01 the same morning.
 */
function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** ISO weekday of a UTC day instant: Monday = 1 … Sunday = 7. */
function isoWeekday(dayUtc: number): number {
  return ((new Date(dayUtc).getUTCDay() + 6) % 7) + 1;
}

/** The UTC instant of the Monday that starts the ISO week containing `date`. */
function mondayOf(date: Date): number {
  const day = utcDay(date);
  return day - (isoWeekday(day) - 1) * MS_PER_DAY;
}

/**
 * The ISO year and week of the week starting at `monday`.
 *
 * The ISO year of a week is the calendar year of its **Thursday** — the definition that makes "week
 * 1 contains 4 January" and the December/January crossovers work out.
 */
function isoYearAndWeek(monday: number): { year: number; week: number } {
  const thursday = monday + 3 * MS_PER_DAY;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / MS_PER_WEEK) + 1;
  return { year, week };
}

/** How many weeks the given ISO year has — 52 or 53. 28 December always falls in the last one. */
function weeksInIsoYear(year: number): number {
  return isoYearAndWeek(mondayOf(new Date(Date.UTC(year, 11, 28)))).week;
}

/**
 * The ISO week a date falls in, as `2026-W30` — what the screen shows next to a looked-up colour so
 * staff can check it against a wall calendar.
 */
export function isoWeekOf(date: Date): string {
  const { year, week } = isoYearAndWeek(mondayOf(date));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * The UTC instant of the Monday that starts the named ISO week.
 *
 * `createSettings` already checks the *shape* of an anchor; this checks that the calendar actually
 * has that week, which the shape cannot tell — 2025 has 52 weeks, so `2025-W53` is well-formed and
 * means nothing. Both report `InvalidSettings` against the same field, so the settings screen marks
 * the same input either way.
 *
 * @throws {InvalidSettings} if the anchor is malformed or names a week that does not exist.
 */
function mondayOfIsoWeek(isoWeek: string): number {
  const match = ISO_WEEK.exec(isoWeek);
  if (match === null) {
    throw new InvalidSettings(
      "weekAnchor.isoWeek",
      `must be an ISO week such as 2026-W02, received ${isoWeek}`,
    );
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > weeksInIsoYear(year)) {
    throw new InvalidSettings(
      "weekAnchor.isoWeek",
      `must name a week the ISO calendar has, and ${isoWeek} does not exist`,
    );
  }
  // 4 January is in week 1 of its ISO year by definition, whatever weekday it falls on.
  const firstMonday = mondayOf(new Date(Date.UTC(year, 0, 4)));
  return firstMonday + (week - 1) * MS_PER_WEEK;
}

/** The other half of the cycle. */
function otherColour(colour: WeekColour): WeekColour {
  return colour === "RED" ? "BLUE" : "RED";
}

/**
 * The colour of the week `date` falls in, counting alternately out from `anchor`.
 *
 * Total in both directions: the week difference is negative for a date before the anchor, and the
 * parity is taken with a modulo that stays non-negative — a lookup for a week before FD configured
 * the anchor answers rather than failing.
 *
 * @throws {InvalidSettings} if the anchor does not name a week of the ISO calendar.
 */
export function colourOf(date: Date, anchor: WeekAnchor): WeekColour {
  const weeksFromAnchor = (mondayOf(date) - mondayOfIsoWeek(anchor.isoWeek)) / MS_PER_WEEK;
  const parity = ((weeksFromAnchor % 2) + 2) % 2;
  return parity === 0 ? anchor.colour : otherColour(anchor.colour);
}
