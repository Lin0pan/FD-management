/**
 * Enter, in a form that may only be saved on purpose.
 *
 * A form with one submit button submits when Enter is pressed in any of its fields — native
 * behaviour, and the right behaviour for a search box. It is the wrong behaviour for the screens
 * where a save is a decision. DF reported it from „Kunde aufnehmen": a stray Enter registered a
 * customer while the household was still half-typed, or while the group was still the proposed one
 * rather than the one they meant to pick. That save is not undone by a second keystroke — it burns a
 * customer number and issues a card.
 *
 * So on the six multi-field data-entry forms, Enter in a field does nothing and the form is saved by
 * its button. Not everywhere: the counter loop on `/ausgabe` is *driven* by Enter (US-21), and the
 * customer search and the archive search are search boxes. The guard therefore hangs on individual
 * `<form>` elements and never on the document — which is also what keeps the archive-search panel
 * working next to the registration form it sits beside on the same screen.
 *
 * A plain module, no directive and no DOM at import time, so the rule below can be unit-tested in
 * Node while {@link guardEnter} does the narrowing in the browser.
 */

import type React from "react";

/**
 * Whether Enter in this control would submit the form around it.
 *
 * An allowlist rather than a list of exceptions: only a text-ish `<input>` and a `<select>` submit
 * implicitly. A `<textarea>` takes Enter for its newline, a `<summary>` for its disclosure, a
 * `<button>` and an `<a>` for their own activation — and anything unforeseen falls through to native
 * behaviour, which for every other element is to do nothing. Written the other way round, a new kind
 * of control would silently lose its Enter.
 *
 * The button case is the one worth saying out loud: Enter on the *focused* submit button still
 * saves, because the keydown lands on a `<button>` and nothing is prevented. What goes away is
 * submitting from a field, not keyboard operation of the form.
 *
 * @param tagName The element's `tagName`, in either case.
 * @param inputType The `type` of an `<input>`, or `null` for anything else. An input with no `type`
 *   is a text field, so `null` on an `INPUT` counts as one.
 */
export function submitsOnEnter(tagName: string, inputType: string | null): boolean {
  const tag = tagName.toUpperCase();
  if (tag === "SELECT") {
    return true;
  }
  if (tag !== "INPUT") {
    return false;
  }
  const type = (inputType ?? "text").toLowerCase();
  return type !== "submit" && type !== "button" && type !== "reset" && type !== "image";
}

/**
 * `onKeyDown` for a form that may only be saved by its button.
 *
 * Listening on the form rather than on each field: the controls are written in four different
 * places (`Field`, `MemberCell`, `TextField`, hand-written selects), and a guard that has to be
 * remembered per input is one the next field will be added without.
 */
export function guardEnter(event: React.KeyboardEvent<HTMLFormElement>): void {
  if (event.key !== "Enter") {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const inputType = target instanceof HTMLInputElement ? target.type : null;
  if (submitsOnEnter(target.tagName, inputType)) {
    event.preventDefault();
  }
}
