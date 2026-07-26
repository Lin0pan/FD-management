/**
 * The state a row's reissue form passes to and from its server action.
 *
 * It lives outside `actions.ts` for the reason every other `*-state.ts` here does: a `"use server"`
 * module may export nothing but async functions, so a type or a constant there would be a build-time
 * error.
 *
 * There is no `saved` state, and there deliberately is no message naming the new card number: a
 * successful reissue revalidates this screen, the row is then gone from the list, and the component
 * holding the message goes with it. The number staff copy onto the card is therefore shown *before*
 * the write, in the row itself.
 */

export type StaleReissueState =
  { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const initialStaleReissueState: StaleReissueState = { status: "idle" };
