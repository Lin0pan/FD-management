/**
 * The waiting-list ordering rule — who gets the next slot that frees up.
 *
 * The rule is **strictly first come, first served** (US-12, FR-3): the applicant who joined earliest
 * is next, with no priority, urgency or hardship override. It lives here as a pure function rather
 * than as an `ORDER BY` in a query so that "fair order" is a property the tests pin down, and so that
 * the waiting-list screen, the home-screen banner and the promotion use case cannot each arrive at a
 * slightly different head of the queue.
 *
 * An expired certificate never re-orders the list. It is reported alongside the applicant
 * ({@link NextApplicant.certificateExpired}) so staff can ask for a renewal before registering them
 * (FR-5) — skipping the head silently would hand somebody else's slot away without anyone deciding to.
 *
 * The module is pure: `today` is a parameter, never the wall clock, and nothing here knows how an
 * entry is stored.
 */

import { isExpired } from "./certificate";
import type { NeedsCertificate } from "./customer";

/**
 * An applicant reduced to the fields the ordering rule turns on. The application layer passes its own
 * richer entry — name, address, contact note — and gets that same value back, so the rule never has to
 * grow a field it does not read.
 */
export interface WaitingApplicant {
  /**
   * The surrogate key, which is also the insertion order: rows are numbered as they are written, so a
   * lower id means an earlier row. It is what breaks a tie on {@link addedOn} below.
   */
  readonly id: number;
  /** The instant the applicant was put on the list. */
  readonly addedOn: Date;
  /** The proof of need they were admitted with — it may since have lapsed. */
  readonly certificate: NeedsCertificate;
}

/** Nobody is waiting. A result of its own, so a caller cannot mistake "no one" for "not asked". */
export interface WaitingListEmpty {
  readonly kind: "WAITING_LIST_EMPTY";
}

/** The applicant a freed slot belongs to, and whether their certificate outlived the wait. */
export interface NextApplicant<T extends WaitingApplicant> {
  readonly kind: "NEXT_IN_LINE";
  readonly entry: T;
  /**
   * Whether the certificate they joined with has lapsed by `today`. It is a flag, never a filter: the
   * entry is still the next in line, and what happens about the renewal is FD's judgement (PRD §9).
   */
  readonly certificateExpired: boolean;
}

/**
 * Exactly one answer to "who is next?" — a discriminated union so the banner's switch can be made
 * exhaustive rather than testing for `undefined`.
 */
export type NextInLine<T extends WaitingApplicant> = WaitingListEmpty | NextApplicant<T>;

/**
 * The applicants in the order they joined: earliest {@link WaitingApplicant.addedOn} first, ties
 * broken by ascending id.
 *
 * The tie-break is the id and never the order the rows happened to come back in, because two
 * applicants added the same morning would otherwise swap places between two page loads, and the
 * fairness this list exists for is exactly that they do not. Ids ascend with time, so the tie-break
 * only ever refines arrival order — it never contradicts it.
 *
 * Returns a sorted copy; the caller's array is left as it was read.
 */
export function inArrivalOrder<T extends WaitingApplicant>(
  entries: ReadonlyArray<T>,
): ReadonlyArray<T> {
  return [...entries].sort(
    (left, right) => left.addedOn.getTime() - right.addedOn.getTime() || left.id - right.id,
  );
}

/**
 * Who the next freed slot belongs to on `today`, or {@link WaitingListEmpty} when nobody is waiting.
 *
 * `today` decides nothing about the order — it is read only to report whether the named applicant's
 * certificate has lapsed while they waited.
 */
export function nextInLine<T extends WaitingApplicant>(
  entries: ReadonlyArray<T>,
  today: Date,
): NextInLine<T> {
  const [head] = inArrivalOrder(entries);
  if (head === undefined) {
    return { kind: "WAITING_LIST_EMPTY" };
  }
  return {
    kind: "NEXT_IN_LINE",
    entry: head,
    certificateExpired: isExpired(head.certificate, today),
  };
}
