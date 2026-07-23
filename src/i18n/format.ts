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
