/**
 * Typed domain errors for FD-Management.
 *
 * The pure domain layer raises typed errors so the application and UI layers can react to a closed
 * set of failure modes rather than parsing strings — see docs/tech_stack_architecture_sketch.md §4.
 * Every error carries the values that made it fail, so a caller can render a German message naming
 * concrete numbers without re-deriving them.
 */

/** The closed set of domain error kinds. Extended as rules are implemented. */
export type DomainErrorCode =
  | "NoFreeCustomerNumber"
  | "CustomerNumberTaken"
  | "CustomerNotFound"
  | "InvalidCustomerRecord"
  | "MissingRequiredField"
  | "EmptyHousehold"
  | "BirthDateInFuture"
  | "WrongGroupForWeek"
  | "InvalidCardNumber"
  | "DuplicateAttendance"
  | "InvalidSettings"
  | "NoSettingsInForce"
  | "QuotaBelowActiveCustomers"
  | "MissingAuditReason"
  | "InvalidEuroAmount";

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
 * can say which limit was reached rather than reporting a bare failure — FD's answer is either to
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
