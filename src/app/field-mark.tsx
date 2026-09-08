"use client";

/**
 * The two things that happen in the browser when a refusal names a field: the words appear under the
 * control, and the cursor goes to the first of them.
 *
 * Split from `field-refusal.ts` **by the directive alone** — a client module's exports arrive across
 * the boundary as client-reference proxies rather than values
 * (`docs/guideline/ui_styling_guide.md` §9), so what a `"use server"` action needs stays there.
 *
 * The reddened `<label>` is deliberately not here: it is one conditional class on an element each
 * form lays out differently, and a component owning the label would have to own the layout.
 */

import { useEffect, type RefObject } from "react";
import type { FieldRefusal } from "./field-refusal";

/**
 * The mark under a refused control — the other end of the summary by the button, which may be the
 * whole form away (442px on `/einstellungen`). `aria-describedby` from `marking` puts the two
 * together for a screen reader.
 *
 * It renders the refusal's **own** sentence. The other way round loses on any form holding more than
 * one field of a kind: with three money boxes, „Kein gültiger Betrag.“ by the button names none of
 * them, while a generic mark that *does* know its box says nothing worth reading.
 *
 * `testId` is the caller's, because several specs assert the exact text of a screen's *summary* and
 * one `…-error` id per screen is what keeps that unambiguous.
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
 * Put the cursor in the first field the refusal named — focusing scrolls it into view and says „hier“
 * in one gesture.
 *
 * Found by the path the action named rather than a rebuilt id (see `marking`). `fields` is the
 * dependency rather than the whole action state, so refusing the same field twice still moves the
 * cursor — which is what says the second attempt was read.
 *
 * `container` scopes the query, load-bearing on the customer record: eight independent forms there,
 * and `householdMembers.0.firstName` is not the only path that could repeat across them. Omitted, the
 * whole document is searched, which is right on a screen with one form.
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
