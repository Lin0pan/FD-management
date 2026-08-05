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
   * flat, and translating a domain fact into what the browser can use is the action's job. It is
   * also absent on purpose for the refusals that name no single field — a quota below the active
   * customer count is a collision between two numbers, and marking `quotaN` would say the value is
   * malformed when it is only too small.
   */
  readonly field?: string;
  /**
   * What was submitted, handed straight back so a refusal leaves the form as the staff member left
   * it (`docs/ui_redesign_einstellungen.md` §4.2d).
   *
   * **Present on a refusal, absent on a save**, and that asymmetry is the whole mechanism. React
   * resets an uncontrolled form once its action resolves — success or refusal alike — and a reset
   * restores each input from its `defaultValue` *attribute*. With the stored settings as the only
   * `defaultValue`, that reset rewound every field to what the database said: a rejected save
   * discarded four edits because one of them was wrong, and the screen then marked a field holding a
   * value nobody had typed and called it invalid. Feeding the submission back through makes the same
   * reset restore the question instead of deleting it — the mechanism `archive-search-state.ts`
   * already relies on from the other side. On a save there is nothing here, so the reset lands on
   * the freshly stored figures, which is what it should do.
   *
   * Raw strings, exactly as the form sent them, never parsed. The point is to give back what was
   * typed — `0`, `2,5o`, `2026-W2` and all — because a value the domain could not read is precisely
   * the one the staff member has to see in order to fix it.
   */
  readonly values?: SubmittedSettings;
}

/** The nine fields of the settings form as strings, keyed by the `name` each input carries. */
export interface SubmittedSettings {
  readonly quotaN: string;
  readonly portionsPerGrownUp: string;
  readonly portionsPerChild: string;
  readonly weekAnchorIsoWeek: string;
  readonly weekAnchorColour: string;
  readonly distributionWeekday: string;
  readonly reason: string;
  readonly pricePerGrownUp: string;
  readonly pricePerChild: string;
}

export const initialSaveSettingsState: SaveSettingsState = { status: "idle" };
