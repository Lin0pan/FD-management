/**
 * Which of the two "it did not happen" answers a failure is.
 *
 * The application used to have one. Every refusal, from „Der Haushalt gehört bereits zur Gruppe Rot."
 * to „Kunde nicht gefunden.", came back as `{ status: "error", message }` and was painted the same
 * red — so the screen had no way to say *"nothing is broken, the rules just say no"*, which is the
 * most common thing it has to say at a counter with a queue at it.
 *
 * The distinction cannot be made from the sentence, and it must not be: a German string is the
 * thing most likely to be reworded, and a tier read back out of one is a tier that changes when
 * somebody fixes a comma. It is made from the typed `DomainErrorCode`, which is a closed set the
 * domain owns.
 *
 * - `refusal` — a rule refused a well-formed request, or the input needs fixing and the form is
 *   right there. The staff member can settle it on the spot. Amber.
 * - `error` — the screen is describing something that is no longer there. A reload or a colleague is
 *   needed, not another attempt. Red.
 *
 * This module holds no German and renders nothing, so a `"use server"` action can import it without
 * pulling React and `lucide-react` in behind it. `Notice` takes the tier as a tone.
 */

import { DomainError, type DomainErrorCode } from "@/domain/errors";

export type NoticeTier = "refusal" | "error";

/**
 * The tier of every code the domain can raise.
 *
 * A `Record<DomainErrorCode, NoticeTier>` rather than a `switch` with a default, and that is the
 * whole point of the shape: a 36th code added to `src/domain/errors.ts` fails the build here until
 * somebody decides what it means. A `default` would have quietly made it red, which is exactly the
 * state this module exists to leave behind.
 *
 * The seven red ones are the four not-found codes, the unconfigured application, and the two that
 * mean a *stored* value no longer parses — `InvalidCardNumber` reading a card number out of the
 * database, `CardIndexTaken` losing a race — plus `CardNumberTaken`, which is the same reading of a
 * stale card run one slot wider (US-25). Everything else is the counter's ordinary business.
 * Note `CustomerNumberTaken` and the two card-run codes are all lost races and are tiered apart on
 * purpose: a taken customer number leaves the registration standing and re-submittable, while a
 * taken card index or card number means the run was read stale and the screen has to be re-read.
 */
const TIERS: Record<DomainErrorCode, NoticeTier> = {
  // A rule refused a well-formed request.
  AlreadyServedToday: "refusal",
  ReminderAlreadyLoggedToday: "refusal",
  CertificateStillValid: "refusal",
  CertificateExpired: "refusal",
  NotClearToServe: "refusal",
  RecordNoLongerCorrectable: "refusal",
  GroupUnchanged: "refusal",
  CustomerArchived: "refusal",
  CustomerNotArchived: "refusal",
  IllegalStatusTransition: "refusal",
  NoFreeCustomerNumber: "refusal",
  CustomerNumberTaken: "refusal",
  CustomerNumberOutOfRange: "refusal",
  QuotaBelowActiveCustomers: "refusal",
  WrongGroupForWeek: "refusal",

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
};

/**
 * The tier a caught error answers in.
 *
 * Anything that is not a {@link DomainError} is red, and that is the honest answer rather than a
 * conservative one: an untyped throw is a fault nobody has named, so it is not something a staff
 * member can act on at the counter.
 *
 * A handful of returns never reach this function, because they are Zod shape failures with no
 * typed error behind them at all. Those are tiered literally at the call site, by one rule: **did a
 * staff member type the bad value?** A malformed date or amount they can see in a field is a
 * `refusal` — the form is right there and retyping fixes it. A malformed *hidden* field (every
 * `surrogateId` parse, a `recordId` that is not a number) is an `error`: the form is stale, and
 * there is nothing on screen to correct.
 */
export function tierOf(error: unknown): NoticeTier {
  return error instanceof DomainError ? TIERS[error.code] : "error";
}
