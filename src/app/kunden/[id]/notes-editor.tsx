"use client";

/**
 * The free-text note staff leave for the counter (US-16.3).
 *
 * A multi-line field with a save of its own, because a note is its own decision with its own audit
 * entry — not a field of the personal data. The hint says where it turns up, since a note nobody
 * knows is read out at the counter is a note written for nobody (FR-5).
 *
 * An empty note is a legitimate answer and the button never refuses one: unlike a block reason,
 * whose whole purpose is to record a judgement, most households need no note at all.
 */

import { useActionState, useState } from "react";
import { de } from "@/i18n/de";
import { updateNotesAction } from "./actions";
import { SaveButton, SaveFeedback } from "./record-forms";
import { initialRecordFormState } from "./record-state";

export function NotesEditor({
  customerId,
  notes,
}: {
  customerId: number;
  notes: string;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(updateNotesAction, initialRecordFormState);
  const [text, setText] = useState(notes);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground/70">{de.customers.fields.notes}</span>
        <textarea
          name="notes"
          rows={4}
          data-testid="notes-field"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="w-full rounded border border-foreground/20 bg-transparent px-3 py-2"
        />
      </label>
      <p className="max-w-prose text-sm text-foreground/70">{de.customers.record.notesHint}</p>
      <SaveButton label={de.customers.record.notesSubmit} pending={pending} testId="notes-submit" />
      <SaveFeedback state={state} testId="notes" />
    </form>
  );
}
