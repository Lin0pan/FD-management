/**
 * The customer status state machine (US-08.1).
 *
 * DF's register knows three states and only four moves between them. Modelling those moves as a
 * function — rather than trusting each call site to remember them — is what makes an illegal
 * transition impossible rather than merely unlikely: `transition` returns the target state for a
 * legal move and throws a typed error for anything else.
 *
 * The moves that carry more than the two states are `→ BLOCKED` and `→ ARCHIVED`: the reason *is*
 * the record of each (US-08, FR-1; US-10, FR-1), so a reason-less one is refused with
 * {@link MissingAuditReason}, the same error the settings changes speak. Its absence is a missing
 * record, not an illegal move, so it is a different error from {@link IllegalStatusTransition}.
 * Stating it here rather than in the two use cases is what keeps a future third caller of `archive`
 * from writing a reason-less one.
 *
 * The module is pure: no clock, no I/O, no persistence.
 */

import type { CustomerStatus } from "./customer";
import { IllegalStatusTransition, MissingAuditReason } from "../errors";

/**
 * A customer status, the same closed set the stored record uses ({@link CustomerStatus}). Named
 * `Status` here so the state machine reads for what it is; there is one source of truth, aliased.
 */
export type Status = CustomerStatus;

/**
 * The moves whose reason *is* the record, and the audit event each is known by. Blocking a household
 * (US-08) and archiving one (US-10) are both human judgements, and neither leaves any other trace of
 * why it happened — so the machine refuses them without a reason, and names the event it refused so
 * the caller does not have to restate it. Returning to `ACTIVE` is absent on purpose: lifting a block
 * needs no justification of its own.
 */
const REASON_REQUIRED: Readonly<Partial<Record<Status, string>>> = {
  BLOCKED: "customer.blocked",
  ARCHIVED: "customer.archived",
};

/** The four moves the register permits, as ordered `[from, to]` pairs. Everything else is refused. */
const ALLOWED_TRANSITIONS: ReadonlyArray<readonly [Status, Status]> = [
  ["ACTIVE", "BLOCKED"],
  ["BLOCKED", "ACTIVE"],
  ["ACTIVE", "ARCHIVED"],
  ["BLOCKED", "ARCHIVED"],
];

/**
 * Move a customer from `from` to `to`, returning the new status.
 *
 * @throws {IllegalStatusTransition} for any move that is not one of the four allowed pairs — every
 *   move out of `ARCHIVED`, and every no-op such as `ACTIVE → ACTIVE`.
 * @throws {MissingAuditReason} for a legal `→ BLOCKED` or `→ ARCHIVED` given an empty or
 *   whitespace-only reason, naming the event that was refused.
 */
export function transition(from: Status, to: Status, reason?: string): Status {
  const allowed = ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
  if (!allowed) {
    throw new IllegalStatusTransition(from, to);
  }
  const event = REASON_REQUIRED[to];
  if (event !== undefined && (reason === undefined || reason.trim() === "")) {
    throw new MissingAuditReason(event);
  }
  return to;
}
