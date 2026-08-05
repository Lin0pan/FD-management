/**
 * The state the archive form passes to and from its server action.
 *
 * It lives outside the action module because a `"use server"` module may export nothing but async
 * functions — a plain type or object there is a build-time error, not a style question.
 *
 * There is no `saved` state: a successful archive revalidates both screens the control appears on,
 * and each re-renders read-only, so the only thing the form ever gets back is a rejection.
 */

import type { NoticeTier } from "../notice-tier";

export type ArchiveState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly tier: NoticeTier };

export const initialArchiveState: ArchiveState = { status: "idle" };
