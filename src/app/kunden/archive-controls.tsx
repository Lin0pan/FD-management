"use client";

/**
 * The archive control (tasks/prd-us-10-archive-customer.md §US-10.4), shared by the customer record
 * and the counter — the same component on both screens, so archiving cannot mean two different things
 * depending on where it was started.
 *
 * A client component because two things need the browser: `useActionState` reports a rejection back
 * beside the button, and the save control stays disabled until a reason has been typed (the reason is
 * the whole record of an irreversible decision — FR-1). It holds no rules; whether the household may
 * be archived is decided behind `archiveCustomer`.
 *
 * It is a **closed disclosure with a confirmation inside it**, never a dialog and never a prompt: at
 * the counter the queue is waiting, and an archive suggestion that had to be dismissed before the
 * next customer could be served would be worse than none (PRD §6). Nothing here opens by itself, and
 * the household's own record stays reachable while it is open.
 */

import { useActionState, useState } from "react";
import type { CustomerStatus } from "@/domain/customer/customer";
import { de } from "@/i18n/de";
import { archiveCustomerAction } from "./archive-actions";
import { initialArchiveState } from "./archive-state";

export function ArchiveControls({
  customerId,
  customerNumber,
  status,
}: {
  customerId: number;
  /** Named in the confirmation, because it is the number that goes back into circulation. */
  customerNumber: number;
  status: CustomerStatus;
}): React.ReactElement | null {
  const [state, action, pending] = useActionState(archiveCustomerAction, initialArchiveState);
  const [reason, setReason] = useState("");

  // An archived household has nowhere left to go: there is no transition out of ARCHIVED, so the
  // control is absent rather than disabled. A blocked one may still leave the register.
  if (status === "ARCHIVED") {
    return null;
  }

  return (
    <details className="rounded border border-foreground/20">
      <summary data-testid="archive-open" className="cursor-pointer px-4 py-2 font-medium">
        {de.customers.archive.action}
      </summary>
      <form action={action} className="flex flex-col gap-3 px-4 pb-4">
        <input type="hidden" name="customerId" value={customerId} />
        <p
          data-testid="archive-confirm"
          className="max-w-prose rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2"
        >
          {de.customers.archive.confirm(customerNumber)}
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground/70">{de.customers.archive.reasonLabel}</span>
          <textarea
            name="reason"
            rows={3}
            required
            data-testid="archive-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded border border-foreground/20 bg-transparent px-3 py-2"
          />
          <span className="text-xs text-foreground/60">{de.customers.archive.reasonHint}</span>
        </label>
        <div>
          <button
            type="submit"
            disabled={reason.trim() === "" || pending}
            data-testid="archive-submit"
            className="rounded bg-foreground px-6 py-3 font-semibold text-background disabled:opacity-60"
          >
            {pending ? de.customers.archive.submitting : de.customers.archive.submit}
          </button>
        </div>
        {state.status === "error" ? (
          <p
            role="status"
            data-testid="archive-error"
            className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
