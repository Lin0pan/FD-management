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
import { de } from "@/i18n/de";
import { removeApplicantAction } from "./actions";
import { initialRemoveApplicantState } from "./waiting-list-state";

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

  return (
    <details className="rounded border border-foreground/20">
      <summary data-testid="waiting-list-remove-open" className="cursor-pointer px-4 py-2 text-sm">
        {de.waitingList.remove.action}
      </summary>
      <form action={action} className="flex flex-col gap-3 px-4 pb-4">
        <input type="hidden" name="entryId" value={entryId} />
        <p
          data-testid="waiting-list-remove-confirm"
          className="max-w-prose rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          {de.waitingList.remove.confirm(applicant)}
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground/70">{de.waitingList.remove.reasonLabel}</span>
          <textarea
            name="reason"
            rows={2}
            required
            data-testid="waiting-list-remove-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded border border-foreground/20 bg-transparent px-3 py-2"
          />
          <span className="text-xs text-foreground/60">{de.waitingList.remove.reasonHint}</span>
        </label>
        <div>
          <button
            type="submit"
            disabled={reason.trim() === "" || pending}
            data-testid="waiting-list-remove-submit"
            className="rounded bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60"
          >
            {pending ? de.waitingList.remove.submitting : de.waitingList.remove.submit}
          </button>
        </div>
        {state.status === "error" ? (
          <p
            role="status"
            data-testid="waiting-list-remove-error"
            className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
