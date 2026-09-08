/**
 * The state the customer record's editing forms pass to and from their server actions (US-16.5).
 * Outside `actions.ts` because a `"use server"` module may export nothing but async functions.
 *
 * One shape for all five forms: they differ in what they edit, not in what comes back, and five
 * identical unions would be five places to change when one grows a fourth answer.
 *
 * **`saved` carries a counter rather than a bare flag.** A record is corrected twice in a row more
 * often than anywhere else, and a `key` on the counter is what remounts the form. Keying on the saved
 * *values* would not do it: saving the same correction twice produces an identical state.
 */

import type { FieldRefusal } from "../../field-refusal";
import type { NoticeTier } from "../../notice-tier";

export type RecordFormState =
  | { readonly status: "idle" }
  | { readonly status: "saved"; readonly saves: number }
  | {
      readonly status: "error";
      readonly message: string;
      readonly tier: NoticeTier;
      /**
       * The fields the refusal names, so the form can mark each (`docs/guideline/ui_styling_guide.md`
       * §7). A **list** because of the household editor: a day field per member fails in three rows at
       * once, on the one screen where the summary is the length of the household away from the row it
       * means.
       *
       * Absent where a refusal names no field — a stale hidden `customerId`, an archived record.
       */
      readonly fields?: ReadonlyArray<FieldRefusal>;
    };

export const initialRecordFormState: RecordFormState = { status: "idle" };

/** The `saved` state after one more successful save than `previous` reported. */
export function savedAfter(previous: RecordFormState): RecordFormState {
  return { status: "saved", saves: previous.status === "saved" ? previous.saves + 1 : 1 };
}
