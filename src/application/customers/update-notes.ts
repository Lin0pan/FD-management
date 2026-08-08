/**
 * Save the free-text note on a customer's record (US-16.3).
 *
 * The note is what staff want the next person at the counter to know — "klingelt nicht, bitte
 * anrufen", "holt für die Nachbarin mit ab". It is read back by the counter lookup (US-04.2) from
 * the same column this writes, so there is nothing to propagate and nowhere for the two to disagree.
 *
 * Nothing is derived from a note and nothing follows from changing one, which is why an empty note
 * is a legitimate answer: unlike a block reason, whose whole purpose is to record a judgement, a
 * note is a convenience and most households need none. The one thing refused is a text so long it is
 * no longer a note — `createNotes` holds that bound, so the form and the save mean the same number.
 *
 * It is its own use case rather than a field of `updateCustomerDetails` because it is its own
 * decision with its own audit entry: leaving a note for the counter is not a correction of the
 * record, and an entry that said `firstName, lastName, birthDate, address, notes` every time would
 * make the log unreadable for both.
 */

import { createNotes } from "@/domain/customer/customer";
import { CustomerArchived, CustomerNotFound } from "@/domain/errors";
import type { AuditLog, Clock, CustomerRepository } from "../ports";

/** The audit event name every note edit is recorded under. */
const NOTES_UPDATED = "customer.notesUpdated";

/**
 * What the audit entry names as changed.
 *
 * The note's *text* is deliberately not in the entry, neither before nor after: the log records
 * what, when and why (docs/architecture/adr/006-record-what-when-and-why-in-the-audit-log-never-who.md), and a copy of every note ever
 * written would turn the audit trail into a second, undeletable customer record.
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
 * A **blocked** customer's note may be edited — a note about a household at the counter is most
 * useful precisely while they are paused. An **archived** one's may not: their record is read-only
 * (PRD §FR-8), and there is no counter left to read it at.
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
