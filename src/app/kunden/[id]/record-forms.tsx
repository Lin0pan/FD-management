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

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RecordFormState } from "./record-state";
import { de } from "@/i18n/de";
import { useNoticeSlot } from "../../notice-board";
import { Notice } from "../../notice";

/**
 * The field grid the record's forms are laid out on: twelve columns at `lg`, two at `sm`, one
 * below. The same scheme `/kunden/neu` uses, so a house number is not as wide as a street on either
 * screen.
 */
export const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12";

/**
 * The action row at the foot of one form: the save, and what the server said about the last one.
 * Ruled off, so a reader can see where the form it belongs to ends — which is most of what a card
 * buys a screen carrying five of them.
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
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
  testId?: string;
  /** Columns of twelve at `lg` — a field's width is what it promises about its contents. */
  span?: string;
}): React.ReactElement {
  // Generated rather than taken from `name`: two forms on this record both hold a `firstName`, and
  // duplicate ids would point every label at whichever came first.
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${span}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type={type}
        name={name}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
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
    <Button type="submit" disabled={pending || disabled} data-testid={testId}>
      {pending ? de.customers.record.saving : label}
    </Button>
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
  // The record carries five of these plus the reissue, the block and the archive; the board is what
  // stops the fourth one's „Gespeichert." from still being on screen under the eighth one's button.
  const showing = useNoticeSlot(testId, state.status === "idle" ? null : state);
  if (!showing) {
    return null;
  }
  if (state.status === "saved") {
    // Green, like every other write that went through. This was neutral on the argument that a save
    // is not the completion of an *act* the way a hand-out is — a distinction that is real and that
    // nobody at a counter needs to make. What it cost was measurable: five forms on this screen
    // answering in a white box on the same surface as the card behind it, which is a poor answer to
    // the question they exist for (`docs/ui_action_feedback_review.md` §2.1).
    return <Notice tone="success" text={savedText} testId={`${testId}-saved`} />;
  }
  if (state.status === "error") {
    return <Notice tone={state.tier} text={state.message} testId={`${testId}-error`} />;
  }
  return null;
}
