/**
 * A calendar day as DF write one: `TT.MM.JJJJ`.
 *
 * This module is the one place text becomes a day, and the counterpart of `money.ts`: both read a
 * German-written value off a form, both are strict rather than forgiving, and both fail with a typed
 * error rather than guessing.
 *
 * ## Why the browser no longer does this
 *
 * These fields were `<input type="date">` until ADR-013. That control looks like it settles the
 * question and does not: **the order its segments are typed in belongs to the operating system, not
 * to the page.** Safari takes it from the macOS region setting, so on DF's MacBook the first segment
 * is a month unless that machine is set to German, and `lang="de"` has no say. Chromium is worse
 * than wrong — it *clamps*: typing `15.03.1985` produced `1985-12-03`, a valid date nobody typed and
 * nothing reported. A birthdate decides whether a household member is a child, which moves the
 * price, so a day that is silently the wrong one is the exact failure this register replaced a
 * spreadsheet to stop.
 *
 * So the format is ours: one order, every machine, and a refusal where the old control guessed.
 *
 * Everything here is pure — no clock, no zone, no `Intl`. A day is held as midnight **UTC**, which is
 * how the domain compares birthdates (see `composition`) and how SQLite stores them; reading one back
 * in a local zone is what puts a birthday on the day before.
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
 * something I cannot read". They are different mistakes and deserve different sentences — telling
 * somebody who left a field blank that their *format* is wrong is what sent DF hunting for a typo
 * that was never there.
 */
export function isBlankDay(text: string): boolean {
  return text.trim() === "";
}

/**
 * Read a day as DF type it — `11.02.1985` — as the UTC day it names.
 *
 * Strict on purpose. A two-digit year is refused rather than guessed at, because for this register's
 * people `11.02.35` is as plausibly 1935 as 2035. An out-of-range month is refused rather than
 * clamped. An ISO day is refused too: accepting both formats would leave two spellings live in one
 * field, and a test written in the old one would pass while DF's screen behaved differently.
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

/**
 * Write a day as `JJJJ-MM-TT`.
 *
 * Not a display format — this is the spelling the database and the domain compare on, and the one a
 * value keeps while it is in flight. DF never see it.
 */
export function isoCalendarDay(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}
