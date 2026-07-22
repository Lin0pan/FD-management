/**
 * The state the settings form and its server action pass between them.
 *
 * It lives outside `actions.ts` because a `"use server"` module may export nothing but async
 * functions — everything it exports becomes a callable server endpoint, so a plain object there is
 * a build-time error rather than a style question.
 */

/** What the form shows after a submission. `idle` is the state before anything was sent. */
export interface SaveSettingsState {
  readonly status: "idle" | "saved" | "error";
  readonly message?: string;
}

export const initialSaveSettingsState: SaveSettingsState = { status: "idle" };
