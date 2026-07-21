/**
 * Typed domain errors for FD-Management.
 *
 * Placeholder for the walking skeleton. The pure domain layer will raise typed errors (e.g.
 * `NoFreeCustomerNumber`, `WrongGroupForWeek`) so the application and UI layers can react to a
 * closed set of failure modes rather than parsing strings — see
 * docs/tech_stack_architecture_sketch.md §4. Concrete error classes arrive with the first domain
 * rules; this file is intentionally type-only for now so it carries no untested runtime code.
 */

/** The closed set of domain error kinds. Extended as rules are implemented. */
export type DomainErrorCode =
  "NoFreeCustomerNumber" | "WrongGroupForWeek" | "InvalidCardNumber" | "DuplicateAttendance";
