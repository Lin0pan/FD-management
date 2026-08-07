/**
 * The state the reissue form passes to and from its server action.
 *
 * It lives outside `actions.ts` for the reason `block-state.ts` does: a `"use server"` module may
 * export nothing but async functions, so a type or a constant there would be a build-time error.
 *
 * `saved` carries the number the reissue handed out. It used not to exist, on the argument that a
 * successful reissue revalidates the customer record and the card view, both of which then render
 * the new number from the store. That is true and it was not enough: a card number going from `1k1`
 * to `1k2` in a field further down the page is a fact somebody would have to go and check, not an
 * answer to the button they pressed. The number rides
 * back on the state rather than being read off the revalidated page because it is what staff write
 * on the physical card.
 */

import type { NoticeTier } from "../../notice-tier";

export type ReissueState =
  | { readonly status: "idle" }
  | { readonly status: "saved"; readonly cardNumber: string }
  | { readonly status: "error"; readonly message: string; readonly tier: NoticeTier };

export const initialReissueState: ReissueState = { status: "idle" };
