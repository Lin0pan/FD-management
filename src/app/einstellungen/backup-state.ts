/**
 * The state the restore form and its server action pass between them. Outside `actions.ts` because a
 * `"use server"` module may export nothing but async functions.
 */

import type { NoticeTier } from "../notice-tier";

export type RestoreActionState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly tier: NoticeTier }
  | {
      readonly status: "staged";
      /** The start that is ending; the screen waits for a different one. */
      readonly restartingFrom: string;
      readonly supervised: boolean;
    };

export const initialRestoreActionState: RestoreActionState = { status: "idle" };
