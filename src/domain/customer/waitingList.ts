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

import { CertificateExpired, MissingRequiredField } from "../errors";
import { isExpired } from "./certificate";
import type { Address, NeedsCertificate } from "./customer";
import { composition } from "./householdComposition";

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

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The instant of the UTC day a date falls on. A wait is counted in calendar days, not in elapsed
 * hours: an applicant written down at half past four has waited a day by the following morning, and
 * the number on screen must not depend on what time of day either end of it happened to be.
 */
function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * How many whole days the applicant has been waiting as of `today` — 0 on the day they joined.
 *
 * It is the one number on the waiting-list screen that says what the list costs the people on it, so
 * it is derived here rather than counted by the page: two screens counting days apart is how the same
 * applicant appears to have waited two different lengths of time.
 *
 * An entry dated after `today` counts as no wait rather than a negative one. Nobody has waited a
 * negative number of days, and a screen that said so would be reporting a clock problem as a fact
 * about the applicant.
 */
export function daysWaiting(entry: WaitingApplicant, today: Date): number {
  // Both ends are midnight UTC, so the difference is an exact number of days — no rounding, and no
  // daylight-saving hour to lose halfway through a long wait.
  return Math.max(0, (utcDay(today) - utcDay(entry.addedOn)) / MILLIS_PER_DAY);
}

/**
 * What an applicant is asked for to join the list: who they are, where they live, how to reach them
 * and the certificate that entitles them (US-12, FR-2).
 *
 * It deliberately mirrors part of a registration without *being* one — an applicant holds no customer
 * number, no group and no card, and their household is not asked for, because the people they live
 * with are typed when they are registered rather than guessed months earlier (PRD §7).
 */
export interface WaitingListDetails {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date;
  readonly address: Address;
  /**
   * How staff would reach this applicant, in free text, or `""`. FD agreed no phone or e-mail fields
   * (docs/archiv/domain_analysis.md, open question 2), and this is the note that stands in for them without
   * committing to a contact-data model.
   */
  readonly contactNote: string;
  /** The proof of need they applied with — valid on the day they joined, by the rule below. */
  readonly certificate: NeedsCertificate;
}

/**
 * The trimmed value of a field that must carry one.
 *
 * @throws {MissingRequiredField} naming the field, so the form can mark the input rather than
 *   reporting that "something" is missing.
 */
function requireText(field: string, value: string): string {
  const text = value.trim();
  if (text === "") {
    throw new MissingRequiredField(field);
  }
  return text;
}

/**
 * Validate an application and return it as trimmed {@link WaitingListDetails}.
 *
 * The certificate bar is the same one registration answers to (FR-1): an applicant joins with a valid
 * certificate in hand or does not join. A wait that outlives the certificate is a different matter
 * entirely — that one is flagged at the head of the list ({@link nextInLine}) and never bars anybody,
 * because the applicant kept their place by waiting and a renewal is what they are asked for.
 *
 * @throws {MissingRequiredField} for a name, address part or certificate type left blank.
 * @throws {BirthDateInFuture} if the applicant was born after `today`.
 * @throws {CertificateExpired} if the certificate had already lapsed on `today`.
 */
export function createWaitingListDetails(
  input: WaitingListDetails,
  today: Date,
): WaitingListDetails {
  if (isExpired(input.certificate, today)) {
    throw new CertificateExpired(input.certificate.validUntil, today);
  }
  // The same guard registration puts on a birthdate, reached the same way: deriving the composition
  // of a household of one rejects a date that lies after the day it is read against. The counts are
  // discarded — an applicant has no household on record to count.
  composition([{ birthDate: input.birthDate }], today);

  return {
    firstName: requireText("firstName", input.firstName),
    lastName: requireText("lastName", input.lastName),
    birthDate: input.birthDate,
    address: {
      street: requireText("address.street", input.address.street),
      houseNumber: requireText("address.houseNumber", input.address.houseNumber),
      zip: requireText("address.zip", input.address.zip),
      city: requireText("address.city", input.address.city),
    },
    contactNote: input.contactNote.trim(),
    certificate: {
      type: requireText("certificate.type", input.certificate.type),
      validUntil: input.certificate.validUntil,
    },
  };
}
