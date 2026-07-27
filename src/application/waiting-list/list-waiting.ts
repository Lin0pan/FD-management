/**
 * The waiting list as staff read it: everyone still waiting, in the order they joined (US-12.2).
 *
 * The order and the numbering are the domain's (`inArrivalOrder`) rather than the query's, so that
 * this screen, the home-screen banner and the promotion cannot arrive at three different heads of the
 * queue. The position is computed here for the same reason: a screen that numbered the rows itself
 * would be a second statement of the order, and the two could drift.
 *
 * Nothing is written and there is no audit entry — reading a list changes nothing.
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
  /**
   * How many whole days they have been waiting today — derived from `addedOn` by the domain rule, so
   * the screen states the wait rather than working it out.
   */
  readonly daysWaiting: number;
  /**
   * Whether the certificate they joined with has lapsed by today. It never re-orders the list (FR-3):
   * an applicant keeps the place they earned by waiting, and the flag is what staff act on — they ask
   * for a renewal before the registration goes ahead (FR-5).
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
