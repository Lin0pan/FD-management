/**
 * Typed domain errors for FD-Management.
 *
 * The pure domain layer raises typed errors so the application and UI layers can react to a closed
 * set of failure modes rather than parsing strings — see docs/architecture/08-crosscutting-concepts.md §Errors.
 * Every error carries the values that made it fail, so a caller can render a German message naming
 * concrete numbers without re-deriving them.
 */

import type { Verdict } from "./distribution/counterVerdict";

/** The closed set of domain error kinds. Extended as rules are implemented. */
export type DomainErrorCode =
  | "NoFreeCustomerNumber"
  | "CustomerNumberTaken"
  | "CustomerNumberOutOfRange"
  | "CustomerNotFound"
  | "CustomerArchived"
  | "CustomerNotArchived"
  | "InvalidCustomerRecord"
  | "MissingRequiredField"
  | "EmptyHousehold"
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
  | "GroupUnchanged"
  | "DuplicateEggThreshold"
  | "EggsNotIncreasing";

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
 * A state change arrived without a reason. The audit log is the system's only accountability, and
 * an entry that cannot say *why* is worth little.
 *
 * Raised by the state changes that genuinely turn on a human judgement — blocking a customer
 * (`customer.blocked`, US-08), archiving one (`customer.archived`, US-10) — where the reason *is*
 * the record. A settings edit is not one of them: the changed fields already say what happened, so
 * `updateSettings` accepts an empty reason rather than collecting a sentence typed to get past a
 * validation. One error for the concept, so `what` names the event rather than the class.
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
 * A household was submitted with no members. The registered customer is themselves a member, so the
 * smallest legitimate household has exactly one — an empty one is a data-entry mistake, and a
 * household of nobody would be charged for nobody.
 */
export class EmptyHousehold extends DomainError {
  readonly code = "EmptyHousehold";

