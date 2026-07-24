/**
 * The customer status state machine (US-08.1).
 *
 * FD's register knows three states and only four moves between them. Modelling those moves as a
 * function — rather than trusting each call site to remember them — is what makes an illegal
 * transition impossible rather than merely unlikely: `transition` returns the target state for a
 * legal move and throws a typed error for anything else.
 *
 * The one move that carries more than the two states is `→ BLOCKED`: a block's reason *is* its
 * record (US-08, FR-1), so a reason-less block is refused with {@link MissingAuditReason}, the same
 * error the archive and settings changes speak. Its absence is a missing record, not an illegal
 * move, so it is a different error from {@link IllegalStatusTransition}.
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
 * @throws {MissingAuditReason} for a legal `→ BLOCKED` given an empty or whitespace-only reason.
 */
export function transition(from: Status, to: Status, reason?: string): Status {
  const allowed = ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
  if (!allowed) {
    throw new IllegalStatusTransition(from, to);
  }
  if (to === "BLOCKED" && (reason === undefined || reason.trim() === "")) {
    throw new MissingAuditReason("customer.blocked");
  }
  return to;
}
