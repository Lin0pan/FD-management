/**
 * What both household tables — the registration's (`neu/registration-form.tsx`) and the record's
 * (`[id]/household-editor.tsx`) — agree about a row: the shape it is held in while it is being
 * typed, and the box its static text sits in.
 *
 * One module for both for the reason `MEMBER_INPUT` and `memberPath` are shared
 * (`src/app/field-refusal.ts`): two spellings of one household-row decision is how the two tables
 * come to behave differently, with nothing failing anywhere.
 */

/** A household row as a form holds it: the raw strings, exactly as they were typed. */
export interface MemberRow {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: string;
}

/** The row an empty "add a member" button appends. */
export const EMPTY_ROW: MemberRow = { firstName: "", lastName: "", birthDate: "" };

/**
 * The box that puts a household row's static text on the line of the row's controls.
 *
 * Both household tables — the registration's (`neu/registration-form.tsx`) and the record's
 * (`[id]/household-editor.tsx`) — are `align-top` rather than `align-middle`, because a refused
 * field grows a mark under it and a middle-aligned row would then float its untouched neighbours
 * downwards. Top-aligning fixes that and moves the problem: a `TableCell`'s own text now starts at
 * the cell's 8px padding, while the `Input` beside it starts at 14px — 8px of padding plus the 6px
 * by which an `h-8` control centres a `text-sm` line inside itself. The row number sat 6px above
 * the name it numbers, and on the record the age sat 6px above the birthdate it is derived from.
 *
 * The fix is not a measured `pt-`: the first attempt was `pt-4`, which is 16px, and being 2px out
 * is what a nudged-until-it-looked-right number looks like. This gives the text **the control's own
 * box** — `h-8` is the height the styling guide states for `Input` and `Button` (§1) — and lets it
 * centre itself the way the input does. It stays correct if the type size changes, and there is no
 * arithmetic in it to get wrong.
 *
 * It is a `<div>` inside the cell rather than classes on the cell, because `display: flex` on a
 * `<td>` takes it out of the table's formatting context and the columns stop sizing themselves.
 *
 * One constant for both tables for the reason `MEMBER_INPUT` and `memberPath` are shared
 * (`src/app/field-refusal.ts`): two spellings of one household-row decision is how the two tables
 * come to line up differently, with nothing failing anywhere. It was exactly that — the record's
 * row number was corrected and the registration's was not.
 */
export const ROW_TEXT = "flex h-8 items-center";
