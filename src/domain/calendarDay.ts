/**
 * A calendar day as DF write one: `TT.MM.JJJJ`. The counterpart of `money.ts` — the one place text
 * becomes a day, strict rather than forgiving, failing with a typed error rather than guessing.
 *
 * These were `<input type="date">` until ADR-013: that control takes its segment order from the
 * operating system rather than the page, and Chromium silently clamps an out-of-range month.
 *
 * A day is held as midnight **UTC**, which is how the domain compares birthdates (`composition`) and
 * how SQLite stores them; reading one back in a local zone puts a birthday on the day before.
 */

import { InvalidCalendarDay } from "./errors";

/** Exactly two digits, a dot, two digits, a dot, four digits. No other spelling of a day. */
const GERMAN_DAY = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/** Days in each month, January first; February is decided by {@link isLeapYear}. */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The full Gregorian rule, not the "divisible by four" shorthand: 1900 is not a leap year, 2000 is. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** How many days the given month of the given year actually has. `month` is 1–12. */
function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1];
}

/**
 * Is this field empty?
 *
 * Asked before {@link parseCalendarDay} so the caller can tell "you typed nothing" from "you typed
 * something I cannot read" — different mistakes deserving different sentences (ADR-013).
 */
export function isBlankDay(text: string): boolean {
  return text.trim() === "";
}

/**
 * Read a day as DF type it — `11.02.1985` — as the UTC day it names.
 *
 * Strict on purpose: `11.02.35` is as plausibly 1935 as 2035, an out-of-range month is refused
 * rather than clamped, and an ISO day is refused too — two live spellings in one field would let a
 * test pass while DF's screen behaved differently.
 *
 * @throws {InvalidCalendarDay} if the text is not a day in `TT.MM.JJJJ`, including when it is blank.
 */
export function parseCalendarDay(text: string): Date {
  const match = GERMAN_DAY.exec(text.trim());
  if (match === null) {
    throw new InvalidCalendarDay(text);
  }
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);

  if (month < 1 || month > 12) {
    throw new InvalidCalendarDay(text);
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new InvalidCalendarDay(text);
  }
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
}

/** Write a day the way it is typed, e.g. `11.02.1985`. Read in UTC, so the day does not slip back. */
export function formatCalendarDay(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

/** `JJJJ-MM-TT` — what the database and the domain compare on, never a display format. */
export function isoCalendarDay(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}
