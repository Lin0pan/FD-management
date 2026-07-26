/**
 * How many of their **own** distributions in a row a customer has missed (US-10.1).
 *
 * Archiving is always a human decision, but it has two triggers, and this is one of them: a household
 * that has quietly stopped coming. FD cannot see that in the Excel sheet today — it would mean
 * scanning a row of week columns by eye — so the count is derived here and simply *displayed*. There
 * is no threshold in this module and no action follows from any value it returns (PRD §5): three is
 * emphasis on a screen, never an automatic archive.
 *
 * A no-show is an **absence of a record**, so it cannot be read off the history alone: the history says
 * which days the customer came, and the calendar says which days were theirs to come to. This is the
 * one place where the week-colour rule (US-03) and the attendance history (US-05) meet.
 *
 * Three boundaries decide what the number means, and each is a deliberate choice:
 *
 * - **Only the customer's own colour counts.** The other group's weeks were never theirs, so they are
 *   not candidates — otherwise every count would double.
 * - **Today never counts.** A distribution the customer is still able to walk into is not a miss; a
 *   count that included it would read "1 no-show" to the staff member serving them.
 * - **The registration day never counts.** The card is handed over at registration, and whether that
 *   day's hand-out had already finished is nowhere on record. Counting it would produce a miss staff
 *   cannot check against anything.
 *
 * A **block** is *not* excluded (PRD §9, still to be confirmed with FD): weeks in which the customer
 * was blocked are counted like any other. Excluding them would hide the pattern the count exists to
 * show, and it would need a block *history* — which the customer record does not keep, only the
 * current reason. If FD decides otherwise, the periods have to come in as a parameter; nothing here
 * may reach for them.
 *
 * The module is pure: `today`, `settings` and `registeredOn` are parameters, never the wall clock, and
 * it does no I/O — the application layer loads the customer's records and resolves the settings first.
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
 * The most recent distribution of the customer's own colour that lies strictly **before** `today`.
 *
 * Deliberately not a `previousDistribution` in `distributionDay.ts`: `nextDistribution` there includes
 * today, and a sibling that excluded it would be a trap for the next reader. The exclusion belongs to
 * this rule, so it stays here.
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
 * Counting walks backwards one cycle at a time and stops at the first own distribution the customer
 * attended, or at their registration day, whichever comes first. `0` therefore means "came last time"
 * as well as "has not seen a distribution yet" — the two are the same as far as archiving goes.
 *
 * @throws {InvalidSettings} if the week anchor does not name a week of the ISO calendar.
 */
export function consecutiveNoShows(input: NoShowInput): number {
  const { records, customerGroup, registeredOn, settings, today } = input;
  // Matched by Europe/Berlin calendar day — the same notion of "the day" the once-per-day attendance
  // rule uses, so a hand-out recorded at 23:45 belongs to the day the staff member lived through.
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
