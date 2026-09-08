/**
 * Typed domain errors, so callers react to a closed set of failure modes rather than parsing strings
 * (`docs/architecture/08-crosscutting-concepts.md` §Errors). Every error carries the values that made
 * it fail, so a German message can name concrete numbers without re-deriving them.
 */

import type { Verdict } from "./distribution/counterVerdict";

/** The closed set of domain error kinds. Extended as rules are implemented. */
export type DomainErrorCode =
  | "NoFreeCustomerNumber"
  | "CustomerNumberTaken"
  | "CustomerNumberOutOfRange"
  | "CustomerNumberUnchanged"
  | "CustomerNotFound"
  | "CustomerArchived"
  | "CustomerNotArchived"
  | "InvalidCustomerRecord"
  | "MissingRequiredField"
  | "EmptyHousehold"
  | "CustomerNotInHousehold"
  | "BirthDateInFuture"
  | "WrongGroupForWeek"
  | "InvalidCardNumber"
  | "CardIndexTaken"
  | "CardNumberTaken"
  | "AlreadyServedToday"
  | "ReminderAlreadyLoggedToday"
  | "CertificateStillValid"
  | "CertificateValidUntilInPast"
  | "CertificateExpired"
  | "WaitingListEntryNotFound"
  | "NotClearToServe"
  | "DistributionRecordNotFound"
  | "RecordNoLongerCorrectable"
  | "InvalidSettings"
  | "NoSettingsInForce"
  | "QuotaBelowActiveCustomers"
  | "MissingAuditReason"
  | "IllegalStatusTransition"
  | "EmptySearchQuery"
  | "InvalidEuroAmount"
  | "InvalidCalendarDay"
  | "NotesTooLong"
  | "DuplicateEggThreshold"
  | "EggsNotIncreasing"
  | "OverpaymentNotConfirmed"
  | "InvalidPaymentAmount";

/** Base class of every domain error. `code` lets callers switch over the closed set above. */
export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A settings value violated an invariant on construction. */
export class InvalidSettings extends DomainError {
  readonly code = "InvalidSettings";
  readonly field: string;

  constructor(field: string, requirement: string) {
    super(`Invalid settings: ${field} ${requirement}`);
    this.field = field;
  }
}

/** No settings version had been recorded by the requested date. */
export class NoSettingsInForce extends DomainError {
  readonly code = "NoSettingsInForce";
  readonly date: Date;

  constructor(date: Date) {
    super(`No settings version is in force at ${date.toISOString()}`);
    this.date = date;
  }
}

/**
 * The requested quota is smaller than the number of customers already registered. Carries both
 * numbers so the UI can say which reality it collides with.
 */
export class QuotaBelowActiveCustomers extends DomainError {
  readonly code = "QuotaBelowActiveCustomers";
  readonly quotaN: number;
  readonly activeCustomers: number;

  constructor(quotaN: number, activeCustomers: number) {
    super(`Quota ${quotaN} is below the ${activeCustomers} customers currently active`);
    this.quotaN = quotaN;
    this.activeCustomers = activeCustomers;
  }
}

/**
 * A state change arrived without a reason (ADR-006). Raised only where the reason *is* the record —
 * blocking (US-08) and archiving (US-10). A settings edit is not one: the changed fields already say
 * what happened. One error for the concept, so `what` names the event rather than the class.
 */
export class MissingAuditReason extends DomainError {
  readonly code = "MissingAuditReason";
  readonly what: string;

  constructor(what: string) {
    super(`The change "${what}" needs a reason for the audit log`);
    this.what = what;
  }
}

/**
 * A household was submitted with no members. The customer is themselves a member, so the smallest
 * legitimate household has one — and a household of nobody would be charged for nobody.
 */
export class EmptyHousehold extends DomainError {
  readonly code = "EmptyHousehold";

  constructor() {
    super("A household must have at least one member");
  }
}

/**
 * A household was submitted without the customer among its rows. Everything the counter charges and
 * hands out is derived from those rows, so a household the customer is not in would price and feed
 * somebody else's family. Carries the missing person, so the UI can name them.
 */
export class CustomerNotInHousehold extends DomainError {
  readonly code = "CustomerNotInHousehold";
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date;

  constructor(firstName: string, lastName: string, birthDate: Date) {
    super(
      `The household does not list ${firstName} ${lastName}, born ${birthDate.toISOString()}, who it belongs to`,
    );
    this.firstName = firstName;
    this.lastName = lastName;
    this.birthDate = birthDate;
  }
}

