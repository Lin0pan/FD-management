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
 * A time of day as `HH:MM`, read in Europe/Berlin — the wall-clock the counter runs on.
 *
 * Unlike {@link germanDate}, a hand-out is an *instant*, not a day: the time a customer was served
 * has to read as the local clock the staff saw, so it follows the Berlin offset (and its DST
 * changes) rather than UTC. The same zone the attendance rules count the day in (`berlinDayKey`), so
 * "served at 23:59" and "already served today" cannot disagree about which day that was.
 */
const berlinTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

export function germanTime(instant: Date): string {
  return berlinTime.format(instant);
}
