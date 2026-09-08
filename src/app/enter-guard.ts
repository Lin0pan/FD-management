/**
 * Enter, in a form that may only be saved on purpose.
 *
 * Native behaviour submits a one-button form on Enter in any field — right for a search box, wrong
 * where a save is a decision. DF reported it from „Kunde aufnehmen“: a stray Enter registered a
 * half-typed household, and that save burns a customer number and issues a card.
 *
 * **The guard hangs on individual `<form>` elements, never on the document.** The counter's *lookup*
 * form is driven by Enter (US-21) while its two write forms are guarded (US-29.7), and the
 * archive-search panel is a search box sitting beside the registration form.
 *
 * A plain module with no directive and no DOM at import time, so the rule below is unit-testable in
 * Node while {@link guardEnter} narrows in the browser.
 */

import type React from "react";

/**
 * Whether Enter in this control would submit the form around it.
 *
 * **An allowlist rather than a list of exceptions**: only a text-ish `<input>` and a `<select>` submit
 * implicitly, and anything unforeseen falls through to native behaviour. Written the other way round,
 * a new kind of control would silently lose its Enter.
 *
 * Enter on the *focused* submit button still saves — the keydown lands on a `<button>` and nothing is
 * prevented. What goes away is submitting from a field, not keyboard operation of the form.
 *
 * @param tagName The element's `tagName`, in either case.
 * @param inputType The `type` of an `<input>`, or `null` for anything else — including an input with
 *   no `type`, which is a text field.
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
 * `onKeyDown` for a form that may only be saved by its button. On the form rather than each field:
 * the controls are written in four different places, and a guard remembered per input is one the next
 * field will be added without.
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
