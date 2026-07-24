/**
 * The attendance rules — may this customer be recorded today, and may a record still be corrected?
 *
 * Two facts of the day turn on one comparison: a customer may be served **once per distribution day**
 * (US-05, FR-5), and a record is correctable only on the **day it was made** (FR-7). Both are pure
 * calendar-day questions, so they live here as functions taking `today` as a parameter — the
 * duplicate check and the same-day check are then unit-tested against boundary instants in
 * milliseconds, and the counter screen and the database both defer to the same rule rather than each
 * re-deriving "the same day" (US-05.3 repeats it as a unique constraint; the UI must not be the only
 * guard, US-05.2).
 *
 * **The day is a calendar day in Europe/Berlin, not a 24-hour window and not the UTC day.** FD
 * distributes in Germany, so "today" is the wall-clock day the staff live in: a hand-out at 09:00 and
 * a correction at 16:00 are the same day, and a record entered at 23:59 is yesterday's by 00:01. The
 * rest of this module family compares *UTC* days (weekColour, distributionDay) because a week colour
 * is a property of a configured week where the minute is irrelevant; attendance is different — it
 * turns on the actual local moment a person stood at the counter, so it must follow the Berlin
 * offset, including across the March and October DST changes. `Intl` supplies that offset from the
 * timezone database; the function stays pure — its only input is the `Date` passed in.
 */

import { AlreadyServedToday } from "../errors";

/** The single field the attendance rules turn on: the instant the hand-out was recorded. */
export interface AttendanceRecord {
  readonly date: Date;
}

/** The success sentinel of {@link canRecord} — the customer has no record for today yet. */
export type Recordability = "OK" | AlreadyServedToday;

const berlinDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The calendar day `instant` falls on in Europe/Berlin, as a `YYYY-MM-DD` key safe to compare.
 *
 * Exported so the database day-key column (US-05.3) is filled by *this* rule rather than a second,
 * silently different notion of "the same day": the unique `(customerId, dayKey)` constraint that
 * backstops {@link canRecord} must agree with it exactly, including across the DST changes.
 */
export function berlinDayKey(instant: Date): string {
  return berlinDay.format(instant);
}

/**
 * Whether the customer may be recorded on `today`, given every record they already hold.
 *
 * @returns `"OK"` when no record shares `today`'s Berlin calendar day, otherwise an
 *   {@link AlreadyServedToday} carrying the date of the record already on file.
 */
export function canRecord(
  existingRecordsForCustomer: ReadonlyArray<AttendanceRecord>,
  today: Date,
): Recordability {
  const todayKey = berlinDayKey(today);
  const clash = existingRecordsForCustomer.find((record) => berlinDayKey(record.date) === todayKey);
  return clash === undefined ? "OK" : new AlreadyServedToday(clash.date);
}

/**
 * Whether `record` may still be amended or removed on `today` — true only while `today` is the same
 * Berlin calendar day the record was made on (FR-7). A record from any earlier day is immutable.
 */
export function canCorrect(record: AttendanceRecord, today: Date): boolean {
  return berlinDayKey(record.date) === berlinDayKey(today);
}
