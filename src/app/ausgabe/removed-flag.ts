/**
 * The query parameter a removed hand-out hands its confirmation to the counter through.
 *
 * A module of its own because it is read by a `"use server"` action and by a server component, and a
 * `"use server"` module may export nothing but async functions.
 *
 * The counter's other parameter, `nummer`, is carried through the redirect with it: a removal is a
 * correction to the household that is *still* on the screen, and losing the lookup would send staff
 * back to the number field to type a number they had just typed.
 */
export const RECORD_REMOVED = "entfernt";
