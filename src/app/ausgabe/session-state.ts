/**
 * The state the session controls pass to and from their server actions. Outside `session-actions.ts`
 * because a `"use server"` module may export nothing but async functions.
 *
 * One type for starting, ending and discarding: each of the three either happens — and the screen it
 * happens on is replaced wholesale by the revalidated page — or comes back with one sentence and its
 * tier (`notice-tier.ts`). There is no `saved`, for the same reason the serve form has none: the
 * control that did it is gone from the render that would have shown its answer.
 */

import type { NoticeTier } from "../notice-tier";

export type SessionActionState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly tier: NoticeTier };

export const initialSessionState: SessionActionState = { status: "idle" };