/**
 * A household member was born after the day the household was evaluated. Carries both dates so the
 * UI can point at the row it means rather than at the form as a whole.
 */
export class BirthDateInFuture extends DomainError {
  readonly code = "BirthDateInFuture";
  readonly birthDate: Date;
  readonly today: Date;

  constructor(birthDate: Date, today: Date) {
    super(`Birth date ${birthDate.toISOString()} lies after ${today.toISOString()}`);
    this.birthDate = birthDate;
    this.today = today;
  }
}

/**
 * Every customer number up to the quota is held. Carries the quota, so the UI can name the limit —
 * DF's answer is to archive a household or raise `quotaN`.
 */
export class NoFreeCustomerNumber extends DomainError {
  readonly code = "NoFreeCustomerNumber";
  readonly quotaN: number;

  constructor(quotaN: number) {
    super(`All ${quotaN} customer numbers are taken`);
    this.quotaN = quotaN;
  }
}

/**
 * Somebody else took the chosen customer number between reading the free slots and writing the row.
 * Unlike {@link NoFreeCustomerNumber} it says nothing about the quota, only that this slot went to a
 * registration that landed first.
 *
 * Raised by the repository, which owns the partial unique index that is the final authority on a
 * free slot (`tasks/prd-us-01-register-customer.md` §7).
 */
export class CustomerNumberTaken extends DomainError {
  readonly code = "CustomerNumberTaken";
  readonly customerNumber: number;

  constructor(customerNumber: number) {
    super(`Customer number ${customerNumber} was taken by another registration`);
    this.customerNumber = customerNumber;
  }
}

/**
 * A chosen customer number is not a slot at all: not a whole number, or outside `1..quotaN` (US-24).
 *
 * A **separate code from {@link CustomerNumberTaken} even though staff read the same sentence**,
 * because the program branches on it: `registerCustomer` retries a `CustomerNumberTaken` it
 * allocated itself, and a quota violation wearing that code would be retried as a lost race. Not
 * hypothetical — US-14 lets staff lower the quota while a registration form is open.
 */
export class CustomerNumberOutOfRange extends DomainError {
  readonly code = "CustomerNumberOutOfRange";
  readonly customerNumber: number;
  readonly quotaN: number;

  constructor(customerNumber: number, quotaN: number) {
    super(`Customer number ${customerNumber} is not a slot in 1..${quotaN}`);
    this.customerNumber = customerNumber;
    this.quotaN = quotaN;
  }
}

/**
 * A household was moved to the customer number it already holds (US-30).
 *
 * Refused rather than quietly accepted, because a number change is not an idempotent save: it writes
 * an audit entry and **consumes a card number**, so the household would be printed a fresh card for
 * a move that never happened.
 */
export class CustomerNumberUnchanged extends DomainError {
  readonly code = "CustomerNumberUnchanged";
  readonly customerNumber: number;

  constructor(customerNumber: number) {
    super(`The customer already holds customer number ${customerNumber}`);
    this.customerNumber = customerNumber;
  }
}

/**
 * No customer holds the requested identity. Customer data is never hard-deleted (ADR-010), so this is
 * always a wrong address rather than a lost record.
 */
export class CustomerNotFound extends DomainError {
  readonly code = "CustomerNotFound";
  readonly id: number;

  constructor(id: number) {
    super(`No customer has the id ${id}`);
    this.id = id;
  }
}

/**
 * Something was asked of a customer who has left the register. An archived customer keeps their row
 * but holds no slot, so nothing may be issued to them — their card number would name a slot another
 * household may already hold (FR-6). Reactivating them is a deliberate act, not a side effect.
 */
export class CustomerArchived extends DomainError {
  readonly code = "CustomerArchived";
  readonly id: number;

  constructor(id: number) {
    super(`Customer ${id} is archived`);
    this.id = id;
  }
}

/**
 * A record still on the register was asked for as an archived one — reachable only by an id from
 * outside the archive search (a stale link, a bookmarked URL).
 *
 * The refusal matters: pre-filling a registration from an *active* record would walk staff into
 * registering a household that already holds a slot (US-11, FR-6).
 */
export class CustomerNotArchived extends DomainError {
  readonly code = "CustomerNotArchived";
  readonly id: number;
  readonly status: string;

  constructor(id: number, status: string) {
    super(`Customer ${id} is ${status}, not archived`);
    this.id = id;
    this.status = status;
  }
}

/**
 * A status change tried to move between two states the register does not connect — above all out of
 * `ARCHIVED` (re-registration creates a new customer, US-11) or a no-op. A reason-less block is
 * {@link MissingAuditReason} instead: there the move is legal and the record of *why* is missing.
 */
