/**
 * The state a row's reissue form passes to and from its server action.
 *
 * It lives outside `actions.ts` for the reason every other `*-state.ts` here does: a `"use server"`
 * module may export nothing but async functions, so a type or a constant there would be a build-time
 * error.
 *
 * There is still no `saved` state, and for the same reason as before: a successful reissue
 * revalidates this screen, the row is then gone from the list, and the component holding any message
 * would go with it. What changed is what happens instead of nothing — the action now redirects with
 * the new number, and the page states it above the list (`issued-card.ts`). A rejection is the only
 * thing that comes back to the row, because a rejection is the one answer that leaves it standing.
 */

import type { NoticeTier } from "../notice-tier";

export type StaleReissueState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly tier: NoticeTier };

export const initialStaleReissueState: StaleReissueState = { status: "idle" };
