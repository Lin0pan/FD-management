/**
 * Formatting of values for German-speaking staff.
 *
 * The dictionary in `de.ts` holds the words; this module holds the shapes numbers and dates are
 * written in. Both are i18n, and both belong outside the pages so that two screens cannot render
 * the same date two ways — which is exactly what happened while `germanDate` was copied into the
 * settings page and the customer page.
 */

/**
 * A date as `TT.MM.JJJJ` — nobody at the counter should have to read an ISO timestamp.
 *
 * Read in UTC on purpose: dates in this application are days, not instants, and they are stored at
 * midnight UTC. Formatting them in the server's local zone would show the day before for anyone
 * west of Greenwich.
 */
export function germanDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

/**
 * A date written out, as `Donnerstag, 30. Juli 2026`.
 *
 * The long form exists for the one place a date is *read as a sentence* rather than looked up in a
 * column: the Start dashboard (US-17.3). Everywhere else — tables, fields, the card — stays on the
 * compact {@link germanDate}, which is what staff copy off a form.
 *
 * Read in UTC for the same reason as {@link germanDate}: these are days, not instants.
 */
const longDate = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function germanLongDate(date: Date): string {
  return longDate.format(date);
}

/**
 * A time of day as `HH:MM`, read in Europe/Berlin — the wall-clock the counter runs on.
 *
 * Unlike {@link germanDate}, a hand-out is an *instant*, not a day: the time a customer was served
 * has to read as the local clock the staff saw, so it follows the Berlin offset (and its DST
 * changes) rather than UTC.
 */
const berlinTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

export function germanTime(instant: Date): string {
  return berlinTime.format(instant);
}

/**
 * An instant as `TT.MM.JJJJ, HH:MM` — a date that is a *moment*, not a day.
 *
 * Berlin, for {@link germanTime}'s reason, and that is the whole of why this is not
 * {@link germanDate} with a time appended: an afternoon left running overnight and ended the next
 * morning is precisely the case this is read in, and a UTC date would name the wrong day for it.
 */
const berlinDateTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function germanDateTime(instant: Date): string {
  return berlinDateTime.format(instant);
}

/**
 * The calendar day an instant fell on, as `TT.MM.JJJJ` — {@link germanDateTime} without the clock.
 *
 * Berlin, and that is the whole of why this is not {@link germanDate}: an afternoon is an
 * *instant*, so reading its day in UTC would name the day before for one that ran past midnight.
 * Read where an afternoon is looked up in a column rather than read as a moment (US-37.3) —
 * wherever it is read as a moment, both its instants are written out in full instead.
 */
const berlinDate = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function germanDayOf(instant: Date): string {
  return berlinDate.format(instant);
}
