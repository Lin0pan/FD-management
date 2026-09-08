/**
 * Block a customer — pause a household without losing their place (US-08.2). The number, the card and
 * the record stay and the slot is *not* freed (FR-3): a blocked household is turned away at the
 * counter, not unregistered.
 *
 * The written reason is the entire institutional memory of why someone was paused (FR-1), so
 * {@link transition} refuses a reason-less block before anything is written. The reason is trimmed
 * once and both stored and audited from that value, so the counter and the log cannot drift apart.
 */

import { transition } from "@/domain/customer/status";
import { CustomerNotFound } from "@/domain/errors";
import type { AuditLog, Clock, CustomerRepository } from "../ports";

/** The audit event name every block is recorded under. */
const CUSTOMER_BLOCKED = "customer.blocked";

/** The status and the reason beside it; the reason itself is also the entry's `why`. */
const BLOCKED_FIELDS = ["status", "blockReason"] as const;

export interface BlockCustomerDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface BlockCustomerInput {
  readonly customerId: number;
  /** Why the household is being paused — the block's only record, required and shown verbatim. */
  readonly reason: string;
}

/**
 * Block the customer, storing the trimmed reason and writing the audit trail.
 *
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {IllegalStatusTransition} if the customer is not `ACTIVE` — an already-blocked or archived
 *   customer cannot be blocked.
 * @throws {MissingAuditReason} if the reason is empty or whitespace only.
 */
export async function blockCustomer(
  deps: BlockCustomerDeps,
  { customerId, reason }: BlockCustomerInput,
): Promise<void> {
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }

  const trimmed = reason.trim();
  // Both questions before any write: is the move legal, and does the block carry its reason. A
  // whitespace-only reason is a missing record, not an illegal move.
  const status = transition(customer.status, "BLOCKED", trimmed);

  await deps.customers.setStatus(customerId, status, trimmed);
  await deps.audit.append({
    what: CUSTOMER_BLOCKED,
    changedFields: [...BLOCKED_FIELDS],
    when: now,
    why: trimmed,
  });
}
