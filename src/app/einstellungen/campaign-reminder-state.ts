/**
 * The state the campaign reminder's forms and their server actions pass between them. Outside
 * `actions.ts` because a `"use server"` module may export nothing but async functions.
 */

import type { FieldRefusal } from "../field-refusal";
import type { NoticeTier } from "../notice-tier";

/** What one of the section's forms shows after a submission. `idle` is before anything was sent. */
export interface CampaignReminderActionState {
  readonly status: "idle" | "saved" | "error";
  readonly message?: string;
  readonly tier?: NoticeTier;
  /** Only ever `name` — the section's one field. */
  readonly fields?: ReadonlyArray<FieldRefusal>;
}

export const initialCampaignReminderActionState: CampaignReminderActionState = { status: "idle" };
