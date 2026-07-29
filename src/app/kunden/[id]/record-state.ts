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

export type RecordFormState =
  | { readonly status: "idle" }
  | { readonly status: "saved"; readonly saves: number }
  | { readonly status: "error"; readonly message: string };

export const initialRecordFormState: RecordFormState = { status: "idle" };

/** The `saved` state after one more successful save than `previous` reported. */
export function savedAfter(previous: RecordFormState): RecordFormState {
  return { status: "saved", saves: previous.status === "saved" ? previous.saves + 1 : 1 };
}
