/**
 * The customer status state machine (US-08.1): three states, four legal moves.
 *
 * Modelling the moves here rather than trusting each call site is what makes an illegal transition
 * impossible rather than merely unlikely.
 */

import type { CustomerStatus } from "./customer";
import { IllegalStatusTransition, MissingAuditReason } from "../errors";

/** {@link CustomerStatus}, aliased so the state machine reads for what it is. */
export type Status = CustomerStatus;

/**
 * The moves whose reason *is* the record, and the audit event each is known by (US-08 FR-1, US-10
 * FR-1). Stating it here rather than in the two use cases is what stops a future third caller
 * writing a reason-less archive. Returning to `ACTIVE` is absent on purpose: lifting a block needs
 * no justification of its own.
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
 *   whitespace-only reason, naming the event that was refused. A missing record, not an illegal
 *   move, so it is a different error.
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
