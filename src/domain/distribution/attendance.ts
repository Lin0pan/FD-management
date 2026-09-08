/**
 * The attendance rules: a customer may be served **once per distribution day** (US-05, FR-5), and a
 * record is correctable only on the **day it was made** (FR-7). Both turn on one comparison, stated
 * once here so the counter screen and the database's unique day-key constraint cannot disagree.
 *
 * **The day is a calendar day in Europe/Berlin**, not a 24-hour window and not the UTC day — it
 * turns on the local moment a person stood at the counter, DST changes included. The sibling modules
 * (`weekColour`, `distributionDay`) compare UTC days instead, because a week's colour is a property
 * of a configured week where the minute is irrelevant.
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
 * The calendar day `instant` falls on in Europe/Berlin, as a comparable `YYYY-MM-DD` key.
 *
 * Exported so the database day-key column (US-05.3) is filled by *this* rule: the unique
 * `(customerId, dayKey)` constraint backstopping {@link canRecord} must agree with it exactly.
 */
export function berlinDayKey(instant: Date): string {
  return berlinDay.format(instant);
}

/**
 * The record the customer already holds for `today`'s Berlin calendar day, or `null`.
 *
 * What the counter reads to decide what to offer (US-05.4). {@link canRecord} is the same question
 * phrased for the write path, so "already served today" cannot mean two different days.
 */
export function recordForDay<T extends AttendanceRecord>(
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
  existingRecordsForCustomer: ReadonlyArray<AttendanceRecord>,
  today: Date,
): Recordability {
  const clash = recordForDay(existingRecordsForCustomer, today);
  return clash === null ? "OK" : new AlreadyServedToday(clash.date);
}

/**
 * Whether `record` may still be amended or removed on `today` — true only while `today` is the same
 * Berlin calendar day the record was made on (FR-7). A record from any earlier day is immutable.
 */
export function canCorrect(record: AttendanceRecord, today: Date): boolean {
  return berlinDayKey(record.date) === berlinDayKey(today);
}
