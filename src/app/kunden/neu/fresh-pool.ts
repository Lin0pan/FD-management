/**
 * The one recovery a refused registration can offer by itself: a re-reading of the free numbers
 * after somebody else won the race for the one that was chosen (US-24).
 *
 * Without it the form goes on offering a number that provably cannot be saved, and the staff
 * member's obvious next move — picking it again — fails identically. Every *other* refusal leaves
 * the pool alone: the numbers are still what the page was rendered with, and a second query per
 * blank birthdate would be noise.
 *
 * It lives beside the two actions rather than inside either because both registration screens save
 * the same form and both can lose the same race. It is not a `"use server"` module: exporting this
 * from one would publish it as a callable endpoint, and it is a helper, not an action.
 */

import {
  proposeRegistration,
  type ProposeRegistrationDeps,
} from "@/application/customers/propose-registration";
import { CustomerNumberTaken } from "@/domain/errors";
import type { RegisterCustomerState } from "./register-customer-state";

/**
 * The `freeNumbers` a refusal should carry back, as a patch to spread into the error state: the
 * register as it stands now if `error` is a lost race, and nothing at all otherwise.
 *
 * A patch rather than a `ReadonlyArray<number> | undefined` so the field stays *absent* on the
 * refusals that did not re-read, which is what `RegisterCustomerState` documents and what lets the
 * form tell "no fresh pool" from "an empty one".
 */
export async function freshPoolAfterRace(
  deps: ProposeRegistrationDeps,
  error: unknown,
): Promise<Pick<RegisterCustomerState, "freeNumbers">> {
  if (!(error instanceof CustomerNumberTaken)) {
    return {};
  }
  const proposal = await proposeRegistration(deps);
  return { freeNumbers: proposal.freeNumbers };
}
