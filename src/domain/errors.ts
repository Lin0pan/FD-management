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
