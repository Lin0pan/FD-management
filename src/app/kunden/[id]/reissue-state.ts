/**
 * The state the reissue form passes to and from its server action.
 *
 * It lives outside `actions.ts` for the reason `block-state.ts` does: a `"use server"` module may
 * export nothing but async functions, so a type or a constant there would be a build-time error.
 *
 * There is no `saved` state. A successful reissue revalidates the customer record and the card view,
 * both of which then render the new number from the store — so the only thing the form ever gets
 * back is a rejection.
 */

export type ReissueState =
  { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const initialReissueState: ReissueState = { status: "idle" };
