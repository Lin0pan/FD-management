/**
 * What the tick-off and the undo forms pass to and from their actions, and the two query parameters
 * a tick hands the undo through. Outside `actions.ts` because a `"use server"` module may export
 * nothing but async functions.
 *
 * There is no `saved` state: a tick removes its own row and an undo removes the notice it sits in,
 * so both redirect instead (as `/karten-neuausstellung` does).
 */

import type { NoticeTier } from "../notice-tier";

export type PrintState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly tier: NoticeTier };

export const initialPrintState: PrintState = { status: "idle" };

/** German, like every parameter staff can see in the address bar. */
export const PRINTED_CUSTOMER = "kunde";
export const PRINTED_CARD = "karte";
