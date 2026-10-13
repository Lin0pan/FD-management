"use client";

/**
 * The mask's note (US-41.7), read and written in place (US-16.3, US-16.5) — the moment a note is
 * learned is the moment the household is standing at the table, and FR-2 asks that nothing the
 * counter decision rests on cost a further click. „Bemerkung bearbeiten“ swaps the paragraph for the
 * field; nothing opens elsewhere and nothing has to be dismissed.
 *
 * `updateNotesAction` is the record's own action, unchanged and unwrapped — two screens writing a note
 * through two actions is how they come to disagree about what saving one means.
 *
 * The line the edit button stands on is the mask's footer as well, so the heavy actions arrive as
 * `children` into the same `FoldRow`. No rules here.
 */

import { useActionState, useId, useState } from "react";
import { SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { de } from "@/i18n/de";
import { updateNotesAction } from "../kunden/[id]/actions";
import { initialRecordFormState } from "../kunden/[id]/record-state";
import { FieldRejection } from "../field-mark";
import { marking, problemAt } from "../field-refusal";
import { FoldRow } from "../fold-row";
import { Confirmation, Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";

export function CounterNotes({
  customerId,
  notes,
  editable,
  children,
}: {
  customerId: number;
  /** The note as it stands. Prefilled rather than appended to: one note, edited in place. */
  notes: string;
  /** `updateNotes` refuses an archived household, so no control is offered that can only fail. */
  editable: boolean;
  /** The footer: the heavy actions, right of the edit button. */
  children: React.ReactNode;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(updateNotesAction, initialRecordFormState);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(notes);
  const [closedOn, setClosedOn] = useState(state);
  const labelId = useId();
  const fieldId = useId();
  const formId = useId();
  // The board is what stops a hand-out's „Ausgabe erfasst.“ from still sitting on screen under the
  // note that was just saved instead (`notice-board.tsx`).
  const showing = useNoticeSlot("counter-notes", state.status === "idle" ? null : state);

  // A saved note closes the field (adjusting state during render, not in an effect).
  if (state !== closedOn) {
    setClosedOn(state);
    if (state.status === "saved") {
      setEditing(false);
    }
  }

  // The one refusal this field can get is a note past the domain's length, marked as the record's own
  // editor marks it — the same action behind both.
  const problem = problemAt(state.status === "error" ? state.fields : undefined, "notes");
  const words = de.distribution.counter.notes;

  return (
    <>
      <span id={labelId} className="text-sm text-muted-foreground">
        {de.customers.record.notesHeading}
      </span>
      {editing ? (
        <form
          id={formId}
          action={formAction}
          className="flex max-w-[65ch] flex-col items-start gap-2"
        >
          <input type="hidden" name="customerId" value={customerId} />
          <Textarea
            id={fieldId}
            name="notes"
            rows={3}
            aria-labelledby={labelId}
            data-testid="counter-notes-field"
            value={text}
            onChange={(event) => setText(event.target.value)}
            {...marking("notes", fieldId, problem)}
          />
          {problem === null ? null : (
            <FieldRejection id={fieldId} problem={problem} testId="counter-field-error" />
          )}
          {showing && state.status === "error" ? (
            <Notice tone={state.tier} text={state.message} testId="counter-notes-error" />
          ) : null}
        </form>
      ) : (
        // `whitespace-pre-line`: a note is typed into a multi-line field, and a colleague's
        // paragraphs must reach the counter.
        <p
          data-testid="counter-notes"
          className="max-w-[65ch] text-[15px] leading-normal whitespace-pre-line"
        >
          {notes === "" ? de.distribution.counter.details.noNotes : notes}
        </p>
      )}
      <FoldRow>
        {/* Save and cancel take the edit button's place, so editing adds no line to the mask. */}
        {editing ? (
          <>
            <Button
              type="submit"
              form={formId}
              size="sm"
              disabled={pending}
              data-testid="counter-notes-submit"
            >
              {pending ? de.customers.record.saving : de.customers.record.notesSubmit}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              data-testid="counter-notes-cancel"
            >
              {words.cancel}
            </Button>
          </>
        ) : editable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setText(notes);
              setEditing(true);
            }}
            data-testid="counter-notes-open"
          >
            <SquarePen aria-hidden="true" data-icon="inline-start" />
            {notes === "" ? words.add : words.edit}
          </Button>
        ) : null}
        {showing && state.status === "saved" && !editing ? (
          <Confirmation
            text={de.customers.record.saved}
            testId="counter-notes-saved"
            className="w-fit py-1"
          />
        ) : null}
        {children}
      </FoldRow>
    </>
  );
}
