"use client";

/**
 * The two things that happen in the browser when a refusal names a field: the words appear under the
 * control, and the cursor goes to the first of them.
 *
 * Split from `field-refusal.ts` by the directive alone. Everything a `"use server"` action needs to
 * *say* what it refused lives there, in a module with no directive, because a client module's
 * exports arrive across the boundary as client-reference proxies rather than as values
 * (`docs/guideline/ui_styling_guide.md` §9). What is here is what only a browser can do.
 *
 * The reddened `<label>` is deliberately not here. It is one conditional class on an element each
 * form lays out differently — a twelve-column grid slot, a subgrid row, a table cell — and a
 * component that owned the label would have to own the layout with it.
 */

import { useEffect, type RefObject } from "react";
import type { FieldRefusal } from "./field-refusal";

/**
 * The mark under a refused control.
 *
 * The summary notice sits by the button and the field it names may be the whole form above it —
 * measured at 442px on `/einstellungen` and further on the registration — which is what made a
 * refused save a hunt for the box. This is the other end of that: the words at the field, with the
 * reddened label and the `aria-invalid` border pointing at it, and `aria-describedby` (from
 * `marking`) so a screen reader reads the two together rather than leaving the sentence to be found
 * by eye.
 *
 * It renders the refusal's **own** sentence. `/einstellungen` used to show one generic „Ungültiger
 * Wert.“ here instead and say the specific thing in the summary — the same two facts, swapped. That
 * way round loses on any form holding more than one field of a kind: with three money boxes on the
 * settings screen, „Kein gültiger Betrag.“ by the button names none of them, while the mark that
 * *does* know which box it is under says nothing worth reading. The distinction between a day left
 * blank and a day nobody can read (ADR-013) is the same argument on the registration.
 *
 * The `testId` is the caller's because each screen keeps its own: several specs assert the exact
 * text of a screen's *summary*, and one `…-error` id per screen is what keeps that assertion
 * unambiguous.
 */
export function FieldRejection({
  id,
  problem,
  testId,
}: {
  /** The control's id. The mark's own is `${id}-error`, which `marking` points at. */
  id: string;
  problem: string;
  testId: string;
}): React.ReactElement {
  return (
    <p id={`${id}-error`} data-testid={testId} className="text-sm text-destructive">
      {problem}
    </p>
  );
}

/**
 * Put the cursor in the first field the refusal named.
 *
 * The summary sits by the button and the field it names may be the whole form above it, so without
 * this a refusal is read and then hunted for. Focusing scrolls it into view and says „hier“ in one
 * gesture — the same move `/kunden/neu` makes after an archive pre-fill, for the same reason.
 *
 * The control is found by the path the action named it with rather than by a rebuilt id (see
 * `marking`), and `fields` is the dependency rather than the whole action state: `useActionState`
 * hands back a fresh object per submission, so refusing the same field twice in a row still moves
 * the cursor, which is what says the second attempt was read at all.
 *
 * `container` scopes the query, and on the customer record it is load-bearing rather than tidy: that
 * page carries eight independent forms, each with its own state, and `householdMembers.0.firstName`
 * is not the only path that could repeat across them. Given the form's own element, a refusal can
 * only ever focus a control inside the form that was submitted. Omitted, the whole document is
 * searched, which is right on a screen with one form.
 */
export function useFocusFirstRefusal(
  fields: ReadonlyArray<FieldRefusal> | undefined,
  container?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const first = fields?.[0];
    if (first === undefined) {
      return;
    }
    const root: ParentNode = container?.current ?? document;
    root.querySelector<HTMLElement>(`[data-field="${first.path}"]`)?.focus();
  }, [fields, container]);
}
