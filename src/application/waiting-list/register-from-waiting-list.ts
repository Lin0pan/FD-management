/**
 * Register a waiting applicant and take them off the list — in that order (US-12.2).
 *
 * The order is the whole of this use case. Registration can fail on the last field of the form, and
 * an applicant removed a moment earlier would have lost the place they waited months for with nothing
 * to show for it. So the entry stays until the customer exists: a failed registration leaves the
 * queue exactly as it was, and staff can try again.
 *
 * Registration itself is not re-implemented here. It goes through `registerCustomer` like every other
 * registration — the same slot allocation, the same first card, the same audit entry — because a
 * second registration path is how two registrations start to differ (US-11.3 for the precedent). What
 * this adds is the removal that must follow it, which is exactly what a server action must not be
 * trusted to remember.
 */

import type { RegisteredCustomer } from "@/domain/customer/customer";
import { WaitingListEntryNotFound } from "@/domain/errors";
import {
  registerCustomer,
  type RegisterCustomerDeps,
  type RegisterCustomerInput,
} from "../customers/register-customer";
import type { WaitingListRepository } from "../ports";

/** The audit event a promotion off the waiting list is recorded under. */
const WAITING_LIST_PROMOTED = "waitingList.promoted";

/** What the audit entry names as changed — the two columns the removal stamps. */
const PROMOTED_FIELDS = ["removedOn", "removalReason"] as const;

export interface RegisterFromWaitingListDeps extends RegisterCustomerDeps {
  readonly waitingList: WaitingListRepository;
}

export interface RegisterFromWaitingListInput extends RegisterCustomerInput {
  /** The entry this registration came from — checked before it starts, removed once it lands. */
  readonly entryId: number;
}

/**
 * Register the applicant, then remove their entry, and hand back the customer.
 *
 * @throws {WaitingListEntryNotFound} if nobody is waiting under `entryId` — checked *before* the
 *   registration, so a stale form cannot create a customer whose entry can never be cleared.
 * @throws {MissingRequiredField} for a name, address part or certificate type left blank.
 * @throws {EmptyHousehold} if the household has no members.
 * @throws {BirthDateInFuture} if the applicant or a member was born after today.
 * @throws {NoFreeCustomerNumber} if every slot up to the quota is taken.
 * @throws {CustomerNumberTaken} if the slot staff chose is held, or if a concurrent registration
 *   kept winning the allocated one. The entry is still waiting either way.
 * @throws {CustomerNumberOutOfRange} if the slot staff chose is not a whole number within the quota
 *   in force.
 */
export async function registerFromWaitingList(
  deps: RegisterFromWaitingListDeps,
  input: RegisterFromWaitingListInput,
): Promise<RegisteredCustomer> {
  const entry = await deps.waitingList.findWaiting(input.entryId);
  if (entry === null) {
    throw new WaitingListEntryNotFound(input.entryId);
  }

  const customer = await registerCustomer(deps, input);

  // The registration's own instant, not a second reading of the clock: the entry left the queue
  // because this customer was created, and the two happened at the same moment by definition.
  const registeredAt = customer.registeredOn;
  // The one machine-written reason in the system besides the reminder trail's — the removal is not a
  // judgement anybody made, so what it records is the slot the applicant went to. It is a key and a
  // value rather than a sentence because there is no human to quote and no dictionary down here.
  const reason = `customerNumber=${customer.customerNumber}`;

  await deps.waitingList.remove(input.entryId, reason, registeredAt);
  await deps.audit.append({
    what: WAITING_LIST_PROMOTED,
    changedFields: [...PROMOTED_FIELDS],
    when: registeredAt,
    why: reason,
  });
  return customer;
}
