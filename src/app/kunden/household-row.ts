/**
 * What both household tables agree about a row: the shape it is held in while it is typed, and the
 * box its static text sits in. One module for both, for `MEMBER_INPUT`'s reason — two spellings of
 * one household-row decision is how the two tables come to behave differently, with nothing failing.
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
 * Whether this row is the customer themselves — the screens' reading of the rule
 * `createHouseholdMembers` enforces, and read the same way: a row is theirs when it *says* what they
 * do, a household row having no identity of its own. The refusal is the guard, this the courtesy.
 *
 * A customer with a field still blank matches nothing: on a registration form every row starts empty,
 * and an empty customer that matched them would lock the whole table on the way in.
 */
export function isCustomerRow(row: MemberRow, customer: MemberRow): boolean {
  const first = customer.firstName.trim();
  const last = customer.lastName.trim();
  const born = customer.birthDate.trim();
  if (first === "" || last === "" || born === "") {
    return false;
  }
  return (
    row.firstName.trim() === first && row.lastName.trim() === last && row.birthDate.trim() === born
  );
}

/**
 * The box that puts a household row's static text on the line of the row's controls.
 *
 * Both tables are `align-top`, because a refused field grows a mark under it and a middle-aligned row
 * would float its untouched neighbours downwards. That moves the problem: a `TableCell`'s text starts
 * at the cell's 8px padding while the `Input` beside it starts at 14px, so the row number sat 6px
 * above the name it numbers.
 *
 * **Not a measured `pt-`**: this gives the text **the control's own box** — `h-8`, the height the
 * styling guide states for `Input` and `Button` (§1) — and lets it centre itself the way the input
 * does, which stays correct if the type size changes.
 *
 * A `<div>` inside the cell rather than classes on it: `display: flex` on a `<td>` takes it out of
 * the table's formatting context and the columns stop sizing themselves.
 */
export const ROW_TEXT = "flex h-8 items-center";