export class IllegalStatusTransition extends DomainError {
  readonly code = "IllegalStatusTransition";
  readonly from: string;
  readonly to: string;

  constructor(from: string, to: string) {
    super(`A customer cannot move from ${from} to ${to}`);
    this.from = from;
    this.to = to;
  }
}

/**
 * A stored customer row carries a word the domain does not recognise. SQLite has no enum type, so
 * these are parsed on the way back in; only a hand-edited database or an unrun migration reaches
 * this. Failing loudly is the point — defaulting to `ACTIVE` would hide it.
 */
export class InvalidCustomerRecord extends DomainError {
  readonly code = "InvalidCustomerRecord";
  readonly field: string;
  readonly value: string;

  constructor(field: string, value: string) {
    super(`"${value}" is not a valid ${field}`);
    this.field = field;
    this.value = value;
  }
}

/**
 * A record was submitted without a field it cannot exist without. Carries the field name so the UI
 * can mark the input rather than reporting that "something" is missing.
 */
export class MissingRequiredField extends DomainError {
  readonly code = "MissingRequiredField";
  readonly field: string;

  constructor(field: string) {
    super(`The field ${field} is required`);
    this.field = field;
  }
}

/**
 * A card number could not be read as `<customer number>k<index>`. Carries the text as entered: a
 * mistyped `50l3` and an unknown `50k9` are different problems, and only the first is this one.
 */
export class InvalidCardNumber extends DomainError {
  readonly code = "InvalidCardNumber";
  readonly text: string;

  constructor(text: string) {
    super(`"${text}" is not a card number such as 50k3`);
    this.text = text;
  }
}

/**
 * Two card issues raced for the same index and this one lost; a retry reads the run again.
 *
 * Raised by the repository, which owns the `@@unique([customerId, index])` constraint. It is what
 * keeps "exactly one valid card" true (FR-3) — if both writes landed, two cards would share the
 * highest index and neither would be *the* current one.
 */
export class CardIndexTaken extends DomainError {
  readonly code = "CardIndexTaken";
  readonly customerId: number;
  readonly index: number;

  constructor(customerId: number, index: number) {
    super(`Card index ${index} of customer ${customerId} was taken by another issue`);
    this.customerId = customerId;
    this.index = index;
  }
}

/**
 * The card number about to be printed had already been issued on that slot. Names the card — `66k1` —
 * rather than an internal id nobody at the counter has seen.
 *
 * Deliberately **not** {@link CardIndexTaken}: that is a race between two issues on one *record*,
 * settled by a retry. This says the run of the *slot* — every household that ever held the number —
 * was read stale, and a card number printed once is never printed again (US-25).
 */
export class CardNumberTaken extends DomainError {
  readonly code = "CardNumberTaken";
  readonly customerNumber: number;
  readonly index: number;

  constructor(customerNumber: number, index: number) {
    super(`Card number ${customerNumber}k${index} has already been issued`);
    this.customerNumber = customerNumber;
    this.index = index;
  }
}

/**
 * The customer already has a distribution record for today (US-05, FR-5). Carries the date on file,
 * so the counter can quote back when they were served.
 *
 * "Today" is a Berlin calendar day, not a 24-hour window. The comparison is the domain rule's; the
 * database repeats it as a unique constraint so the guard cannot be bypassed (US-05.3).
 */
export class AlreadyServedToday extends DomainError {
  readonly code = "AlreadyServedToday";
  readonly existingDate: Date;

  constructor(existingDate: Date) {
    super(`Already served today; a record exists from ${existingDate.toISOString()}`);
    this.existingDate = existingDate;
  }
}

/**
 * A reminder for this customer already exists on this calendar day — a second would double-log one
 * conversation, and a mis-click must not consume a grace period (US-06, FR-5).
 *
 * Raised by the use case after reading the day's log, and repeated by the repository for a race that
 * slips past it — the unique `(customerId, loggedOn)` constraint is the final authority (US-06.3).
 */
export class ReminderAlreadyLoggedToday extends DomainError {
  readonly code = "ReminderAlreadyLoggedToday";
  readonly customerId: number;
  /** The Berlin calendar day of the reminder already on file, as a `YYYY-MM-DD` key. */
  readonly loggedOn: string;

  constructor(customerId: number, loggedOn: string) {
    super(`Customer ${customerId} already has a reminder logged on ${loggedOn}`);
    this.customerId = customerId;
    this.loggedOn = loggedOn;
  }
}

/**
 * A reminder was requested while the certificate is still valid — logging one would start the
 * documented trail (US-06) on a household that owes no renewal.
 */
