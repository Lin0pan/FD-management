/**
 * The state the customer record's editing forms pass to and from their server actions (US-16.5).
 *
 * It lives outside `actions.ts` because a `"use server"` module may export nothing but async
 * functions — a plain type or object there would be a build-time error, not a style question.
 *
 * One shape serves all five forms — household, personal data, notes, group and certificate renewal —
 * because they all answer the same three things: nothing typed yet, saved, or refused with a reason.
 * The forms differ in what they edit, not in what comes back, and five identical unions would only
 * be five places to change when one of them grows a fourth answer.
 *
 * `saved` carries a counter rather than being a bare flag. A record is corrected twice in a row more
 * often than anywhere else in the app — a name, then the address — and a `key` on the counter is
 * what remounts the form so its fields come back from the freshly revalidated record. Keying on the
 * saved *values* would not do it: saving the same correction twice produces an identical state, and
 * a form that only resets when something changed keeps the previous text (the same reason the
 * registration screen counts rather than compares).
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
       * The fields the refusal names, where it names any, so the form can mark each one and put the
       * words beside it (`docs/guideline/ui_styling_guide.md` §7).
       *
       * The household editor is why this is a list. It carries a day field per member, so a form
       * filled in a hurry fails in three rows at once, and „Kein gültiges Datum.“ under the button
       * named none of them — on the one screen in the app where the same three fields repeat down a
       * table and the summary is the length of the household away from the row it means.
       *
       * Absent on the refusals that name no field: a stale hidden `customerId`, an archived record,
       * a group that was already the household's. Those stay a summary by the button and mark
       * nothing.
       */
      readonly fields?: ReadonlyArray<FieldRefusal>;
    };

export const initialRecordFormState: RecordFormState = { status: "idle" };

/** The `saved` state after one more successful save than `previous` reported. */
export function savedAfter(previous: RecordFormState): RecordFormState {
  return { status: "saved", saves: previous.status === "saved" ? previous.saves + 1 : 1 };
}
