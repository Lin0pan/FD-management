"use client";

/**
 * Taking an applicant off the waiting list (US-12.4, FR-6).
 *
 * Modelled on the archive control, and for the same reason: the save stays disabled until a reason
 * has been typed, and the confirmation is stated inside a closed disclosure rather than in a dialog,
 * so nothing has to be dismissed before the rest of the list can be read.
 *
 * What the confirmation says is the thing staff would otherwise ring up about — the entry is kept,
 * not deleted, because a waiting list that has lost the people who left it can no longer show that
 * the longest wait was served first (FR-7).
 */

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { de } from "@/i18n/de";
import { removeApplicantAction } from "./actions";
import { initialRemoveApplicantState } from "./waiting-list-state";
import { Notice } from "../notice";

export function RemoveApplicantControls({
  entryId,
  applicant,
}: {
  entryId: number;
  /** Named in the confirmation — the list is short, and the rows differ only by name. */
  applicant: string;
}): React.ReactElement {
  const [state, action, pending] = useActionState(
    removeApplicantAction,
    initialRemoveApplicantState,
  );
  const [reason, setReason] = useState("");
  // One of these renders per row, so the id a label points at cannot be a constant.
  const reasonId = `waiting-list-remove-reason-${entryId}`;

  return (
    <details className="text-sm">
      {/* A quiet summary, not a 780px slab: this is the rarest act on the screen and it should not
          be the first thing the eye lands on in every row. It stays a `<details>` — nothing may have
          to be dismissed before the rest of the list can be read. */}
      <summary
        data-testid="waiting-list-remove-open"
        className="w-fit cursor-pointer list-none rounded-md px-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
      >
        {de.waitingList.remove.action}
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="entryId" value={entryId} />
        {/* Red, not amber. Amber says one of two things here — a certificate has lapsed, or an act
            was refused and nothing is broken (`REFUSAL_ACCENT`) — and this is neither: it is a
            caution before an act that takes somebody off a queue they have stood in for months, and
            it is about to happen rather than having been declined. */}
        <Alert variant="destructive">
          <AlertDescription data-testid="waiting-list-remove-confirm" className="max-w-prose">
            {de.waitingList.remove.confirm(applicant)}
          </AlertDescription>
        </Alert>
        <div className="flex flex-col gap-1">
          <Label htmlFor={reasonId}>{de.waitingList.remove.reasonLabel}</Label>
          <Textarea
            id={reasonId}
            name="reason"
            rows={2}
            required
            data-testid="waiting-list-remove-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">{de.waitingList.remove.reasonHint}</span>
        </div>
        <Button
          type="submit"
          variant="destructive"
          className="self-start"
          disabled={reason.trim() === "" || pending}
          data-testid="waiting-list-remove-submit"
        >
          {pending ? de.waitingList.remove.submitting : de.waitingList.remove.submit}
        </Button>
        {state.status === "error" && state.message !== undefined ? (
          <Notice tone="error" text={state.message} testId="waiting-list-remove-error" />
        ) : null}
      </form>
    </details>
  );
}
