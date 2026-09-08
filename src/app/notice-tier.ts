/**
 * Which of the two "it did not happen" answers a failure is.
 *
 * - `refusal` — a rule refused a well-formed request, or the input needs fixing and the form is right
 *   there. The staff member settles it on the spot. Amber.
 * - `error` — the screen is describing something no longer there. A reload or a colleague, not
 *   another attempt. Red.
 *
 * Decided from the typed `DomainErrorCode` and **never from the sentence**: a German string is the
 * thing most likely to be reworded, and a tier read out of one changes when somebody fixes a comma.
 *
 * No German and no rendering here, so a `"use server"` action can import it without pulling React in
 * behind it.
 */

import { DomainError, type DomainErrorCode } from "@/domain/errors";

export type NoticeTier = "refusal" | "error";

/**
 * The tier of every code the domain can raise.
 *
 * A total `Record` rather than a `switch` with a default, and that is the point of the shape: a new
 * code in `src/domain/errors.ts` fails the build here until somebody decides what it means, where a
 * `default` would quietly have made it red.
 *
 * `CustomerNumberTaken` and the two card-run codes are all lost races and are tiered apart on
 * purpose: a taken customer number leaves the registration standing and re-submittable, while a taken
 * card index or card number means the run was read stale and the screen has to be re-read.
 * `InvalidPaymentAmount` is red because the field that could produce one refuses it first — reaching
 * a screen means the amount came from somewhere else, and typing again will not fix it.
 */
const TIERS: Record<DomainErrorCode, NoticeTier> = {
  // A rule refused a well-formed request.
  AlreadyServedToday: "refusal",
  ReminderAlreadyLoggedToday: "refusal",
  CertificateStillValid: "refusal",
  CertificateExpired: "refusal",
  NotClearToServe: "refusal",
  RecordNoLongerCorrectable: "refusal",
  CustomerArchived: "refusal",
  CustomerNotArchived: "refusal",
  IllegalStatusTransition: "refusal",
  NoFreeCustomerNumber: "refusal",
  CustomerNumberTaken: "refusal",
  CustomerNumberOutOfRange: "refusal",
  CustomerNumberUnchanged: "refusal",
  QuotaBelowActiveCustomers: "refusal",
  WrongGroupForWeek: "refusal",
  OverpaymentNotConfirmed: "refusal",

  // The input needs fixing, and the form is right there.
  MissingAuditReason: "refusal",
  MissingRequiredField: "refusal",
  EmptyHousehold: "refusal",
  CustomerNotInHousehold: "refusal",
  BirthDateInFuture: "refusal",
  CertificateValidUntilInPast: "refusal",
  NotesTooLong: "refusal",
  InvalidSettings: "refusal",
  DuplicateEggThreshold: "refusal",
  EggsNotIncreasing: "refusal",
  InvalidEuroAmount: "refusal",
  InvalidCalendarDay: "refusal",
  InvalidCustomerRecord: "refusal",
  EmptySearchQuery: "refusal",

  // Something is wrong, and typing again will not fix it.
  CustomerNotFound: "error",
  WaitingListEntryNotFound: "error",
  DistributionRecordNotFound: "error",
  NoSettingsInForce: "error",
  InvalidCardNumber: "error",
  CardIndexTaken: "error",
  CardNumberTaken: "error",
  InvalidPaymentAmount: "error",
};

/**
 * The tier a caught error answers in. Anything that is not a {@link DomainError} is red — an untyped
 * throw is a fault nobody has named, so it is not something staff can act on at the counter.
 *
 * Zod shape failures never reach here and are tiered at the call site by one rule: **did a staff
 * member type the bad value?** A malformed date or amount in a visible field is a `refusal`; a
 * malformed *hidden* field is an `error`, the form being stale with nothing on screen to correct.
 */
export function tierOf(error: unknown): NoticeTier {
  return error instanceof DomainError ? TIERS[error.code] : "error";
}
