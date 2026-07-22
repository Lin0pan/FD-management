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
  | "NoPriceForHousehold"
  | "QuotaBelowActiveCustomers"
  | "RetroactiveSettingsVersion"
  | "MissingAuditReason";

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

/** No settings version had taken effect on the requested date. */
export class NoSettingsInForce extends DomainError {
  readonly code = "NoSettingsInForce";
  readonly date: Date;

  constructor(date: Date) {
    super(`No settings version is in force on ${date.toISOString()}`);
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
 * A new settings version was dated on or before the latest existing one. Versions are immutable and
 * append-only: rewriting history would change what a past distribution cost.
 */
export class RetroactiveSettingsVersion extends DomainError {
  readonly code = "RetroactiveSettingsVersion";
  readonly effectiveFrom: Date;
  readonly latestEffectiveFrom: Date;

  constructor(effectiveFrom: Date, latestEffectiveFrom: Date) {
    super(
      `A settings version effective ${effectiveFrom.toISOString()} would precede the latest ` +
        `version, effective ${latestEffectiveFrom.toISOString()}`,
    );
    this.effectiveFrom = effectiveFrom;
    this.latestEffectiveFrom = latestEffectiveFrom;
  }
}

/**
 * A state change arrived without a reason. The audit log is the system's only accountability, and
 * an entry that cannot say *why* is worth little.
 */
export class MissingAuditReason extends DomainError {
  readonly code = "MissingAuditReason";
  readonly what: string;

  constructor(what: string) {
    super(`The change "${what}" needs a reason for the audit log`);
    this.what = what;
  }
}

/** The price table has no row for this household composition; prices are never interpolated. */
export class NoPriceForHousehold extends DomainError {
  readonly code = "NoPriceForHousehold";
  readonly grownUps: number;
  readonly children: number;

  constructor(grownUps: number, children: number) {
    super(`No price row for a household of ${grownUps} grown-up(s) and ${children} child(ren)`);
    this.grownUps = grownUps;
    this.children = children;
  }
}