export class CertificateStillValid extends DomainError {
  readonly code = "CertificateStillValid";
  readonly validUntil: Date;
  readonly today: Date;

  constructor(validUntil: Date, today: Date) {
    super(
      `The certificate is still valid until ${validUntil.toISOString()} as of ${today.toISOString()}`,
    );
    this.validUntil = validUntil;
    this.today = today;
  }
}

/**
 * A renewed certificate arrived already expired. A renewal restores the proof of need (US-06, FR-4),
 * so a past end date is a typo — most likely a wrong year — rather than a record worth appending.
 */
export class CertificateValidUntilInPast extends DomainError {
  readonly code = "CertificateValidUntilInPast";
  readonly validUntil: Date;
  readonly today: Date;

  constructor(validUntil: Date, today: Date) {
    super(
      `A renewed certificate must outlive today: ${validUntil.toISOString()} lies before ${today.toISOString()}`,
    );
    this.validUntil = validUntil;
    this.today = today;
  }
}

/**
 * An applicant presented a lapsed certificate and the eligibility bar refused them (US-12, FR-1).
 *
 * The *entry* bar, not the counter's — an expired certificate never turns a registered household
 * away (US-06). Nor is it {@link CertificateValidUntilInPast}, which says a *renewal* carried what
 * must be a typo: here the date is believed, and a renewal is what the applicant is asked for.
 */
export class CertificateExpired extends DomainError {
  readonly code = "CertificateExpired";
  readonly validUntil: Date;
  readonly today: Date;

  constructor(validUntil: Date, today: Date) {
    super(`The certificate expired on ${validUntil.toISOString()}, before ${today.toISOString()}`);
    this.validUntil = validUntil;
    this.today = today;
  }
}

/**
 * No applicant is waiting under this id. Entries are never hard-deleted (US-12, FR-7), so this is a
 * spent reference rather than a lost record — a *removed* entry reaches it too, which is the point:
 * promoting somebody twice would hand a freed slot to a household that already has one.
 */
export class WaitingListEntryNotFound extends DomainError {
  readonly code = "WaitingListEntryNotFound";
  readonly entryId: number;

  constructor(entryId: number) {
    super(`No applicant is waiting under the id ${entryId}`);
    this.entryId = entryId;
  }
}

/**
 * The counter verdict refused service, so a hand-out must not be recorded (US-05, FR-8). The UI hides
 * the action, but the use case re-evaluates before writing — the screen is not the only guard.
 *
 * Carries the refusing {@link Verdict}, so the caller renders the counter's own reason.
 * `CLEAR_TO_SERVE` and its certificate-expired sibling never reach here.
 */
export class NotClearToServe extends DomainError {
  readonly code = "NotClearToServe";
  readonly verdict: Verdict;

  constructor(verdict: Verdict) {
    super(`The counter verdict "${verdict.kind}" does not permit recording a hand-out`);
    this.verdict = verdict;
  }
}

/**
 * A correction named a record that does not exist. The counter only offers to correct a record it has
 * just shown, so this is a stale reference rather than an everyday outcome.
 */
export class DistributionRecordNotFound extends DomainError {
  readonly code = "DistributionRecordNotFound";
  readonly recordId: number;

  constructor(recordId: number) {
    super(`No distribution record has the id ${recordId}`);
    this.recordId = recordId;
  }
}

/**
 * A record was corrected or removed after the day it was made, when it is already immutable (US-05,
 * FR-7). A distribution's history is not rewritten after the fact.
 */
export class RecordNoLongerCorrectable extends DomainError {
  readonly code = "RecordNoLongerCorrectable";
  readonly recordId: number;
  readonly recordDate: Date;
  readonly today: Date;

  constructor(recordId: number, recordDate: Date, today: Date) {
    super(
      `Record ${recordId} from ${recordDate.toISOString()} can no longer be corrected on ${today.toISOString()}`,
    );
    this.recordId = recordId;
    this.recordDate = recordDate;
    this.today = today;
  }
}

/**
 * A search was submitted with every criterion blank. Carries the criteria it would have accepted, so
 * the screen can name the fields.
 *
 * An empty archive search is not "everyone archived" (US-11.1): pre-filling a registration from the
 * wrong row is the mistake this feature must not make.
 */
export class EmptySearchQuery extends DomainError {
  readonly code = "EmptySearchQuery";
  readonly criteria: ReadonlyArray<string>;

  constructor(criteria: ReadonlyArray<string>) {
    super(`A search needs at least one of: ${criteria.join(", ")}`);
    this.criteria = criteria;
  }
}

