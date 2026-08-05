/**
 * The state the settings form and its server action pass between them.
 *
 * It lives outside `actions.ts` because a `"use server"` module may export nothing but async
 * functions — everything it exports becomes a callable server endpoint, so a plain object there is
 * a build-time error rather than a style question.
 */

import type { NoticeTier } from "../notice-tier";

/** What the form shows after a submission. `idle` is the state before anything was sent. */
export interface SaveSettingsState {
  readonly status: "idle" | "saved" | "error";
  readonly message?: string;
  /**
   * Which of the two refusals this is, decided from the typed error (`notice-tier.ts`).
   *
   * Optional for the same reason `message` is: this is a flat interface rather than a discriminated
   * union, so neither field can be required while `idle` and `saved` share the shape.
   */
  readonly tier?: NoticeTier;
  /**
   * The `name` of the input a refusal names, where it names one, so the form can mark it and put
   * the words beside it (`docs/ui_redesign_einstellungen.md` §4.2c).
   *
   * The **input's** name, not the domain's: `Settings` nests the anchor week and an HTML form is
   * flat, and translating a domain fact into what the browser can use is the action's job. It also
   * absent on purpose for the refusals that name no single field — a quota below the active
   * customer count is a collision between two numbers, and marking `quotaN` would say the value is
   * malformed when it is only too small.
   */
  readonly field?: string;
}

export const initialSaveSettingsState: SaveSettingsState = { status: "idle" };
