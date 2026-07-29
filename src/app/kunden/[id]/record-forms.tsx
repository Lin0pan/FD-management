"use client";

/**
 * The pieces every editing form on the customer record is built from (US-16.5).
 *
 * The record carries five independent forms — household, personal data, notes, group and a renewed
 * certificate — and each needs the same three things: a labelled field, a save button that says it
 * is saving, and one line beneath it reporting what the server answered. Repeating those five times
 * is how five forms end up confirming a save in four different words.
 *
 * Nothing here decides anything, and nothing here holds state: each form owns its own
 * `useActionState` and hands the result down.
 */

import type { RecordFormState } from "./record-state";
import { de } from "@/i18n/de";

export const fieldClass = "w-full rounded border border-foreground/20 bg-transparent px-2 py-1";

export function TextField({
  name,
  label,
  value,
  onChange,
  type = "text",
  testId,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
  testId?: string;
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-foreground/70">{label}</span>
      <input
        className={fieldClass}
        type={type}
        name={name}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/**
 * The save button of one form, disabled while its own submission is in flight.
 *
 * Each form has its own, and they are labelled after what they save rather than all saying
 * "Speichern": five identical buttons on one screen are indistinguishable to anyone reading the page
 * by keyboard or screen reader, and it is the record's whole point that the five saves are five
 * different decisions.
 */
export function SaveButton({
  label,
  pending,
  disabled = false,
  testId,
}: {
  label: string;
  pending: boolean;
  disabled?: boolean;
  testId: string;
}): React.ReactElement {
  return (
    <div>
      <button
        type="submit"
        disabled={pending || disabled}
        data-testid={testId}
        className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-60"
      >
        {pending ? de.customers.record.saving : label}
      </button>
    </div>
  );
}

/**
 * What the server said about the last submission of one form: nothing, saved, or a refusal.
 *
 * The confirmation is stated rather than left to the values changing on screen, because most of
 * these edits look identical afterwards — a corrected spelling, a note reworded — and "did that
 * save?" is otherwise a question the screen cannot answer.
 */
export function SaveFeedback({
  state,
  testId,
  savedText = de.customers.record.saved,
}: {
  state: RecordFormState;
  /** Prefix for the two test ids: `<testId>-saved` and `<testId>-error`. */
  testId: string;
  /** The confirmation's words, where a form has something more to say than "gespeichert". */
  savedText?: string;
}): React.ReactElement | null {
  if (state.status === "saved") {
    return (
      <p
        role="status"
        data-testid={`${testId}-saved`}
        className="max-w-prose rounded border border-green-600/40 bg-green-600/10 px-3 py-2"
      >
        {savedText}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p
        role="status"
        data-testid={`${testId}-error`}
        className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
      >
        {state.message}
      </p>
    );
  }
  return null;
}
