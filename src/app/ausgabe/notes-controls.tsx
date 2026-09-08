"use client";

/**
 * Writing the Bemerkung without leaving the counter (US-16.3, US-16.5) — the moment a note is learned
 * is the moment the household is standing at the table, and FR-2 asks that nothing the counter
 * decision rests on cost a further click.
 *
 * A disclosure rather than a permanent field, the note being read on every lookup and written on
 * perhaps one in twenty. Deliberately *not* a dialog: at the counter nothing may have to be dismissed
 * before the next customer is served.
 *
 * `updateNotesAction` is the record's own action, unchanged and unwrapped — two screens writing a note
 * through two actions is how they come to disagree about what saving one means.
 *
 * A client component for `useActionState` and for the controlled field, so a rejected save comes back
 * with the text still in it. No rules here.
 */

import { useActionState, useId, useState } from "react";
import { SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { de } from "@/i18n/de";
import { updateNotesAction } from "../kunden/[id]/actions";
import { initialRecordFormState } from "../kunden/[id]/record-state";
import { ControlSummary } from "../disclosure";
import { FieldRejection } from "../field-mark";
import { marking, problemAt } from "../field-refusal";
import { Confirmation, Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";

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
  // Generated, not the record editor's fixed id: nothing here should depend on there being exactly
  // one note field in the document.
  const fieldId = useId();
  // The board is what stops a hand-out's „Ausgabe erfasst.“ from still sitting on screen under the
  // note that was just saved instead (`notice-board.tsx`).
  const showing = useNoticeSlot("counter-notes", state.status === "idle" ? null : state);

  // The one refusal this field can get is a note past the domain's length, marked as the record's own
  // editor marks it — the same action behind both.
  const problem = problemAt(state.status === "error" ? state.fields : undefined, "notes");

  return (
    <details className="group">
      <ControlSummary testId="counter-notes-open">
        <SquarePen aria-hidden="true" data-icon="inline-start" />
        {notes === "" ? de.distribution.counter.notes.add : de.distribution.counter.notes.edit}
      </ControlSummary>
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
