/**
 * What the tick-off and the undo forms pass to and from their actions, and the two query parameters
 * a tick hands the undo through — outside `actions.ts`, which may export only async functions. No
 * `saved` state: both actions redirect, as `/karten-neuausstellung` does.
 */

import { z } from "zod";
import type { NoticeTier } from "../notice-tier";

export type PrintState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly tier: NoticeTier };

export const initialPrintState: PrintState = { status: "idle" };

/** German, like every parameter staff can see in the address bar. */
export const PRINTED_CUSTOMER = "kunde";
export const PRINTED_CARD = "karte";

/** A customer id or a card index as a hidden field or the address bar carries it. */
export const wholeNumber = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform((value): number => Number(value));