  constructor() {
    super("A household must have at least one member");
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
 * Every customer number up to the quota is held by an active customer. Carries the quota so the UI
 * can say which limit was reached rather than reporting a bare failure — DF's answer is either to
 * archive a household or to raise `quotaN` in settings.
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
 * Carries the number so a retry can be told apart from a genuinely full register — unlike
 * {@link NoFreeCustomerNumber}, this says nothing about the quota being reached, only that this one
 * slot went to a registration that landed first.
 *
 * Raised by the repository, which owns the partial unique index that is the final authority on a
 * free slot (tasks/prd-us-01-register-customer.md §7).
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
 * A chosen customer number is not a slot at all: it is not a whole number, or it lies outside
 * `1..quotaN` (US-24). Carries both the number and the quota it fell outside, so the limit can be
 * named rather than merely asserted.
 *
 * It is a **separate code from {@link CustomerNumberTaken} even though staff read the same
 * sentence** for both — either way they pick another number. The codes differ because the program
 * branches on them: `registerCustomer` retries a `CustomerNumberTaken` when it allocated the number
 * itself, and a quota violation wearing that code would be retried as if it were a lost race. It is
 * not hypothetical either — US-14 lets staff lower the quota while a registration form is open.
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
 * No customer holds the requested identity. Carries the id that was asked for, so a mistyped link
 * can be told from an archived household that is genuinely gone — it never is, because customer data
 * is not hard-deleted (US-10), which makes this error a wrong address rather than a lost record.
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
 * Something was asked of a customer who has left the register. Carries the id so the screen can say
 * which household it means.
 *
 * An archived customer keeps their row and their history — data is never hard-deleted (US-10) — but
 * they hold no slot, so nothing may be issued to them. Their card number would name a slot that a
 * different household may already have taken (FR-6). Reactivating them is DF's answer, and it is a
 * deliberate act rather than something a card issue may do quietly on their behalf.
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
 * A record that is still on the register was asked for as an archived one. Carries the id and the
 * status it actually has, so the screen can say which household it means and why it is not on offer.
 *
 * The archive search only ever lists archived households (US-11.1), so this is reached by an id that
 * came from somewhere else — a stale link, a bookmarked URL, a household archived and then found
 * again. The refusal matters: pre-filling a registration from an *active* record would walk staff
 * into registering a household that already holds a slot (US-11, FR-6), and the "are they already
 * registered?" question is the counter lookup's to answer, not the registration form's.
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
 * A customer status change tried to move between two states the register does not connect — most of
 * all any move *out of* `ARCHIVED` (re-registration creates a new customer, US-11) or a no-op that
 * changes nothing (`ACTIVE → ACTIVE`). Carries both states so the screen can name the move it
 * refused rather than reporting a bare failure. The reason-less block is a different error
 * ({@link MissingAuditReason}) — the move is legal, the record of *why* is what is missing.
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
 * A stored customer row carries a value the domain does not recognise — a group or status that is
 * not one of the known words.
 *
 * SQLite has no enum type, so these arrive as plain strings and are parsed on the way back in. The
 * only way to reach this error is a hand-edited database or a migration that was never run, and
 * failing loudly is the point: silently defaulting to `ACTIVE` or `RED` would put a household in the
 * wrong week without anyone noticing.
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
 * A card number could not be read as `<customer number>k<index>`. Carries the text as entered so
 * the counter screen can quote back what was typed — a mistyped `50l3` and an unknown `50k9` are
 * different problems for staff, and only the first of them is this one.
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
 * Two card issues raced for the same index and this one lost. Carries the customer and the index it
 * tried to take, so a retry can read the run again and count on from what is now there.
 *
 * Raised by the repository, which owns the `@@unique([customerId, index])` constraint that is the
 * final authority on a free index — the same division of labour as {@link CustomerNumberTaken}. It
 * is what keeps "exactly one valid card" true (FR-3): if both writes landed, two cards would share
 * the highest index and neither would be *the* current one.
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
 * The card number a card was about to be printed with had already been issued on that slot. Carries
 * the customer number and the index, so the screen can name the card — `66k1` — rather than an
 * internal id nobody at the counter has ever seen.
 *
 * Raised by the repository, which owns the `@@unique([customerNumber, index])` constraint that is
 * the final authority on a card number being spent. It is deliberately **not**
 * {@link CardIndexTaken}: that one is a race between two issues on one *record*, which a retry
 * settles by counting on from what is now there. This one says the run of the *slot* — every
 * household that has ever held the number, archived ones included — was read stale, and a card
 * number that has been printed once is never printed again (US-25).
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
 * The customer already has a distribution record for today, so a second hand-out would be a double
 * record (US-05, FR-5). Carries the date of the record already on file, so the counter can quote back
 * the time the customer was served rather than a bare refusal.
 *
 * "Today" is a calendar day in Europe/Berlin, not a 24-hour window: two hand-outs at 09:00 and 16:00
 * on the same distribution day collide, and the comparison is the domain rule's, not the database's —
 * though the database repeats it as a unique constraint so the guard cannot be bypassed (US-05.3).
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
 * A reminder for this customer already exists on this calendar day, so a second one would double-log
 * what was one conversation — and a mis-click must not consume a customer's grace period (US-06,
 * FR-5). Carries the customer and the Berlin day key of the entry already on file, so the counter can
 * say the reminder is today's rather than refuse blankly.
 *
 * The use case raises it after reading the day's log; the repository repeats it for a race that
 * slips past that read, because the database's unique `(customerId, loggedOn)` constraint is the
 * final authority on the day being taken (US-06.3) — the same division of labour as
 * {@link AlreadyServedToday}.
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
 * A reminder was requested while the certificate still proves the household's need — there is
 * nothing to remind about, and logging one would start the documented trail (US-06) on a customer
 * who owes no renewal. Carries the certificate's end date and today, so the screen can show the
 * date the certificate is in fact valid until.
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
 * A renewed certificate arrived already expired. A renewal exists to restore the proof of need
 * (US-06, FR-4), so an end date in the past is a typo — most likely a wrong year — rather than a
 * record worth appending. Carries both dates so the form can quote the date it read back.
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
 * An applicant presented a certificate that had already lapsed, and the eligibility bar refused them
 * (US-12, FR-1). Carries the end date and the day it was judged against, so the form can quote back
 * the date it read rather than blaming the field.
 *
 * It is the *entry* bar, not the counter's: an expired certificate never turns a registered household
 * away — it starts the reminder trail ({@link CertificateStillValid}'s counterpart, US-06). And it is
 * not {@link CertificateValidUntilInPast}, which says a *renewal* carried a date that must be a typo,
 * most likely a wrong year. Here the date is believed and the answer is a renewed certificate before
 * the applicant may join the waiting list at all.
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
 * No applicant is waiting under this id. Carries the id asked for, so a stale link can be told from a
 * bug — entries are never hard-deleted (US-12, FR-7), so this is a wrong or spent reference rather
 * than a lost record.
 *
 * A *removed* entry reaches it too, and that is the point: an applicant who has already been
 * registered or withdrawn is no longer on the list, and promoting them a second time would hand a
 * freed slot to somebody who has one.
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
 * The counter verdict refused service, so a hand-out must not be recorded (US-05, FR-8). The UI
 * already hides the serve action for a refusing verdict, but the use case re-evaluates it before
 * writing — the screen is not the only guard — and this is how it says no when asked anyway.
 *
 * Carries the refusing {@link Verdict} (an `ARCHIVED`, `BLOCKED` or `WRONG_GROUP`), so the caller can
 * render the same reason the counter shows without re-deriving it. `CLEAR_TO_SERVE` and its
 * certificate-expired sibling never reach here — an expired certificate serves and reminds, it does
 * not refuse.
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
 * A correction named a record that does not exist. Carries the id asked for, so a stale link can be
 * told from a genuine bug — the counter only offers to correct a record it has just shown, so this is
 * a lost reference rather than an everyday outcome.
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
 * A record was corrected or removed after the day it was made, when it has already become immutable
 * (US-05, FR-7). Carries the record's day and today so the UI can explain that only the same day's
 * entries may still be changed. A distribution's history is not rewritten after the fact — only the
 * hand-out being corrected on the spot is.
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
 * A search was submitted with every criterion left blank. Carries the names of the criteria it would
 * have accepted, so the screen can say which fields it means rather than reporting a bare refusal.
 *
 * An empty archive search is not "everyone archived" (US-11.1): the result would be a list staff
 * would scroll through looking for a household they could have named, and pre-filling a registration
 * from the wrong row is the mistake this whole feature must not make.
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
 * A note outgrew the length the record keeps for it (US-16.3). Carries both lengths, so the screen
 * can say how far over the limit the text is rather than refusing without a number.
 *
 * The limit is not a business rule about what staff may write — notes are free text and an empty one
 * is perfectly ordinary. It is a bound on a column that would otherwise accept a pasted document,
 * which is why the number lives beside the field it guards (`NOTES_MAX_LENGTH`) rather than in
 * settings with the prices and the quota DF edits.
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
 * A customer was moved to the group they are already in (US-16.4). Carries the group, so the screen
 * can name it rather than reporting that something unspecified went wrong.
 *
 * It is refused rather than quietly accepted because a group change is not an idempotent save: it
 * writes an audit entry, and it makes the card the household holds stale. Letting a no-op through
 * would fill the log with moves that never happened and put households on the cards-due list for a
 * change nobody made — and a staff member who pressed the button expecting something to happen
 * would be told nothing.
 */
export class GroupUnchanged extends DomainError {
  readonly code = "GroupUnchanged";
  readonly group: string;

  constructor(group: string) {
    super(`The customer is already in group ${group}`);
    this.group = group;
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
 * The text in a date field is not a calendar day.
 *
 * Carries the text it refused so the field can say what it read back. A blank field throws this too,
 * but the caller is expected to have asked `isBlankDay` first: "you typed nothing" and "you typed
 * something I cannot read" are different things to tell somebody at a counter.
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
 * Two rows of the egg rule name the same household size, so the number of eggs a household of that
 * size receives would depend on which row was read first (US-28.1).
 *
 * Carries the threshold both rows claim, so the settings form can say which row to fix rather than
 * reporting that the rule as a whole is wrong.
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
 * A row of the egg rule awards a larger household no more eggs than the row below it (US-28.1).
 *
 * The rule is a staircase: a household that grows never comes away with fewer eggs than it had.
 * Carries both rows' numbers, so the German sentence can name the two thresholds that collide
 * without re-deriving which neighbour was meant.
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
