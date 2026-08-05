/**
 * The query parameter a completed archive hands its confirmation to the screen it was pressed on.
 *
 * A module of its own because it is read by a `"use server"` action and by two server components,
 * and a `"use server"` module may export nothing but async functions.
 *
 * It has to be a parameter rather than a bare navigation back to the same path: measured, a
 * `redirect` to the URL the browser is already on leaves the scroll position exactly where it was,
 * and where it was is 2 238px down, at the control. Changing the URL is what makes it a navigation,
 * and a navigation is what puts the top of the record — where everything this write did is stated —
 * in front of the person who pressed the button.
 */
export const ARCHIVED = "archiviert";