/**
 * A note outgrew the length the record keeps for it (US-16.3). Carries both lengths, so the screen can
 * say how far over it is. Not a business rule but a bound on a column, which is why the number lives
 * beside the field it guards (`NOTES_MAX_LENGTH`) rather than in settings.
 */
export class NotesTooLong extends DomainError {
  readonly code = "NotesTooLong";
  readonly length: number;
  readonly maxLength: number;

  constructor(length: number, maxLength: number) {
    super(`A note may hold at most ${maxLength} characters, not ${length}`);
    this.length = length;
    this.maxLength = maxLength;
  }
}

/**
 * A euro amount typed by a human could not be read as whole cents. Carries the text as entered so
 * the UI can quote it back rather than blaming an empty field.
 */
export class InvalidEuroAmount extends DomainError {
  readonly code = "InvalidEuroAmount";
  readonly text: string;

  constructor(text: string) {
    super(`"${text}" is not a euro amount such as 2,50`);
    this.text = text;
  }
}

/**
 * The text in a date field is not a calendar day. A blank field throws this too, but the caller is
 * expected to have asked `isBlankDay` first — "you typed nothing" and "I cannot read this" are
 * different things to tell somebody at a counter.
 */
export class InvalidCalendarDay extends DomainError {
  readonly code = "InvalidCalendarDay";
  readonly text: string;

  constructor(text: string) {
    super(`"${text}" is not a calendar day such as 11.02.1985`);
    this.text = text;
  }
}

/**
 * Two rows of the egg rule name the same household size, so the answer would depend on which row was
 * read first (US-28.1). Carries the threshold both claim, so the form can say which row to fix.
 */
export class DuplicateEggThreshold extends DomainError {
  readonly code = "DuplicateEggThreshold";
  readonly minPersons: number;

  constructor(minPersons: number) {
    super(`Two egg-rule rows both start at ${minPersons} persons`);
    this.minPersons = minPersons;
  }
}

/**
 * A row of the egg rule awards a larger household no more eggs than the row below it (US-28.1) — the
 * rule is a staircase. Carries both rows, so the sentence can name the thresholds that collide.
 */
export class EggsNotIncreasing extends DomainError {
  readonly code = "EggsNotIncreasing";
  readonly minPersons: number;
  readonly eggs: number;
  readonly lowerMinPersons: number;
  readonly lowerEggs: number;

  constructor(minPersons: number, eggs: number, lowerMinPersons: number, lowerEggs: number) {
    super(
      `${minPersons} persons award ${eggs} eggs, which is not more than the ${lowerEggs} awarded from ${lowerMinPersons} persons`,
    );
    this.minPersons = minPersons;
    this.eggs = eggs;
    this.lowerMinPersons = lowerMinPersons;
    this.lowerEggs = lowerEggs;
  }
}

/**
 * More was handed over than the household was asked for, and nobody has confirmed it (US-29.2).
 *
 * A mistyped credit is the one error this design cannot undo: it surfaces nowhere, the balance
 * silently pays for the next weeks, and the first sign is a household asked for nothing for a month.
 * A shortfall needs no such guard — it shows as an open amount at the very next hand-out.
 *
 * A question, not a fault: the counter re-submits with the confirmation and the payment is written as
 * typed. Paying ahead is never refused outright.
 */
export class OverpaymentNotConfirmed extends DomainError {
  readonly code = "OverpaymentNotConfirmed";
  readonly paidCents: number;
  readonly amountToPayCents: number;

  constructor(paidCents: number, amountToPayCents: number) {
    super(`${paidCents} cents were handed over against the ${amountToPayCents} cents asked for`);
    this.paidCents = paidCents;
    this.amountToPayCents = amountToPayCents;
  }
}

/**
 * An amount handed over that is not a whole, non-negative number of cents (US-29).
 *
 * Distinct from {@link InvalidEuroAmount}, which is about *text a human typed*; this is about a
 * **number a caller passed**, so there is nothing to quote back.
 *
 * It exists because the balance is derived and therefore unrepairable (ADR-015): a bad amount that
 * reaches the store is carried silently by every later reading. The counter cannot produce one, but
 * the counter is not the only caller (FR-8) — the seed writes payments through the store directly.
 */
export class InvalidPaymentAmount extends DomainError {
  readonly code = "InvalidPaymentAmount";
  readonly paidCents: number;

  constructor(paidCents: number) {
    super(`${paidCents} is not a whole, non-negative number of cents`);
    this.paidCents = paidCents;
  }
}
