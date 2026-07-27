/**
 * Take an applicant off the waiting list — they withdrew, moved away or can no longer be reached
 * (US-12.2, FR-6).
 *
 * The row is kept, not deleted (FR-7). A waiting list is only worth the claim it makes — that the
 * longest wait was served first — and that claim can only be checked against a history that still
 * has the people who left in it. So a removal stamps the entry rather than erasing it, and the reason
 * is required: without it, a row that vanished from the queue cannot say whether the applicant went
 * of their own accord.
 *
 * Registering an applicant is *not* this use case. That removal is `registerFromWaitingList`'s, and
 * it happens only once the registration has actually landed.
 */

import { MissingAuditReason, WaitingListEntryNotFound } from "@/domain/errors";
import type { AuditLog, Clock, WaitingListRepository } from "../ports";

/** The audit event a withdrawal is recorded under. */
const WAITING_LIST_REMOVED = "waitingList.removed";

/** What the audit entry names as changed — exactly the two columns the removal stamps. */
const REMOVED_FIELDS = ["removedOn", "removalReason"] as const;

export interface RemoveFromWaitingListDeps {
  readonly waitingList: WaitingListRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface RemoveFromWaitingListInput {
  readonly entryId: number;
  /** Why they are coming off the list — required, kept on the row and shown verbatim. */
  readonly reason: string;
}

/**
 * Remove the applicant, keeping the trimmed reason and writing the audit trail.
 *
 * @throws {WaitingListEntryNotFound} if nobody is waiting under `entryId` — an unknown id, or one
 *   whose applicant has already been registered or removed.
 * @throws {MissingAuditReason} naming `waitingList.removed` if the reason is empty or whitespace.
 */
export async function removeFromWaitingList(
  deps: RemoveFromWaitingListDeps,
  { entryId, reason }: RemoveFromWaitingListInput,
): Promise<void> {
  const now = deps.clock.now();

  const entry = await deps.waitingList.findWaiting(entryId);
  if (entry === null) {
    throw new WaitingListEntryNotFound(entryId);
  }

  // Both questions are settled before anything is written: is this applicant still waiting, and does
  // the removal carry the reason that accounts for it.
  const trimmed = reason.trim();
  if (trimmed === "") {
    throw new MissingAuditReason(WAITING_LIST_REMOVED);
  }

  await deps.waitingList.remove(entryId, trimmed, now);
  await deps.audit.append({
    what: WAITING_LIST_REMOVED,
    changedFields: [...REMOVED_FIELDS],
    when: now,
    why: trimmed,
  });
}
