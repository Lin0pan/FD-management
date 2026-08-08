/**
 * The query parameter a completed removal hands its confirmation to the list through.
 *
 * A module of its own for the reason `add-form-anchor.ts` is one: it is read by a `"use server"`
 * action and by a server component, and a `"use server"` module may export nothing but async
 * functions.
 *
 * It carries `1` and nothing else. The applicant could be named in the URL — the row knows who it
 * is — and deliberately is not: a browser history is the last place DF's data should end up, and
 * the name was already read one click earlier, in the confirmation step the removal goes through.
 */
export const REMOVED = "entfernt";
