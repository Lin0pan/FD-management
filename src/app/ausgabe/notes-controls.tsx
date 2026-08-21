"use client";

/**
 * Writing the Bemerkung without leaving the counter (US-16.3, US-16.5).
 *
 * The note is what one staff member leaves for the next — "bringt ab jetzt die Tochter mit", "der
 * Nachweis liegt bei der Behörde" — and the moment it is learned is the moment the household is
 * standing at the table. Until now the counter only *showed* it: writing one meant opening the
 * customer record, which loses the lookup and the queue's place. FR-2 asks that nothing the counter
 * decision rests on cost a further click; this was the one field on the card that did.
 *
 * A disclosure rather than a field that is always there, because the note is read on every lookup
 * and written on perhaps one in twenty. Closed, it is a button; open, it is the record's editor
 * with the same words on it. It is deliberately *not* a dialog: at the counter nothing may have to
 * be dismissed before the next customer can be served (`serve-controls.tsx` says the same about the
 * removal confirmation).
 *
 * `updateNotesAction` is the customer record's own action, unchanged and unwrapped. It already
 * revalidates `/ausgabe` alongside the record, so the paragraph above this fold shows the new note
 * as soon as the save returns. Two screens writing a note through two actions is how two screens
 * come to disagree about what saving one means — the same argument `BlockControls` and
 * `ArchiveControls` make by being the same component on both.
 *
 * A client component for the two things that need the browser: `useActionState` reports the answer
 * back beside the button, and the field is controlled so a rejected save comes back with the text
 * still in it. It holds no rules — the length bound, the refusal for an archived household and the
 * audit entry are all `updateNotes`'s.
 */

import { useActionState, useId, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { updateNotesAction } from "../kunden/[id]/actions";
import { initialRecordFormState } from "../kunden/[id]/record-state";
import { FieldRejection } from "../field-mark";
import { marking, problemAt } from "../field-refusal";
import { Confirmation, Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";

/**
 * The `<summary>`-as-control recipe, shared verbatim with `BlockControls` and `ArchiveControls`:
 * closed, a control must not read as a collapsed section spanning the row
 * (`docs/guideline/ui_styling_guide.md` §6).
 */
const SUMMARY = "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden";

export function NotesControls({
  customerId,
  notes,
}: {
  customerId: number;
  /** The note as it stands. Prefilled rather than appended to: one note, edited in place. */
  notes: string;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(updateNotesAction, initialRecordFormState);
  const [text, setText] = useState(notes);
  // Generated, not the record editor's fixed `notes-editor-field`: the id has to be this instance's,
  // and nothing on this screen should depend on there being exactly one note field in the document.
  const fieldId = useId();
  // The counter carries the serve, the correction, two certificate actions, the block and the
  // archive. The board is what stops a hand-out's „Ausgabe erfasst." from still sitting on screen
  // under the note the staff member has just saved instead (`notice-board.tsx`).
  const showing = useNoticeSlot("counter-notes", state.status === "idle" ? null : state);

  // The one refusal this field can get is a note past the domain's length, and it marks the box the
  // same way the record's own note editor does — it is the same action behind both.
  const problem = problemAt(state.status === "error" ? state.fields : undefined, "notes");

  return (
    <details>
      <summary
        data-testid="counter-notes-open"
        className={cn(buttonVariants({ variant: "outline" }), SUMMARY)}
      >
        {notes === "" ? de.distribution.counter.notes.add : de.distribution.counter.notes.edit}
      </summary>
      <form action={formAction} className="mt-3 flex flex-col items-start gap-3">
        <input type="hidden" name="customerId" value={customerId} />
        <div className="flex w-full max-w-prose flex-col gap-1.5">
          {/* „(optional)" is true here in a way it is not on the paragraph above: an empty note is a
              legitimate save, and clearing the field is how a note that no longer applies is
              removed. */}
          <label
            htmlFor={fieldId}
            className={`text-sm font-medium ${problem === null ? "" : "text-destructive"}`.trimEnd()}
          >
            {de.customers.fields.notes}
          </label>
          <Textarea
            id={fieldId}
            name="notes"
            rows={4}
            data-testid="counter-notes-field"
            value={text}
            onChange={(event) => setText(event.target.value)}
            {...marking("notes", fieldId, problem)}
          />
          {problem === null ? null : (
            <FieldRejection id={fieldId} problem={problem} testId="counter-field-error" />
          )}
        </div>
        {/* `outline`, not the default fill: the one filled button on this screen is the hand-out,
            and a note must never compete with it. */}
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          data-testid="counter-notes-submit"
        >
          {pending ? de.customers.record.saving : de.customers.record.notesSubmit}
        </Button>
        {showing && state.status === "saved" ? (
          <Confirmation text={de.customers.record.saved} testId="counter-notes-saved" />
        ) : null}
        {showing && state.status === "error" ? (
          <Notice tone={state.tier} text={state.message} testId="counter-notes-error" />
        ) : null}
      </form>
    </details>
  );
}
