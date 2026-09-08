/**
 * Everyone still waiting, in the order they joined (US-12.2). The order and the numbering are the
 * domain's (`inArrivalOrder`) rather than the query's, so this screen, the banner and the promotion
 * cannot arrive at three different heads of the queue.
 */

import { isExpired } from "@/domain/customer/certificate";
import { daysWaiting, inArrivalOrder } from "@/domain/customer/waitingList";
import type { Clock, WaitingListEntry, WaitingListRepository } from "../ports";

export interface ListWaitingDeps {
  readonly waitingList: WaitingListRepository;
  readonly clock: Clock;
}

/** One applicant, where they stand in the queue, and whether their certificate outlived the wait. */
export interface WaitingListPlace {
  /** Their place in the queue, counting from 1 — derived from the order, never stored. */
  readonly position: number;
  readonly entry: WaitingListEntry;
  /** Whole days waited, derived by the domain rule so the screen states it rather than works it out. */
  readonly daysWaiting: number;
  /**
   * Whether their certificate has lapsed. It never re-orders the list (FR-3) — an applicant keeps the
   * place they earned by waiting; staff ask for a renewal before the registration (FR-5).
   */
  readonly certificateExpired: boolean;
}

/** Everyone still waiting, longest wait first. */
export async function listWaiting(deps: ListWaitingDeps): Promise<ReadonlyArray<WaitingListPlace>> {
  const today = deps.clock.now();
  const waiting = await deps.waitingList.listWaiting();

  return inArrivalOrder(waiting).map((entry, index) => ({
    position: index + 1,
    entry,
    daysWaiting: daysWaiting(entry, today),
    certificateExpired: isExpired(entry.certificate, today),
  }));
}
