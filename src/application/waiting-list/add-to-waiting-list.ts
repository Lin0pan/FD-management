/**
 * Put an applicant on the waiting list (US-12.2).
 *
 * When every slot up to the quota is taken, an applicant is not turned away — they are written down,
 * and the day they were written down is their place in the queue (FR-3). Nothing else is decided
 * here: no number is reserved, no customer row is created and no position is stored, because a
 * position that is stored is a position somebody can edit.
 *
 * The eligibility bar is registration's own (FR-1): the certificate must be valid *today*. That check
 * is the domain's, in `createWaitingListDetails`, so the waiting list and the registration screen
 * cannot come to different answers about what a valid certificate is.
 */

import { createWaitingListDetails, type WaitingListDetails } from "@/domain/customer/waitingList";
import type { AuditLog, Clock, WaitingListEntry, WaitingListRepository } from "../ports";

/** The audit event every new applicant is recorded under. */
const WAITING_LIST_ADDED = "waitingList.added";

/**
 * What the audit entry names as changed.
 *
 * Listing the typed fields would only repeat the entry itself. What is worth reading back is the one
 * value the *system* decided — when the applicant joined, which is the whole of their place in the
 * queue.
 */
const ADDED_FIELDS = ["addedOn"] as const;

export interface AddToWaitingListDeps {
  readonly waitingList: WaitingListRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

/** Everything staff type into the form — the same fields a registration asks for, less a household. */
export type AddToWaitingListInput = WaitingListDetails;

/**
 * Record the applicant and hand back the entry as it was stored.
 *
 * @throws {MissingRequiredField} for a name, address part or certificate type left blank.
 * @throws {BirthDateInFuture} if the applicant was born after today.
 * @throws {CertificateExpired} if the certificate has already lapsed — the same bar registration
 *   answers to, applied at the door rather than months later at the head of the queue.
 */
export async function addToWaitingList(
  deps: AddToWaitingListDeps,
  input: AddToWaitingListInput,
): Promise<WaitingListEntry> {
  // One read of the clock for the whole operation: the day the applicant is judged eligible and the
  // day that fixes their place in the queue are the same day, and an entry admitted on a certificate
  // that lapsed between two reads would be indefensible.
  const now = deps.clock.now();
  const details = createWaitingListDetails(input, now);

  const added = await deps.waitingList.add({ ...details, addedOn: now });
  await deps.audit.append({
    what: WAITING_LIST_ADDED,
    changedFields: [...ADDED_FIELDS],
    when: now,
    why: "",
  });
  return added;
}
