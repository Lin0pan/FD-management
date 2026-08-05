/**
 * The state the block and unblock forms pass to and from their server actions.
 *
 * It lives outside `actions.ts` because a `"use server"` module may export nothing but async
 * functions — a plain type or object there would be a build-time error, not a style question.
 *
 * `saved` used not to exist, on the argument that a successful block revalidates the record, which
 * re-renders with the new status. It does, and a status pill changing colour halfway up a long
 * record is not an answer to the button at the bottom of it — the block and the unblock were two of
 * the six writes that told the staff member nothing at all
 * (`docs/ui_action_feedback_review.md` §3.1). It carries no payload: what changed is the status, and
 * `BlockControls` knows which of the two writes produced the one it is now rendering.
 */

export type BlockState =
  | { readonly status: "idle" }
  | { readonly status: "saved" }
  | { readonly status: "error"; readonly message: string };

export const initialBlockState: BlockState = { status: "idle" };

/** The one `saved`, shared: the state carries nothing, so a second object would only be a copy. */
export const blockSaved: BlockState = { status: "saved" };
