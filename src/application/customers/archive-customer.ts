/**
 * Archive a customer — how a household leaves the register, and how their slot comes back (US-10.2).
 *
 * Archiving is the one status change that frees something: the customer number becomes available to
 * the next registration the moment it lands (FR-4), which is what makes it the answer to a waiting
 * list rather than a tidy-up. Everything else stays. Cards, hand-outs, certificates, reminders and
 * notes are untouched and the number remains on the row, so the archived record still says which
 * slot it held (PRD §7) — nothing about a customer is ever hard-deleted, and there is no way back
 * out of `ARCHIVED` either: a returning household is registered anew (FR-7, US-11).
 *
 * Because it is irreversible and always a judgement, the reason is mandatory and is the record of
 * it. Both that and the legality of the move are the {@link transition} state machine's to decide,
 * not this use case's: archiving an already-archived customer is an illegal move, a reason-less
 * archive is a missing record, and the two are different errors. Archiving a *blocked* customer is
 * legal — a paused household can still leave — and the block reason goes with the block.
 */

import { transition } from "@/domain/customer/status";
import { CustomerNotFound } from "@/domain/errors";
import type { AuditLog, Clock, CustomerRepository } from "../ports";

/** The audit event every archive is recorded under. */
const CUSTOMER_ARCHIVED = "customer.archived";

/**
 * What the audit entry names as changed: the status, the reason and the instant, which is exactly
 * what the repository writes. The reason itself is the entry's `why`.
 */
const ARCHIVED_FIELDS = ["status", "archiveReason", "archivedAt"] as const;

export interface ArchiveCustomerDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface ArchiveCustomerInput {
  readonly customerId: number;
  /** Why the household is leaving the register — required, kept on the row and shown verbatim. */
  readonly reason: string;
}

/**
 * Archive the customer, storing the trimmed reason and writing the audit trail.
 *
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {IllegalStatusTransition} if the customer is already archived — their slot may by now be
 *   someone else's, so archiving it again is not a no-op.
 * @throws {MissingAuditReason} naming `customer.archived` if the reason is empty or whitespace only.
 */
export async function archiveCustomer(
  deps: ArchiveCustomerDeps,
  { customerId, reason }: ArchiveCustomerInput,
): Promise<void> {
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }

  const trimmed = reason.trim();
  // Both questions are settled before anything is written: is the move legal, and does the archive
  // carry the reason that justifies it. The number is freed by the write below, so a refusal here
  // must leave the slot where it was.
  transition(customer.status, "ARCHIVED", trimmed);

  await deps.customers.archive(customerId, trimmed, now);
  await deps.audit.append({
    what: CUSTOMER_ARCHIVED,
    changedFields: [...ARCHIVED_FIELDS],
    when: now,
    why: trimmed,
  });
}
