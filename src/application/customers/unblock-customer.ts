/**
 * Lift a customer's block (US-08.2). The status returns to `ACTIVE` and the reason is cleared, because
 * there is no block history in the product (PRD §5) — only the current reason, and a lifted block has
 * none. It survives in the audit log alone, which is why the entry carries the reason being lifted.
 *
 * No new reason is asked for: lifting a block needs no justification of its own.
 */

import { transition } from "@/domain/customer/status";
import { CustomerNotFound } from "@/domain/errors";
import type { AuditLog, Clock, CustomerRepository } from "../ports";

/** The audit event name every lifted block is recorded under. */
const CUSTOMER_UNBLOCKED = "customer.unblocked";

/** The status and the cleared reason; the reason that was lifted becomes the entry's `why`. */
const UNBLOCKED_FIELDS = ["status", "blockReason"] as const;

export interface UnblockCustomerDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface UnblockCustomerInput {
  readonly customerId: number;
}

/**
 * Lift the customer's block, clearing the reason and writing the audit trail.
 *
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {IllegalStatusTransition} if the customer is not `BLOCKED` — there is nothing to lift.
 */
export async function unblockCustomer(
  deps: UnblockCustomerDeps,
  { customerId }: UnblockCustomerInput,
): Promise<void> {
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }

  // Read before it is cleared: the audit trail is the only place it survives.
  const lifted = customer.blockReason ?? "";
  const status = transition(customer.status, "ACTIVE");

  await deps.customers.setStatus(customerId, status, null);
  await deps.audit.append({
    what: CUSTOMER_UNBLOCKED,
    changedFields: [...UNBLOCKED_FIELDS],
    when: now,
    why: lifted,
  });
}
