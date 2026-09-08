"use client";

/**
 * The pieces every editing form on the customer record is built from (US-16.5): a field that can mark
 * itself, a save button that says it is saving, and a line reporting what the server answered.
 * Repeating those five times is how five forms end up confirming a save in four different words.
 *
 * Nothing here decides anything and nothing holds state — each form owns its own `useActionState`.
 */

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import type { RecordFormState } from "./record-state";
import { de } from "@/i18n/de";
import { FieldRejection } from "../../field-mark";
import { marking } from "../../field-refusal";
import { useNoticeSlot } from "../../notice-board";
import { Notice } from "../../notice";

/** The field grid, the same scheme `/kunden/neu` uses: a house number is not as wide as a street. */
export const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12";

/**
 * The action row at the foot of one form. Ruled off, so a reader can see where the form ends — most
 * of what a card buys a screen carrying five of them.
 */
export function FormFooter({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-col items-start gap-3 border-t border-border pt-4">{children}</div>
  );
}

export function TextField({
  name,
  label,
  value,
  onChange,
  type = "text",
  testId,
  span = "sm:col-span-2 lg:col-span-4",
  problem = null,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
  testId?: string;
  /** Columns of twelve at `lg` — a field's width is what it promises about its contents. */
  span?: string;
  /** The words to show under the control, or `null` while nothing is wrong with it. */
  problem?: string | null;
}): React.ReactElement {
  // Generated rather than taken from `name`: two forms on this record both hold a `firstName`. Which
  // is why the mark is addressed by `data-field` instead — the path is the one name the action and
  // the control agree on, and the action cannot know what `useId` produced.
  const id = useId();
  const marks = marking(name, id, problem);
  return (
    <div className={`flex flex-col gap-1.5 ${span}`}>
      <label
        htmlFor={id}
        className={`text-sm font-medium ${problem === null ? "" : "text-destructive"}`.trimEnd()}
      >
        {label}
      </label>
      {type === "date" ? (
        <DateInput
          id={id}
          name={name}
          data-testid={testId}
          placeholder={de.day.placeholder}
          value={value}
          onChange={onChange}
          {...marks}
        />
      ) : (
        <Input
          id={id}
          type="text"
          name={name}
          data-testid={testId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...marks}
        />
      )}
      {problem === null ? null : <RecordRejection id={id} problem={problem} />}
    </div>
  );
}

/**
 * The words under a refused control, shared by all five of the record's forms — a spec that counts
 * the marks on this page is asking about the page.
 *
 * **The marks are deliberately not governed by the `NoticeBoard`**: a mark is not a confirmation. If
 * the household is refused and the note is then saved, the board hands the slot to the note and the
 * household's rows stay red — because the birthdate in row three is still unreadable.
 */
export function RecordRejection({
  id,
  problem,
}: {
  id: string;
  problem: string;
}): React.ReactElement {
  return <FieldRejection id={id} problem={problem} testId="record-field-error" />;
}

/**
 * The save button of one form, disabled while its own submission is in flight and labelled after what
 * it saves: five identical „Speichern“ are indistinguishable by keyboard or screen reader, and the
 * record's whole point is that the five saves are five decisions.
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
    <Button type="submit" disabled={pending || disabled} data-testid={testId}>
      {pending ? de.customers.record.saving : label}
    </Button>
  );
}

/**
 * What the server said about the last submission of one form. Stated rather than left to the values
 * changing, because most of these edits look identical afterwards and "did that save?" is otherwise a
 * question the screen cannot answer.
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
  // Eight write controls on this record; the board is what stops the fourth one's „Gespeichert.“
  // from still being on screen under the eighth one's button.
  const showing = useNoticeSlot(testId, state.status === "idle" ? null : state);
  if (!showing) {
    return null;
  }
  if (state.status === "saved") {
    // Green, like every other write that went through: a white box on the same surface as the card
    // behind it is a poor answer to the question a confirmation exists for.
    return <Notice tone="success" text={savedText} testId={`${testId}-saved`} />;
  }
  if (state.status === "error") {
    return <Notice tone={state.tier} text={state.message} testId={`${testId}-error`} />;
  }
  return null;
}
