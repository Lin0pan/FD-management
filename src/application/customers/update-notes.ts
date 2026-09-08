/**
 * Save the free-text note on a customer's record (US-16.3) — what staff want the next person at the
 * counter to know. Nothing is derived from it and nothing follows from changing one, so an empty note
 * is a legitimate answer; the only refusal is a text too long to be a note (`createNotes`).
 *
 * Its own use case rather than a field of `updateCustomerDetails`, because it is its own decision with
 * its own audit entry — an entry naming every personal field on every note edit would be unreadable.
 */

import { createNotes } from "@/domain/customer/customer";
import { CustomerArchived, CustomerNotFound } from "@/domain/errors";
import type { AuditLog, Clock, CustomerRepository } from "../ports";

/** The audit event name every note edit is recorded under. */
const NOTES_UPDATED = "customer.notesUpdated";

/**
 * The note's *text* is deliberately absent, before and after: the log records what, when and why
 * (ADR-006), and a copy of every note would turn it into a second, undeletable customer record.
 */
const NOTES_FIELDS = ["notes"] as const;

export interface UpdateNotesDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface UpdateNotesInput {
  readonly customerId: number;
  /** The note as it should stand afterwards; `""` clears it. */
  readonly notes: string;
}

/**
 * Store the note and write the audit trail.
 *
 * A **blocked** customer's note may be edited — it is most useful precisely while they are paused. An
 * **archived** one's may not (PRD §FR-8).
 *
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {CustomerArchived} if the customer has left the register.
 * @throws {NotesTooLong} if the note is longer than the record keeps.
 */
export async function updateNotes(
  deps: UpdateNotesDeps,
  { customerId, notes }: UpdateNotesInput,
): Promise<void> {
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }
  if (customer.status === "ARCHIVED") {
    throw new CustomerArchived(customerId);
  }

  await deps.customers.updateNotes(customerId, createNotes(notes));
  await deps.audit.append({
    what: NOTES_UPDATED,
    changedFields: [...NOTES_FIELDS],
    when: now,
    why: "",
  });
}
