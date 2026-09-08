/**
 * How many of their **own** distributions in a row a customer has missed (US-10.1) — displayed only.
 * No threshold lives here and no action follows from any value (PRD §5): three is emphasis on a
 * screen, never an automatic archive.
 *
 * A no-show is an **absence of a record**, so the history alone cannot answer it: the history says
 * which days the customer came, the calendar which days were theirs. The one place the week-colour
 * rule (US-03) and the attendance history (US-05) meet.
 *
 * Three boundaries decide what the number means:
 *
 * - **Only the customer's own colour counts** — the other group's weeks were never theirs, and
 *   counting them would double every figure.
 * - **Today never counts** — a distribution they can still walk into is not a miss.
 * - **The registration day never counts** — whether that day's hand-out had finished when the card
 *   was handed over is nowhere on record.
 *
 * A **block** is deliberately *not* excluded (PRD §9, still to be confirmed with DF): excluding it
 * would hide the pattern the count exists to show, and would need a block *history* the record does
 * not keep. If DF decides otherwise the periods come in as a parameter; nothing here may reach.
 */

import type { Group } from "../customer/group";
import type { Settings } from "../policy/settings";
import { type AttendanceRecord, berlinDayKey } from "./attendance";
import { colourOf, isoWeekdayOf, startOfUtcDay } from "./weekColour";

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
/** One turn of the two-week cycle — the gap between two distributions of the same colour. */
const MS_PER_CYCLE = 2 * DAYS_PER_WEEK * MS_PER_DAY;

/** Everything the count turns on. */
export interface NoShowInput {
  /**
   * The distribution records of **this customer only**, in any order. A record's presence is the
   * attendance: a no-show writes no row at all (`distributionRecord.ts`).
   */
  readonly records: ReadonlyArray<AttendanceRecord>;
  /** The group the customer is in **now** — a move takes their schedule with it (PRD §US-10.1). */
  readonly customerGroup: Group;
  /** The day the household joined the register; no distribution before it was theirs to attend. */
  readonly registeredOn: Date;
  /** The policy in force, for the distribution weekday and the week-colour anchor. */
  readonly settings: Settings;
  /** The day the count is read on. Today's own distribution is never counted — see above. */
  readonly today: Date;
}

/**
 * The most recent distribution of the customer's own colour lying strictly **before** `today`.
 *
 * Deliberately not a `previousDistribution` in `distributionDay.ts`: `nextDistribution` there
 * includes today, and a sibling that excluded it would be a trap. The exclusion belongs to this rule.
 */
function lastOwnDistributionBefore(today: Date, group: Group, settings: Settings): Date {
  const daysSinceWeekday =
    (isoWeekdayOf(today) - settings.distributionWeekday + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  // On a distribution day itself the previous one is a full week back, not today.
  const daysBack = daysSinceWeekday === 0 ? DAYS_PER_WEEK : daysSinceWeekday;
  const previous = new Date(startOfUtcDay(today).getTime() - daysBack * MS_PER_DAY);
  if (colourOf(previous, settings.weekAnchor) === group) {
    return previous;
  }
  // That one belonged to the other group, so the customer's own is the week before it.
  return new Date(previous.getTime() - DAYS_PER_WEEK * MS_PER_DAY);
}

/**
 * How many of the customer's own distributions they missed in an unbroken run ending before `today`.
 *
 * Walks backwards a cycle at a time, stopping at the first own distribution they attended or at
 * their registration day. `0` means "came last time" as well as "has not seen a distribution yet" —
 * the same thing as far as archiving goes.
 *
 * @throws {InvalidSettings} if the week anchor does not name a week of the ISO calendar.
 */
export function consecutiveNoShows(input: NoShowInput): number {
  const { records, customerGroup, registeredOn, settings, today } = input;
  // Matched by Berlin calendar day, as the once-per-day attendance rule counts, so a hand-out
  // recorded at 23:45 belongs to the day the staff member lived through.
  const attendedDays = new Set(records.map((record) => berlinDayKey(record.date)));
  const registrationDay = startOfUtcDay(registeredOn).getTime();

  let misses = 0;
  let candidate = lastOwnDistributionBefore(today, customerGroup, settings);
  while (candidate.getTime() > registrationDay) {
    if (attendedDays.has(berlinDayKey(candidate))) {
      return misses;
    }
    misses += 1;
    candidate = new Date(candidate.getTime() - MS_PER_CYCLE);
  }
  return misses;
}
