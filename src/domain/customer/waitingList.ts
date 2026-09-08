/**
 * The waiting-list ordering rule: **strictly first come, first served** (US-12, FR-3), with no
 * priority, urgency or hardship override. A function rather than an `ORDER BY`, so the three screens
 * that show the head of the queue cannot each arrive at a different one.
 *
 * An expired certificate never re-orders the list — it is reported alongside the applicant (FR-5),
 * because skipping the head silently would hand somebody else's slot away with nobody deciding to.
 */

import { CertificateExpired, MissingRequiredField } from "../errors";
import { isExpired } from "./certificate";
import type { Address, NeedsCertificate } from "./customer";
import { composition } from "./householdComposition";

/**
 * An applicant reduced to the fields the ordering rule turns on. The caller passes its own richer
 * entry and gets it back, so the rule never grows a field it does not read.
 */
export interface WaitingApplicant {
  /** The surrogate key, and so the insertion order — what breaks a tie on {@link addedOn}. */
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
   * Whether the certificate they joined with has lapsed by `today` — a flag, never a filter: they are
   * still next in line, and the renewal is DF's judgement (PRD §9).
   */
  readonly certificateExpired: boolean;
}

/**
 * Exactly one answer to "who is next?" — a discriminated union so the banner's switch can be made
 * exhaustive rather than testing for `undefined`.
 */
export type NextInLine<T extends WaitingApplicant> = WaitingListEmpty | NextApplicant<T>;

/**
 * The applicants in the order they joined, ties broken by ascending id.
 *
 * The tie-break is the id and never the order rows came back in: two applicants added the same
 * morning would otherwise swap places between page loads, which is exactly the unfairness this list
 * exists to prevent. Returns a sorted copy.
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
 * The instant of the UTC day a date falls on. A wait is counted in calendar days, not elapsed hours —
 * somebody written down at half past four has waited a day by the following morning.
 */
function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * How many whole days the applicant has been waiting as of `today` — 0 on the day they joined.
 *
 * Derived here rather than counted by the page, so one applicant cannot appear to have waited two
 * different lengths of time. An entry dated after `today` counts as no wait: a negative number would
 * report a clock problem as a fact about the applicant.
 */
export function daysWaiting(entry: WaitingApplicant, today: Date): number {
  // Both ends are midnight UTC, so the difference is an exact number of days — no rounding, and no
  // daylight-saving hour to lose halfway through a long wait.
  return Math.max(0, (utcDay(today) - utcDay(entry.addedOn)) / MILLIS_PER_DAY);
}

/**
 * What an applicant is asked for to join the list (US-12, FR-2). Deliberately mirrors part of a
 * registration without being one: no customer number, no card, and no household — the people they
 * live with are typed when they are registered rather than guessed months earlier (PRD §7).
 */
export interface WaitingListDetails {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date;
  readonly address: Address;
  /**
   * How staff would reach this applicant, in free text, or `""`. DF agreed no phone or e-mail fields
   * (`docs/archiv/domain_analysis.md`, open question 2), so this stands in for them.
   */
  readonly contactNote: string;
  /** The proof of need they applied with — valid on the day they joined, by the rule below. */
  readonly certificate: NeedsCertificate;
}

/**
 * The trimmed value of a field that must carry one.
 *
 * @throws {MissingRequiredField} naming the field, so the form can mark the input.
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
 * The certificate bar is registration's (FR-1): an applicant joins with a valid certificate or does
 * not join. A wait that *outlives* the certificate is a different matter — flagged at the head of the
 * list ({@link nextInLine}) and never a bar, since they kept their place by waiting.
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
  // Registration's birthdate guard, reached the same way: a household of one rejects a date after
  // the day it is read against. The counts are discarded — an applicant has no household on record.
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
