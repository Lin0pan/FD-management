"use client";

/**
 * The archive control (`tasks/prd-us-10-archive-customer.md` §US-10.4), the same component on the
 * record and the counter — so archiving cannot mean two different things depending on where it was
 * started.
 *
 * A client component for `useActionState` and because the save stays disabled until a reason has been
 * typed: the reason is the whole record of an irreversible decision (FR-1). No rules here.
 *
 * A **closed disclosure with a confirmation inside it**, never a dialog: at the counter, something
 * that had to be dismissed before the next customer could be served would be worse than none (PRD §6).
 */

import { useActionState, useId, useState } from "react";
import { Archive } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerStatus } from "@/domain/customer/customer";
import { de } from "@/i18n/de";
import { archiveCustomerAction } from "./archive-actions";
import { initialArchiveState } from "./archive-state";
import { ControlSummary } from "../disclosure";
import { Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";

export function ArchiveControls({
  customerId,
  customerNumber,
  status,
  returnTo,
}: {
  customerId: number;
  /** Named in the confirmation, because it is the number that goes back into circulation. */
  customerNumber: number;
  status: CustomerStatus;
  /**
   * The screen this control is standing on, which a successful archive navigates back to — the control
   * is at the foot of a long page and the sentence stating what happened is at the head.
   */
  returnTo: string;
}): React.ReactElement | null {
  const [state, action, pending] = useActionState(archiveCustomerAction, initialArchiveState);
  const showing = useNoticeSlot("archive", state.status === "idle" ? null : state);
  const [reason, setReason] = useState("");
  const reasonId = useId();

  // No transition out of ARCHIVED, so the control is absent rather than disabled. A blocked
  // household may still leave the register.
  if (status === "ARCHIVED") {
    return null;
  }

  return (
    <details className="group">
      <ControlSummary testId="archive-open">
        <Archive aria-hidden="true" data-icon="inline-start" />
        {de.customers.archive.action}
      </ControlSummary>
      <form action={action} className="mt-3 flex flex-col items-start gap-3">
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        {/* Destructive rather than amber: amber states a lapsed certificate or reports a refused
            act (`REFUSAL_ACCENT`), and this is a step about to be taken — the one on the card that
            cannot be typed over afterwards. */}
        <Alert variant="destructive">
          <AlertDescription data-testid="archive-confirm" className="max-w-prose">
            {de.customers.archive.confirm(customerNumber)}
          </AlertDescription>
        </Alert>
        <div className="flex w-full max-w-prose flex-col gap-1">
          <label htmlFor={reasonId} className="text-sm font-medium">
            {de.customers.archive.reasonLabel}
          </label>
          <Textarea
            id={reasonId}
            name="reason"
            rows={3}
            required
            data-testid="archive-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="destructive"
          disabled={reason.trim() === "" || pending}
          data-testid="archive-submit"
        >
          {pending ? de.customers.archive.submitting : de.customers.archive.submit}
        </Button>
        {showing && state.status === "error" ? (
          <Notice tone={state.tier} text={state.message} testId="archive-error" />
        ) : null}
      </form>
    </details>
  );
}
