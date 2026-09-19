/**
 * The attendance rules: a household may be served **once per distribution session** (US-34, FR-13),
 * and a record is amendable **exactly while its own session runs** (FR-14). Both turn on one
 * comparison, stated once here so the counter screen and the database's unique
 * `(customerId, sessionId)` constraint cannot disagree.
 *
 * **The session is the unit, not the calendar day**: an afternoon that runs past midnight is one
 * collection, and a second distribution on the same day is a second one. A hand-out belongs to the
 * session that was running when it was recorded, and belongs to no other.
 */

import { AlreadyServedInSession } from "../errors";
import { isRunning, type DistributionSession } from "./session";

/** The single field the attendance rules turn on: the session the hand-out belongs to. */
export interface AttendanceRecord {
  readonly sessionId: number;
}

/**
 * The success sentinel of {@link canRecord} — the household holds no record in this session yet.
 */
export type Recordability = "OK" | AlreadyServedInSession;

const berlinDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The calendar day `instant` falls on in Europe/Berlin, as a comparable `YYYY-MM-DD` key.
 *
 * No attendance rule reads this any more. It survives for `noShows.ts`, which still matches
 * attended days against the calendar's distributions, and for `householdComposition.ts`, which
 * counts an age in the zone the counter is worked in — US-36 retires the first of those.
 */
export function berlinDayKey(instant: Date): string {
  return berlinDay.format(instant);
}

/**
 * The record the household already holds in `sessionId`, or `null`.
 *
 * What the counter reads to decide what to offer (US-05.4). {@link canRecord} is the same question
 * phrased for the write path, so "already served" cannot mean two different afternoons.
 */
export function recordForSession<T extends AttendanceRecord>(
  recordsForCustomer: ReadonlyArray<T>,
  sessionId: number,
): T | null {
  return recordsForCustomer.find((record) => record.sessionId === sessionId) ?? null;
}

/**
 * Whether the household may be recorded in `sessionId`, given every record they already hold.
 *
 * @returns `"OK"` when no record belongs to this session, otherwise an
 *   {@link AlreadyServedInSession} naming it.
 */
export function canRecord(
  existingRecordsForCustomer: ReadonlyArray<AttendanceRecord>,
  sessionId: number,
): Recordability {
  return recordForSession(existingRecordsForCustomer, sessionId) === null
    ? "OK"
    : new AlreadyServedInSession(sessionId);
}

/**
 * Whether a record made in `session` may still be amended or removed (FR-14). The caller loads the
 * record's **own** session, never the running one: a session reopened for a correction is running
 * again, and every older afternoon stays frozen.
 *
 * `null` — a session the store cannot hand back — is not correctable, so the one answer this rule
 * gives is "only inside a running session" rather than "unless we found a reason".
 */
export function canCorrect(session: DistributionSession | null): boolean {
  return session !== null && isRunning(session);
}
