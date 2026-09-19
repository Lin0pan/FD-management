/**
 * The calendar attendance rules — once per Berlin day, correctable on the day it was made (US-05,
 * FR-5 and FR-7) — kept alive for exactly one iteration.
 *
 * **US-34.5 deletes this file** along with its last callers: `recordAttendance`, `lookupCustomer`
 * and `correctAttendance` move onto the session rules in `attendance.ts` the moment a record carries
 * a `sessionId` to ask about (US-34.3). Nothing new may call it, and the rules here are the ones
 * that shipped — the session is not being approximated by a day.
 */

import { AlreadyServedToday } from "../errors";
import { berlinDayKey } from "./attendance";

/** The single field the calendar rules turn on: the instant the hand-out was recorded. */
export interface DayAttendanceRecord {
  readonly date: Date;
}

/** The success sentinel of {@link canRecord} — the customer has no record for today yet. */
export type Recordability = "OK" | AlreadyServedToday;

/** The record the customer already holds for `today`'s Berlin calendar day, or `null`. */
export function recordForDay<T extends DayAttendanceRecord>(
  recordsForCustomer: ReadonlyArray<T>,
  today: Date,
): T | null {
  const todayKey = berlinDayKey(today);
  return recordsForCustomer.find((record) => berlinDayKey(record.date) === todayKey) ?? null;
}

/**
 * Whether the customer may be recorded on `today`, given every record they already hold.
 *
 * @returns `"OK"` when no record shares `today`'s Berlin calendar day, otherwise an
 *   {@link AlreadyServedToday} carrying the date of the record already on file.
 */
export function canRecord(
  existingRecordsForCustomer: ReadonlyArray<DayAttendanceRecord>,
  today: Date,
): Recordability {
  const clash = recordForDay(existingRecordsForCustomer, today);
  return clash === null ? "OK" : new AlreadyServedToday(clash.date);
}

/**
 * Whether `record` may still be amended or removed on `today` — true only while `today` is the same
 * Berlin calendar day the record was made on. A record from any earlier day is immutable.
 */
export function canCorrect(record: DayAttendanceRecord, today: Date): boolean {
  return berlinDayKey(record.date) === berlinDayKey(today);
}
