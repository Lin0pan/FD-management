"use client";

/**
 * The row's „Gedruckt" and the notice's „Rückgängig" — client components only so that a refusal
 * lands beside the button that caused it (`useActionState`). No confirmation step: the undo offered
 * right after is the safety net (D7).
 */

import { useActionState } from "react";
import { Printer, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { de } from "@/i18n/de";
import { markCardPrintedAction, undoCardPrintedAction } from "./actions";
import { initialPrintState } from "./print-state";
import { Notice } from "../notice";

function CardFields({ customerId, index }: { customerId: number; index: number }) {
  return (
    <>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="index" value={index} />
    </>
  );
}

export function MarkPrintedControl({
  customerId,
  index,
  cardNumber,
}: {
  customerId: number;
  index: number;
  cardNumber: string;
}): React.ReactElement {
  const [state, action, pending] = useActionState(markCardPrintedAction, initialPrintState);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <CardFields customerId={customerId} index={index} />
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        data-testid="cards-to-print-submit"
      >
        <Printer aria-hidden="true" data-icon="inline-start" />
        {pending ? de.cardsToPrint.submitting : de.cardsToPrint.submit}
        <span className="sr-only">{de.cardsToPrint.submitCard(cardNumber)}</span>
      </Button>
      {state.status === "error" ? (
        <Notice tone={state.tier} text={state.message} testId="cards-to-print-error" />
      ) : null}
    </form>
  );
}

export function UndoPrintedControl({
  customerId,
  index,
}: {
  customerId: number;
  index: number;
}): React.ReactElement {
  const [state, action, pending] = useActionState(undoCardPrintedAction, initialPrintState);
  return (
    <form action={action} className="mt-2 flex flex-col items-start gap-2">
      <CardFields customerId={customerId} index={index} />
      <Button type="submit" variant="outline" disabled={pending} data-testid="cards-to-print-undo">
        <Undo2 aria-hidden="true" data-icon="inline-start" />
        {pending ? de.cardsToPrint.undoing : de.cardsToPrint.undo}
      </Button>
      {state.status === "error" ? (
        <Notice tone={state.tier} text={state.message} testId="cards-to-print-undo-error" />
      ) : null}
    </form>
  );
}
