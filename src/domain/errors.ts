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
  | "NoPriceForHousehold";

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
