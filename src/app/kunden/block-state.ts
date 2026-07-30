/**
 * The state the block and unblock forms pass to and from their server actions.
 *
 * It lives outside `actions.ts` because a `"use server"` module may export nothing but async
 * functions — a plain type or object there would be a build-time error, not a style question.
 *
 * There is no `saved` state: a successful block or unblock revalidates the record, which re-renders
 * with the new status, so the only thing a form ever gets back is a rejection.
 */

export type BlockState =
  { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const initialBlockState: BlockState = { status: "idle" };
