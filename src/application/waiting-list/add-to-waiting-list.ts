/**
 * Put an applicant on the waiting list (US-12.2). The day they were written down is their place in
 * the queue (FR-3) — no number is reserved and no position is stored, because a stored position is
 * one somebody can edit.
 *
 * The eligibility bar is registration's own (FR-1), checked in `createWaitingListDetails`, so the two
 * screens cannot come to different answers about what a valid certificate is.
 */

import { createWaitingListDetails, type WaitingListDetails } from "@/domain/customer/waitingList";
import type { AuditLog, Clock, WaitingListEntry, WaitingListRepository } from "../ports";

/** The audit event every new applicant is recorded under. */
const WAITING_LIST_ADDED = "waitingList.added";

/**
 * The one value the *system* decided — when the applicant joined, which is the whole of their place in
 * the queue. Listing the typed fields would only repeat the entry.
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
 * @throws {CertificateExpired} if the certificate has already lapsed — registration's bar, applied at
 *   the door rather than months later at the head of the queue.
 */
export async function addToWaitingList(
  deps: AddToWaitingListDeps,
  input: AddToWaitingListInput,
): Promise<WaitingListEntry> {
  // One read of the clock: the day eligibility is judged on and the day that fixes their place in the
  // queue are the same day.
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
