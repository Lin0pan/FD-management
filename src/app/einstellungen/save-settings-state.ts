/**
 * The state the settings form and its server action pass between them. Outside `actions.ts` because a
 * `"use server"` module may export nothing but async functions.
 */

import type { FieldRefusal } from "../field-refusal";
import type { NoticeTier } from "../notice-tier";

/** What the form shows after a submission. `idle` is the state before anything was sent. */
export interface SaveSettingsState {
  readonly status: "idle" | "saved" | "error";
  readonly message?: string;
  /**
   * Which of the two refusals this is, from the typed error (`notice-tier.ts`). Optional because this
   * is a flat interface rather than a union, so `idle` and `saved` share the shape.
   */
  readonly tier?: NoticeTier;
  /**
   * The fields a refusal names, so the form can mark each and put the words beside it — the
   * **inputs'** names, not the domain's, translating being the action's job.
   *
   * Absent on purpose where a refusal names no single field: a quota below the active customer count
   * is a collision between two numbers, and marking `quotaN` would call it malformed.
   *
   * A **list**, because the schema checks every field independently — singular meant mistyping two
   * money boxes reported one, and the corrected save was refused again for the other. The domain
   * still names at most one, and that asymmetry is honest.
   */
  readonly fields?: ReadonlyArray<FieldRefusal>;
  /**
   * What was submitted, handed straight back so a refusal leaves the form as the staff member left it.
   *
   * **Present on a refusal, absent on a save**, and that asymmetry is the whole mechanism: React
   * resets an uncontrolled form once its action resolves and restores each input from its
   * `defaultValue` *attribute*, so with only the stored settings there a rejected save discarded four
   * edits because one was wrong. Feeding the submission back makes the same reset restore the
   * question instead of deleting it.
   *
   * Raw strings, never parsed — `0`, `2,5o`, `2026-W2` and all — because a value the domain could not
   * read is precisely the one the staff member has to see in order to fix it.
   */
  readonly values?: SubmittedSettings;
}

/** The eight fields of the settings form as strings, keyed by the `name` each input carries. */
export interface SubmittedSettings {
  readonly quotaN: string;
  readonly weekAnchorIsoWeek: string;
  readonly weekAnchorColour: string;
  readonly distributionWeekday: string;
  readonly reason: string;
  readonly pricePerGrownUp: string;
  readonly pricePerChild: string;
  /**
   * The Maximalpreis, where `""` is a value rather than a gap: a refusal has to hand an emptied field
   * back as empty, or correcting the field beside it would restore the cap that was just removed.
   */
  readonly priceCap: string;
}

export const initialSaveSettingsState: SaveSettingsState = { status: "idle" };
